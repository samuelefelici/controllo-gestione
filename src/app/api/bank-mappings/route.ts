import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * GET /api/bank-mappings?client_id=xxx
 * Returns known counterpart → cost_category / income_category mappings
 * based on previously categorized transactions for the given client.
 */
export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get("client_id");
    if (!clientId) {
      return NextResponse.json({ error: "client_id obbligatorio" }, { status: 400 });
    }

    const sb = getServiceSupabase();

    // Fetch all bank transactions with a cost_category or income_category set
    const { data: txs, error } = await sb
      .from("bank_transactions")
      .select("counterpart, description, cost_category, income_category, subcategory")
      .eq("client_id", clientId)
      .or("cost_category.neq.,income_category.neq.");

    if (error) throw error;

    // Build mapping: counterpart/description → most recent category assignment
    // Use counterpart first, fallback to first 60 chars of description
    const costMap: Record<string, string> = {};
    const incomeMap: Record<string, string> = {};

    for (const tx of txs || []) {
      const key = (tx.counterpart || tx.description || "").trim().toUpperCase();
      if (!key) continue;

      if (tx.cost_category) {
        costMap[key] = tx.cost_category;
      }
      if (tx.income_category) {
        incomeMap[key] = tx.income_category;
      }
    }

    return NextResponse.json({
      success: true,
      cost_mappings: costMap,
      income_mappings: incomeMap,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Bank mappings error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
