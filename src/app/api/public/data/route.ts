import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

// Public endpoint — no auth required. Looks up client by share_token.
export async function GET(request: NextRequest) {
  const sb = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  let period = searchParams.get("period");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Resolve token → client
  const { data: client, error: clientErr } = await sb
    .from("clients")
    .select("id, name, slug")
    .eq("share_token", token)
    .eq("is_active", true)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Link non valido o scaduto" }, { status: 404 });
  }

  const clientId = client.id;

  // Determine period
  if (!period) {
    const { data: latest } = await sb.from("monthly_summary").select("period").eq("client_id", clientId).order("period", { ascending: false }).limit(1).single();
    period = latest?.period || "";
  }
  if (!period) {
    const queries = [
      sb.from("sales_by_category").select("period").eq("client_id", clientId).order("period", { ascending: false }).limit(1).single(),
      sb.from("bank_transactions").select("period").eq("client_id", clientId).order("period", { ascending: false }).limit(1).single(),
      sb.from("payroll").select("period").eq("client_id", clientId).order("period", { ascending: false }).limit(1).single(),
    ];
    const results = await Promise.all(queries);
    const periods = results.map((r) => r.data?.period).filter(Boolean) as string[];
    period = periods.sort().reverse()[0] || "";
  }
  if (!period) {
    return NextResponse.json({ error: "Nessun dato disponibile" }, { status: 404 });
  }

  // Previous period
  const [yearStr, monthStr] = period.split("-");
  const yr = parseInt(yearStr), mo = parseInt(monthStr);
  const prevMonth = mo === 1 ? 12 : mo - 1;
  const prevYear = mo === 1 ? yr - 1 : yr;
  const prevPeriod = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  // Fetch all data in parallel
  const [
    { data: summary },
    { data: sales },
    { data: revenues },
    { data: expenses },
    { data: payrollData },
    { data: bankTx },
    { data: amexTx },
    { data: allSummaries },
    { data: prevSales },
    { data: prevPayroll },
    { data: prevBankTx },
    { data: prevAmexTx },
    { data: allSalesPeriods },
    { data: allBankPeriods },
    { data: allPayrollPeriods },
    { data: invoicesData },
    { data: prevInvoices },
    { data: allInvoicePeriods },
  ] = await Promise.all([
    sb.from("monthly_summary").select("*").eq("client_id", clientId).eq("period", period).single(),
    sb.from("sales_by_category").select("*").eq("client_id", clientId).eq("period", period).order("net_sales", { ascending: false }),
    sb.from("revenue_lines").select("*").eq("client_id", clientId).eq("period", period),
    sb.from("expense_lines").select("*").eq("client_id", clientId).eq("period", period),
    sb.from("payroll").select("*").eq("client_id", clientId).eq("period", period).order("gross_pay", { ascending: false }),
    sb.from("bank_transactions").select("*").eq("client_id", clientId).eq("period", period).order("transaction_date", { ascending: true }),
    sb.from("amex_transactions").select("*").eq("client_id", clientId).eq("period", period).order("operation_date", { ascending: true }),
    sb.from("monthly_summary").select("*").eq("client_id", clientId).order("period", { ascending: true }).limit(24),
    sb.from("sales_by_category").select("net_sales,sold_quantity,vat_amount,sales_with_vat,net_discount").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("payroll").select("gross_pay,net_pay,social_contributions,irpef,tfr_month").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("bank_transactions").select("amount,category,subcategory,running_balance").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("amex_transactions").select("amount_eur").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("sales_by_category").select("period").eq("client_id", clientId),
    sb.from("bank_transactions").select("period").eq("client_id", clientId),
    sb.from("payroll").select("period").eq("client_id", clientId),
    sb.from("invoices").select("*").eq("client_id", clientId).eq("period", period).order("supplier_name", { ascending: true }),
    sb.from("invoices").select("amount").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("invoices").select("period").eq("client_id", clientId),
  ]);

  // Available periods
  const periodSet = new Set<string>();
  (allSummaries || []).forEach((s: any) => periodSet.add(s.period));
  (allSalesPeriods || []).forEach((s: any) => periodSet.add(s.period));
  (allBankPeriods || []).forEach((s: any) => periodSet.add(s.period));
  (allPayrollPeriods || []).forEach((s: any) => periodSet.add(s.period));
  (allInvoicePeriods || []).forEach((s: any) => periodSet.add(s.period));
  const availablePeriods = Array.from(periodSet).sort().reverse();

  // Sales aggregates
  const sa = {
    total_net_sales: (sales || []).reduce((s: number, c: any) => s + (c.net_sales || 0), 0),
    total_vat: (sales || []).reduce((s: number, c: any) => s + (c.vat_amount || 0), 0),
    total_with_vat: (sales || []).reduce((s: number, c: any) => s + (c.sales_with_vat || 0), 0),
    total_qty: (sales || []).reduce((s: number, c: any) => s + (c.sold_quantity || 0), 0),
    total_discount: (sales || []).reduce((s: number, c: any) => s + (c.net_discount || 0), 0),
    category_count: sales?.length || 0,
  };
  const prevSa = {
    total_net_sales: (prevSales || []).reduce((s: number, c: any) => s + (c.net_sales || 0), 0),
    total_qty: (prevSales || []).reduce((s: number, c: any) => s + (c.sold_quantity || 0), 0),
  };

  // Bank aggregates
  const bankIn = (bankTx || []).filter((t: any) => t.amount > 0);
  const bankOut = (bankTx || []).filter((t: any) => t.amount < 0);
  const ba = {
    total_in: bankIn.reduce((s: number, t: any) => s + t.amount, 0),
    total_out: bankOut.reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
    opening_balance: bankTx?.length ? (bankTx as any[])[0]?.running_balance : 0,
    closing_balance: bankTx?.length ? (bankTx as any[])[bankTx.length - 1]?.running_balance : 0,
    transaction_count: bankTx?.length || 0,
  };
  const prevBa = {
    total_in: (prevBankTx || []).filter((t: any) => t.amount > 0).reduce((s: number, t: any) => s + t.amount, 0),
    total_out: (prevBankTx || []).filter((t: any) => t.amount < 0).reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
  };

  // Cost breakdown by cost_category (bank + amex combined)
  // Only count transactions WITH a cost_category — unclassified ones are excluded from costs
  const costBreakdown: Record<string, number> = {};
  for (const tx of bankOut) {
    if (!tx.cost_category) continue;
    costBreakdown[tx.cost_category] = (costBreakdown[tx.cost_category] || 0) + Math.abs(tx.amount);
  }
  for (const tx of (amexTx || [])) {
    if (tx.amount_eur > 0 && tx.cost_category) {
      costBreakdown[tx.cost_category] = (costBreakdown[tx.cost_category] || 0) + Math.abs(tx.amount_eur);
    }
  }

  // Bank income breakdown
  // 1. All transactions with income_category set (positive OR negative) — explicit user assignments
  // 2. Positive transactions without income_category — use auto-mapping or subcategory
  const CONTO_CORRENTE_PATTERNS = ["BONIFICO A VOSTRO FAVORE", "BONIFICO DALL'ESTERO", "VERSAMENTO CONTANTE SELF"];
  const bankIncomeBreakdown: Record<string, number> = {};
  for (const tx of (bankTx || [])) {
    if (tx.income_category) {
      bankIncomeBreakdown[tx.income_category] = (bankIncomeBreakdown[tx.income_category] || 0) + tx.amount;
    } else if (tx.amount > 0) {
      const raw = tx.subcategory || tx.category || "Altro";
      const key = CONTO_CORRENTE_PATTERNS.some((p: string) => raw.toUpperCase().includes(p.toUpperCase())) ? "CONTO CORRENTE" : raw;
      bankIncomeBreakdown[key] = (bankIncomeBreakdown[key] || 0) + tx.amount;
    }
  }

  // Daily bank balance
  const dayMap = new Map<string, { balance: number; inflow: number; outflow: number }>();
  for (const tx of (bankTx || [])) {
    const d = tx.transaction_date;
    const existing = dayMap.get(d) || { balance: 0, inflow: 0, outflow: 0 };
    existing.balance = tx.running_balance;
    if (tx.amount > 0) existing.inflow += tx.amount;
    else existing.outflow += Math.abs(tx.amount);
    dayMap.set(d, existing);
  }
  const dailyBalance = Array.from(dayMap.entries())
    .map(([date, vals]) => ({ date, ...vals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Amex aggregates
  const amexAgg = {
    total_charges: (amexTx || []).filter((t: any) => t.amount_eur > 0).reduce((s: number, t: any) => s + t.amount_eur, 0),
    total_credits: (amexTx || []).filter((t: any) => t.amount_eur < 0).reduce((s: number, t: any) => s + Math.abs(t.amount_eur), 0),
    count: amexTx?.length || 0,
  };
  const amexByCategory: Record<string, number> = {};
  for (const tx of (amexTx || [])) {
    const key = tx.category || "Altro";
    amexByCategory[key] = (amexByCategory[key] || 0) + Math.abs(tx.amount_eur);
  }
  const prevAmexTotal = (prevAmexTx || []).reduce((s: number, t: any) => s + Math.abs(t.amount_eur || 0), 0);

  // Payroll aggregates
  const pa = {
    total_gross: (payrollData || []).reduce((s: number, p: any) => s + (p.gross_pay || 0), 0),
    total_net: (payrollData || []).reduce((s: number, p: any) => s + (p.net_pay || 0), 0),
    total_contributions: (payrollData || []).reduce((s: number, p: any) => s + (p.social_contributions || 0), 0),
    total_irpef: (payrollData || []).reduce((s: number, p: any) => s + (p.irpef || 0), 0),
    total_tfr: (payrollData || []).reduce((s: number, p: any) => s + (p.tfr_month || 0), 0),
    total_deductions: (payrollData || []).reduce((s: number, p: any) => s + (p.total_deductions || 0), 0),
    employee_count: payrollData?.length || 0,
    avg_gross: payrollData?.length ? (payrollData.reduce((s: number, p: any) => s + (p.gross_pay || 0), 0) / payrollData.length) : 0,
    avg_net: payrollData?.length ? (payrollData.reduce((s: number, p: any) => s + (p.net_pay || 0), 0) / payrollData.length) : 0,
  };
  const prevPa = {
    total_gross: (prevPayroll || []).reduce((s: number, p: any) => s + (p.gross_pay || 0), 0),
    total_net: (prevPayroll || []).reduce((s: number, p: any) => s + (p.net_pay || 0), 0),
    employee_count: prevPayroll?.length || 0,
  };

  // Invoices aggregates
  const invTotal = (invoicesData || []).reduce((s: number, inv: any) => s + (inv.amount || 0), 0);
  const prevInvTotal = (prevInvoices || []).reduce((s: number, inv: any) => s + (inv.amount || 0), 0);
  const invByCategory: Record<string, number> = {};
  for (const inv of (invoicesData || [])) {
    const key = inv.category_name || "Altro";
    invByCategory[key] = (invByCategory[key] || 0) + (inv.amount || 0);
  }
  const invBySupplier: Record<string, number> = {};
  for (const inv of (invoicesData || [])) {
    const key = inv.supplier_name || "Altro";
    invBySupplier[key] = (invBySupplier[key] || 0) + (inv.amount || 0);
  }

  // Percentage changes
  const pctChange = (curr: number, prev: number) => prev ? ((curr - prev) / Math.abs(prev)) * 100 : null;

  const changes = {
    sales_net: pctChange(sa.total_net_sales, prevSa.total_net_sales),
    sales_qty: pctChange(sa.total_qty, prevSa.total_qty),
    payroll_gross: pctChange(pa.total_gross, prevPa.total_gross),
    bank_in: pctChange(ba.total_in, prevBa.total_in),
    bank_out: pctChange(ba.total_out, prevBa.total_out),
    amex: pctChange(amexAgg.total_charges, prevAmexTotal),
    invoices: pctChange(invTotal, prevInvTotal),
  };

  // Incidence ratios
  const totalCostiPersonale = pa.total_gross + pa.total_tfr;

  const incidence = {
    staff_on_sales: sa.total_net_sales > 0 ? (totalCostiPersonale / sa.total_net_sales) * 100 : 0,
    amex_on_sales: sa.total_net_sales > 0 ? (amexAgg.total_charges / sa.total_net_sales) * 100 : 0,
    discount_on_gross: sa.total_with_vat > 0 ? (sa.total_discount / sa.total_with_vat) * 100 : 0,
    vat_rate_avg: sa.total_net_sales > 0 ? (sa.total_vat / sa.total_net_sales) * 100 : 0,
  };

  return NextResponse.json({
    client_name: client.name,
    period,
    prev_period: prevPeriod,
    available_periods: availablePeriods,
    summary,
    sales: { data: sales || [], aggregates: sa },
    revenues: revenues || [],
    expenses: expenses || [],
    payroll: { data: payrollData || [], aggregates: pa },
    bank: {
      transactions: bankTx || [],
      aggregates: ba,
      cost_breakdown: Object.entries(costBreakdown).map(([name, value]) => ({ name, value })).sort((a, b) => (b.value as number) - (a.value as number)),
      income_breakdown: Object.entries(bankIncomeBreakdown).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      daily_balance: dailyBalance,
    },
    amex: {
      transactions: amexTx || [],
      aggregates: amexAgg,
      by_category: Object.entries(amexByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    },
    invoices: {
      data: invoicesData || [],
      total: invTotal,
      count: (invoicesData || []).length,
      by_category: Object.entries(invByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      by_supplier: Object.entries(invBySupplier).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    },
    trends: { monthly: allSummaries || [] },
    changes,
    incidence,
    computed: {
      total_costi_personale: totalCostiPersonale,
      total_spese_banca: Object.values(costBreakdown).reduce((s, v) => s + v, 0),
      total_spese_amex: amexAgg.total_charges,
      total_fatture: invTotal,
    },
  });
}
