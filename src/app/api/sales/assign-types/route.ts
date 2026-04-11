import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * POST /api/sales/assign-types?client_id=xxx&period=2026-01
 * Auto-assigns revenue_type based on category_name rules.
 */

const RULES: { patterns: string[]; type: string }[] = [
  { patterns: ["MONEY TRANSFER"], type: "COMMISSIONI_MT" },
  { patterns: ["COMMISSIONI TICKET", "COMMISIONI REPARAZIONE", "COMMISSIONI REPARAZIONE"], type: "COMMISSIONI_SERVIZI" },
  { patterns: ["BY AIR TICKET", "BUS TICKET"], type: "BIGLIETTERIA" },
  { patterns: ["BALUWO", "SIM CARD"], type: "RICARICHE" },
  { patterns: ["LUGGAGE", "LUGGAGE STORAGE"], type: "LUGGAGE" },
];

function resolveType(categoryName: string): string {
  const upper = (categoryName || "").toUpperCase().trim();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => upper === p.toUpperCase())) return rule.type;
  }
  return "VENDITA_PRODOTTI";
}

export async function POST(request: NextRequest) {
  const sb = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const period = searchParams.get("period");

  if (!clientId) {
    return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
  }

  // Fetch rows
  let query = sb.from("sales_by_category").select("id, category_name, revenue_type").eq("client_id", clientId);
  if (period) query = query.eq("period", period);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  for (const row of rows || []) {
    const newType = resolveType(row.category_name);
    if (row.revenue_type !== newType) {
      const { error: uErr } = await sb
        .from("sales_by_category")
        .update({ revenue_type: newType })
        .eq("id", row.id);
      if (!uErr) updated++;
    }
  }

  return NextResponse.json({ success: true, total: (rows || []).length, updated });
}
