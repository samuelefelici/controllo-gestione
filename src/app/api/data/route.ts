import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * GET /api/data?period=2026-01
 * 
 * Returns all dashboard data for the given period.
 * If no period specified, returns latest available.
 */
export async function GET(request: NextRequest) {
  const sb = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  let period = searchParams.get("period");
  const clientId = searchParams.get("client_id");
  const section = searchParams.get("section");

  if (!clientId) {
    return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
  }

  // If only uploads section requested
  if (section === "uploads") {
    const { data: uploads } = await sb
      .from("file_uploads")
      .select("*")
      .eq("client_id", clientId)
      .order("uploaded_at", { ascending: false })
      .limit(20);
    return NextResponse.json({ uploads: uploads || [] });
  }

  // If no period, get the latest for this client
  if (!period) {
    const { data: latest } = await sb
      .from("monthly_summary")
      .select("period")
      .eq("client_id", clientId)
      .order("period", { ascending: false })
      .limit(1)
      .single();
    period = latest?.period || "";
  }

  if (!period) {
    return NextResponse.json({ error: "No data available" }, { status: 404 });
  }

  // Fetch all data in parallel (scoped to client)
  const [
    { data: summary },
    { data: sales },
    { data: revenues },
    { data: expenses },
    { data: payrollData },
    { data: bankTx },
    { data: amexTx },
    { data: allSummaries },
    { data: allRevenues },
    { data: uploads },
  ] = await Promise.all([
    sb.from("monthly_summary").select("*").eq("client_id", clientId).eq("period", period).single(),
    sb.from("sales_by_category").select("*").eq("client_id", clientId).eq("period", period).order("net_sales", { ascending: false }),
    sb.from("revenue_lines").select("*").eq("client_id", clientId).eq("period", period),
    sb.from("expense_lines").select("*").eq("client_id", clientId).eq("period", period),
    sb.from("payroll").select("*").eq("client_id", clientId).eq("period", period),
    sb.from("bank_transactions").select("*").eq("client_id", clientId).eq("period", period).order("transaction_date", { ascending: false }),
    sb.from("amex_transactions").select("*").eq("client_id", clientId).eq("period", period).order("operation_date", { ascending: false }),
    sb.from("monthly_summary").select("*").eq("client_id", clientId).order("period", { ascending: true }).limit(24),
    sb.from("revenue_lines").select("*").eq("client_id", clientId).order("period", { ascending: true }),
    sb.from("file_uploads").select("*").eq("client_id", clientId).order("uploaded_at", { ascending: false }).limit(20),
  ]);

  // Compute aggregates from bank transactions
  const bankAggregates = {
    total_pos_income: (bankTx || []).filter((t: any) => t.category === "pos_income").reduce((s: number, t: any) => s + t.amount, 0),
    total_pos_expense: (bankTx || []).filter((t: any) => t.category === "pos_expense").reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
    total_bonifici_in: (bankTx || []).filter((t: any) => t.category === "bonifico_in").reduce((s: number, t: any) => s + t.amount, 0),
    total_bonifici_out: (bankTx || []).filter((t: any) => t.category === "bonifico_out").reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
    total_commissions: (bankTx || []).filter((t: any) => t.category === "commission").reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
    total_sdd: (bankTx || []).filter((t: any) => t.category === "sdd").reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
    opening_balance: bankTx?.length ? bankTx[bankTx.length - 1]?.running_balance : 0,
    closing_balance: bankTx?.length ? bankTx[0]?.running_balance : 0,
    transaction_count: bankTx?.length || 0,
  };

  // Compute payroll aggregates
  const payrollAggregates = {
    total_gross: (payrollData || []).reduce((s: number, p: any) => s + (p.gross_pay || 0), 0),
    total_net: (payrollData || []).reduce((s: number, p: any) => s + (p.net_pay || 0), 0),
    total_contributions: (payrollData || []).reduce((s: number, p: any) => s + (p.social_contributions || 0), 0),
    total_irpef: (payrollData || []).reduce((s: number, p: any) => s + (p.irpef || 0), 0),
    total_tfr: (payrollData || []).reduce((s: number, p: any) => s + (p.tfr_month || 0), 0),
    employee_count: payrollData?.length || 0,
  };

  // Sales aggregates
  const salesAggregates = {
    total_net_sales: (sales || []).reduce((s: number, c: any) => s + (c.net_sales || 0), 0),
    total_vat: (sales || []).reduce((s: number, c: any) => s + (c.vat_amount || 0), 0),
    total_with_vat: (sales || []).reduce((s: number, c: any) => s + (c.sales_with_vat || 0), 0),
    total_qty: (sales || []).reduce((s: number, c: any) => s + (c.sold_quantity || 0), 0),
    total_discount: (sales || []).reduce((s: number, c: any) => s + (c.net_discount || 0), 0),
    category_count: sales?.length || 0,
  };

  // Available periods
  const availablePeriods = (allSummaries || []).map((s: any) => s.period);

  return NextResponse.json({
    period,
    available_periods: availablePeriods,
    summary,
    sales: { data: sales, aggregates: salesAggregates },
    revenues: revenues || [],
    expenses: expenses || [],
    payroll: { data: payrollData, aggregates: payrollAggregates },
    bank: { transactions: bankTx?.slice(0, 50), aggregates: bankAggregates, total_count: bankTx?.length },
    amex: amexTx || [],
    trends: {
      monthly: allSummaries || [],
      revenue_lines: allRevenues || [],
    },
    uploads: uploads || [],
  });
}
