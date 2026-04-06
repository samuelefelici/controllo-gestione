import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sb = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  let period = searchParams.get("period");
  const clientId = searchParams.get("client_id");
  const section = searchParams.get("section");

  if (!clientId) {
    return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
  }

  if (section === "uploads") {
    const { data: uploads } = await sb.from("file_uploads").select("*").eq("client_id", clientId).order("uploaded_at", { ascending: false }).limit(20);
    return NextResponse.json({ uploads: uploads || [] });
  }
  if (section === "batches") {
    const { data: batches } = await sb.from("import_batches").select("*").eq("client_id", clientId).order("imported_at", { ascending: false }).limit(50);
    return NextResponse.json({ batches: batches || [] });
  }

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
    const periods = results.map(r => r.data?.period).filter(Boolean) as string[];
    period = periods.sort().reverse()[0] || "";
  }
  if (!period) return NextResponse.json({ error: "No data available" }, { status: 404 });

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
    { data: uploads },
    { data: prevSales },
    { data: prevPayroll },
    { data: prevBankTx },
    { data: prevAmexTx },
    { data: allSalesPeriods },
    { data: allBankPeriods },
    { data: allPayrollPeriods },
  ] = await Promise.all([
    sb.from("monthly_summary").select("*").eq("client_id", clientId).eq("period", period).single(),
    sb.from("sales_by_category").select("*").eq("client_id", clientId).eq("period", period).order("net_sales", { ascending: false }),
    sb.from("revenue_lines").select("*").eq("client_id", clientId).eq("period", period),
    sb.from("expense_lines").select("*").eq("client_id", clientId).eq("period", period),
    sb.from("payroll").select("*").eq("client_id", clientId).eq("period", period).order("gross_pay", { ascending: false }),
    sb.from("bank_transactions").select("*").eq("client_id", clientId).eq("period", period).order("transaction_date", { ascending: true }),
    sb.from("amex_transactions").select("*").eq("client_id", clientId).eq("period", period).order("operation_date", { ascending: true }),
    sb.from("monthly_summary").select("*").eq("client_id", clientId).order("period", { ascending: true }).limit(24),
    sb.from("file_uploads").select("*").eq("client_id", clientId).order("uploaded_at", { ascending: false }).limit(20),
    sb.from("sales_by_category").select("net_sales,sold_quantity,vat_amount,sales_with_vat,net_discount").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("payroll").select("gross_pay,net_pay,social_contributions,irpef,tfr_month").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("bank_transactions").select("amount,category,subcategory,running_balance").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("amex_transactions").select("amount_eur").eq("client_id", clientId).eq("period", prevPeriod),
    sb.from("sales_by_category").select("period").eq("client_id", clientId),
    sb.from("bank_transactions").select("period").eq("client_id", clientId),
    sb.from("payroll").select("period").eq("client_id", clientId),
  ]);

  // Available periods
  const periodSet = new Set<string>();
  (allSummaries || []).forEach((s: any) => periodSet.add(s.period));
  (allSalesPeriods || []).forEach((s: any) => periodSet.add(s.period));
  (allBankPeriods || []).forEach((s: any) => periodSet.add(s.period));
  (allPayrollPeriods || []).forEach((s: any) => periodSet.add(s.period));
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

  // Bank cost breakdown by subcategory
  const bankCostBreakdown: Record<string, number> = {};
  for (const tx of bankOut) {
    const key = tx.subcategory || tx.category || "Altro";
    bankCostBreakdown[key] = (bankCostBreakdown[key] || 0) + Math.abs(tx.amount);
  }

  // Bank income breakdown
  const bankIncomeBreakdown: Record<string, number> = {};
  for (const tx of bankIn) {
    const key = tx.subcategory || tx.category || "Altro";
    bankIncomeBreakdown[key] = (bankIncomeBreakdown[key] || 0) + tx.amount;
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

  // Percentage changes
  const pctChange = (curr: number, prev: number) => prev ? ((curr - prev) / Math.abs(prev)) * 100 : null;

  const changes = {
    sales_net: pctChange(sa.total_net_sales, prevSa.total_net_sales),
    sales_qty: pctChange(sa.total_qty, prevSa.total_qty),
    payroll_gross: pctChange(pa.total_gross, prevPa.total_gross),
    bank_in: pctChange(ba.total_in, prevBa.total_in),
    bank_out: pctChange(ba.total_out, prevBa.total_out),
    amex: pctChange(amexAgg.total_charges, prevAmexTotal),
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
      cost_breakdown: Object.entries(bankCostBreakdown).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      income_breakdown: Object.entries(bankIncomeBreakdown).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      daily_balance: dailyBalance,
    },
    amex: {
      transactions: amexTx || [],
      aggregates: amexAgg,
      by_category: Object.entries(amexByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    },
    trends: { monthly: allSummaries || [] },
    changes,
    incidence,
    computed: {
      total_costi_personale: totalCostiPersonale,
      total_spese_banca: ba.total_out,
      total_spese_amex: amexAgg.total_charges,
    },
    uploads: uploads || [],
  });
}
