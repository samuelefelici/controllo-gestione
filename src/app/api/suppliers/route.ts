import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * GET  /api/suppliers?client_id=xxx  — Lista fornitori per un cliente
 * POST /api/suppliers                — Crea un nuovo fornitore
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  if (!clientId) return NextResponse.json({ error: "Missing client_id" }, { status: 400 });

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("suppliers")
    .select("*")
    .eq("client_id", clientId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suppliers: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { client_id, name } = body;

  if (!client_id || !name?.trim()) {
    return NextResponse.json({ error: "client_id e name obbligatori" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("suppliers")
    .upsert({ client_id, name: name.trim() }, { onConflict: "client_id,name" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supplier: data });
}
