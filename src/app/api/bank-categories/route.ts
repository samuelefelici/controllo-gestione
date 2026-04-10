import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

const PRESET_CATEGORIES = [
  "Affitto",
  "Energia Elettrica",
  "Acqua",
  "Abbonamenti Vari",
  "Commercialista",
  "Altre Spese",
  "Spese Bancarie",
  "Pulizia e Igiene",
  "Cancelleria",
  "Riparazioni e Ricambi",
  "TARI (Rifiuti)",
  "Canone RAI",
  "Spese Viaggi",
];

/* GET — list bank categories for a client (auto-seeds preset on first call) */
export async function GET(request: NextRequest) {
  const sb = getServiceSupabase();
  const clientId = new URL(request.url).searchParams.get("client_id");
  if (!clientId) return NextResponse.json({ error: "Missing client_id" }, { status: 400 });

  // Check if client has categories; if not, seed preset
  const { data: existing } = await sb
    .from("bank_categories")
    .select("id")
    .eq("client_id", clientId)
    .limit(1);

  if (!existing || existing.length === 0) {
    const rows = PRESET_CATEGORIES.map((name) => ({ client_id: clientId, name }));
    await sb.from("bank_categories").upsert(rows, { onConflict: "client_id,name" });
  }

  const { data, error } = await sb
    .from("bank_categories")
    .select("*")
    .eq("client_id", clientId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data || [] });
}

/* POST — add/upsert a bank category */
export async function POST(request: NextRequest) {
  const sb = getServiceSupabase();
  const body = await request.json();
  const { client_id, name } = body;

  if (!client_id || !name?.trim()) {
    return NextResponse.json({ error: "Missing client_id or name" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("bank_categories")
    .upsert({ client_id, name: name.trim() }, { onConflict: "client_id,name" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}

/* DELETE — remove a bank category */
export async function DELETE(request: NextRequest) {
  const sb = getServiceSupabase();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await sb.from("bank_categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
