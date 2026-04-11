import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * GET  /api/sales/revenue-type?client_id=xxx&period=2026-01
 *   → returns sales rows with id, category_name, revenue_type, net_sales
 *
 * PATCH /api/sales/revenue-type
 *   body: { id: string, revenue_type: string }
 *   → updates a single row's revenue_type
 */

const VALID_TYPES = [
  "VENDITA_PRODOTTI",
  "COMMISSIONI_MT",
  "COMMISSIONI_SERVIZI",
  "BIGLIETTERIA",
  "RICARICHE",
  "LUGGAGE",
];

export async function GET(request: NextRequest) {
  const sb = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const period = searchParams.get("period");

  if (!clientId) {
    return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
  }

  let query = sb
    .from("sales_by_category")
    .select("id, category_name, revenue_type, net_sales, sold_quantity, period")
    .eq("client_id", clientId)
    .order("net_sales", { ascending: false });

  if (period) query = query.eq("period", period);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data || [], valid_types: VALID_TYPES });
}

export async function PATCH(request: NextRequest) {
  const sb = getServiceSupabase();
  const body = await request.json();
  const { id, revenue_type } = body;

  if (!id || !revenue_type) {
    return NextResponse.json({ error: "Missing id or revenue_type" }, { status: 400 });
  }

  if (!VALID_TYPES.includes(revenue_type)) {
    return NextResponse.json({ error: `Invalid revenue_type. Must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }

  const { error } = await sb
    .from("sales_by_category")
    .update({ revenue_type })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
