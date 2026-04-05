import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * POST /api/parse/recalculate?period=2026-01
 * 
 * Recalculates monthly summary (revenue, expenses, profit)
 * from all parsed data sources for the given period.
 */
export async function POST(request: NextRequest) {
  const sb = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");

  if (!period) {
    return NextResponse.json({ error: "Missing period param" }, { status: 400 });
  }

  // 1. Fetch all data for this period
  const [
    { data: revenues },
    { data: expenses },
    { data: sales },
    { data: payrollData },
    { data: bankTx },
    { data: amexTx },
  ] = await Promise.all([
    sb.from("revenue_lines").select("*").eq("period", period),
    sb.from("expense_lines").select("*").eq("period", period),
    sb.from("sales_by_category").select("*").eq("period", period),
    sb.from("payroll").select("*").eq("period", period),
    sb.from("bank_transactions").select("*").eq("period", period),
    sb.from("amex_transactions").select("*").eq("period", period),
  ]);

  // ═══════════════════════════════════════════════════════
  // 2. COMPUTE REVENUES
  // ═══════════════════════════════════════════════════════

  // A) Money Transfer commissions (from bank bonifici)
  const commWU = (revenues || []).find((r) => r.source === "wu")?.amount || 0;
  const commRIA = (revenues || []).find((r) => r.source === "ria")?.amount || 0;
  const commMG = (revenues || []).find((r) => r.source === "mg")?.amount || 0;
  const totalMTCommissions = commWU + commRIA + commMG;

  // B) Product margin from sales data
  // If we have purchase_value from detailed Erply report, use it
  // Otherwise estimate at ~30% of net sales for product categories
  const productCategories = (sales || []).filter((s) => {
    const name = s.category_name?.toUpperCase() || "";
    return !["MONEY TRANSFER", "BALUWO", "BY AIR TICKET", "BUS TICKET", 
             "COMMISSIONI TICKET", "COMMISIONI REPARAZIONE", "SIM CARD",
             "LUGGAGE STORAGE"].includes(name);
  });

  let productProfit = 0;
  let productProfitMethod = "estimated";
  
  const hasRealMargin = productCategories.some((c) => c.sales_profit && c.sales_profit > 0);
  if (hasRealMargin) {
    // We have real margin data from the detailed Erply report
    productProfit = productCategories.reduce((s, c) => s + (c.sales_profit || 0), 0);
    productProfitMethod = "actual";
  } else {
    // Estimate: ~30% average margin on electronics mix
    const productNetSales = productCategories.reduce((s, c) => s + (c.net_sales || 0), 0);
    productProfit = productNetSales * 0.30;
    productProfitMethod = "estimated_30pct";
  }

  // C) Service commissions (from Erply sales)
  const getErplySales = (name: string) => 
    (sales || []).find((s) => s.category_name?.toUpperCase().includes(name))?.net_sales || 0;

  const ticketComm = getErplySales("COMMISSIONI TICKET");
  const repairComm = getErplySales("COMMISIONI REPARAZIONE") || getErplySales("COMMISSIONI REPARAZIONE");
  const baluwoComm = getErplySales("BALUWO");
  const simRevenue = getErplySales("SIM CARD");
  const busRevenue = getErplySales("BUS TICKET");

  // D) Luggage storage (from bank bonifici)
  const luggageIncome = (bankTx || [])
    .filter((t) => t.subcategory === "luggage_commission")
    .reduce((s, t) => s + t.amount, 0);

  // Total revenue
  const totalRevenue = totalMTCommissions + productProfit + ticketComm + repairComm + 
                       baluwoComm + simRevenue + busRevenue + luggageIncome;

  // Upsert all revenue lines
  const revenueLines = [
    { source: "wu", amount: commWU, notes: "Western Union" },
    { source: "ria", amount: commRIA, notes: "RIA" },
    { source: "mg", amount: commMG, notes: "MoneyGram" },
    { source: "prodotti", amount: productProfit, notes: `Margine prodotti (${productProfitMethod})` },
    { source: "ticket", amount: ticketComm, notes: "Commissioni biglietteria" },
    { source: "riparazioni", amount: repairComm, notes: "Commissioni riparazioni" },
    { source: "baluwo", amount: baluwoComm, notes: "Baluwo" },
    { source: "sim", amount: simRevenue, notes: "SIM Card" },
    { source: "bus", amount: busRevenue, notes: "Bus Ticket" },
    { source: "luggage", amount: luggageIncome, notes: "Luggage Storage Apps" },
  ].filter((r) => r.amount > 0);

  for (const line of revenueLines) {
    await sb.from("revenue_lines").upsert(
      { period, ...line },
      { onConflict: "period,source" }
    );
  }

  // ═══════════════════════════════════════════════════════
  // 3. COMPUTE EXPENSES
  // ═══════════════════════════════════════════════════════

  // A) Payroll (from cedolini)
  const totalPayrollGross = (payrollData || []).reduce((s, p) => s + (p.gross_pay || 0), 0);
  const totalTFR = (payrollData || []).reduce((s, p) => s + (p.tfr_month || 0), 0);
  const payrollCost = totalPayrollGross + totalTFR;

  // B) Bank-derived expenses
  const bankExpenses = {
    commissions: (bankTx || [])
      .filter((t) => t.category === "commission")
      .reduce((s, t) => s + Math.abs(t.amount), 0),
    sdd: (bankTx || [])
      .filter((t) => t.category === "sdd")
      .reduce((s, t) => s + Math.abs(t.amount), 0),
    pos_canone: (bankTx || [])
      .filter((t) => t.raw_description?.includes("CANONE P.O.S."))
      .reduce((s, t) => s + Math.abs(t.amount), 0),
    nexi_comm: (bankTx || [])
      .filter((t) => t.subcategory === "pos_commission")
      .reduce((s, t) => s + Math.abs(t.amount), 0),
    bollo: (bankTx || [])
      .filter((t) => t.subcategory === "tax" || t.raw_description?.includes("BOLLO"))
      .reduce((s, t) => s + Math.abs(t.amount), 0),
    internet: (bankTx || [])
      .filter((t) => t.subcategory === "internet")
      .reduce((s, t) => s + Math.abs(t.amount), 0),
  };

  // C) Amex expenses (excluding payments = credit card balance transfers)
  const amexExpenseTotal = (amexTx || [])
    .filter((t) => t.category !== "payment")
    .reduce((s, t) => s + t.amount_eur, 0);

  // Categorize amex
  const amexByCategory = (amexTx || []).reduce((acc, t) => {
    if (t.category === "payment") return acc;
    acc[t.category] = (acc[t.category] || 0) + t.amount_eur;
    return acc;
  }, {} as Record<string, number>);

  // D) Fixed costs (estimated if not in bank data)
  // Check if rent is in bank transactions
  const rentFromBank = (bankTx || [])
    .filter((t) => t.raw_description?.toUpperCase().includes("AFFITTO") || t.raw_description?.toUpperCase().includes("LOCAZIONE"))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const rent = rentFromBank > 0 ? rentFromBank : 2200; // default estimate

  // Commercialista (check bank)
  const commercialistaFromBank = (bankTx || [])
    .filter((t) => t.raw_description?.toUpperCase().includes("COMMERCIALISTA") || t.raw_description?.toUpperCase().includes("CONSULEN"))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const commercialista = commercialistaFromBank > 0 ? commercialistaFromBank : 0;

  // Total expenses
  const totalExpenses = payrollCost + rent + commercialista + 
    bankExpenses.commissions + bankExpenses.nexi_comm + bankExpenses.pos_canone +
    bankExpenses.bollo + bankExpenses.internet + amexExpenseTotal;

  // Upsert expense lines
  const expenseLines = [
    { category: "stipendi", amount: payrollCost, notes: `Lordo ${totalPayrollGross.toFixed(2)} + TFR ${totalTFR.toFixed(2)}` },
    { category: "affitto", amount: rent, notes: rentFromBank > 0 ? "Da movimenti banca" : "Stima" },
    { category: "commercialista", amount: commercialista, notes: commercialistaFromBank > 0 ? "Da movimenti banca" : "Non rilevato" },
    { category: "commissioni_nexi", amount: bankExpenses.nexi_comm, notes: "Commissioni POS NEXI" },
    { category: "canone_pos", amount: bankExpenses.pos_canone, notes: "Canone POS" },
    { category: "commissioni_banca", amount: bankExpenses.commissions, notes: "Spese bancarie varie" },
    { category: "bollo", amount: bankExpenses.bollo, notes: "Imposta di bollo" },
    { category: "internet", amount: bankExpenses.internet, notes: "Fastweb / connettività" },
    { category: "amex_abbonamenti", amount: amexByCategory.subscription || 0, notes: "Abbonamenti da Amex" },
    { category: "amex_viaggi", amount: amexByCategory.travel || 0, notes: "Viaggi da Amex" },
    { category: "amex_forniture", amount: (amexByCategory.supply || 0) + (amexByCategory.supply_amazon || 0), notes: "Forniture da Amex" },
    { category: "amex_pubblicita", amount: amexByCategory.advertising || 0, notes: "Pubblicità da Amex" },
    { category: "amex_quota", amount: amexByCategory.amex_fee || 0, notes: "Quota associativa Amex" },
    { category: "amex_altro", amount: (amexByCategory.other || 0) + (amexByCategory.personal || 0) + (amexByCategory.baluwo || 0), notes: "Altro da Amex" },
  ].filter((e) => e.amount > 0);

  for (const line of expenseLines) {
    await sb.from("expense_lines").upsert(
      { period, ...line },
      { onConflict: "period,category" }
    );
  }

  // ═══════════════════════════════════════════════════════
  // 4. UPDATE MONTHLY SUMMARY
  // ═══════════════════════════════════════════════════════

  const netProfit = totalRevenue - totalExpenses;

  // IVA POS = IVA from Erply sales
  const ivaPOS = (sales || []).reduce((s, c) => s + (c.vat_amount || 0), 0);

  await sb.from("monthly_summary").upsert({
    period,
    year: parseInt(period.split("-")[0]),
    month: parseInt(period.split("-")[1]),
    total_revenue: totalRevenue,
    total_expenses: totalExpenses,
    net_profit: netProfit,
    iva_pos: ivaPOS,
    notes: `Auto-calculated. Product margin: ${productProfitMethod}. Revenue lines: ${revenueLines.length}. Expense lines: ${expenseLines.length}.`,
  }, { onConflict: "period" });

  return NextResponse.json({
    success: true,
    period,
    summary: {
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_expenses: Math.round(totalExpenses * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      iva_pos: Math.round(ivaPOS * 100) / 100,
      product_profit_method: productProfitMethod,
    },
    revenue_breakdown: revenueLines,
    expense_breakdown: expenseLines,
    data_sources: {
      sales_categories: sales?.length || 0,
      bank_transactions: bankTx?.length || 0,
      amex_transactions: amexTx?.length || 0,
      payroll_records: payrollData?.length || 0,
    },
  });
}
