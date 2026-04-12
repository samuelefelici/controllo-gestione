import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/* PATCH — update income_category or cost_category for a bank transaction */
export async function PATCH(request: NextRequest) {
  const sb = getServiceSupabase();
  const body = await request.json();
  const { id, income_category, cost_category } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (income_category !== undefined) updates.income_category = income_category;
  if (cost_category !== undefined) updates.cost_category = cost_category;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await sb
    .from("bank_transactions")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
