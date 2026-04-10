import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * GET    /api/invoice-categories?client_id=xxx  — Lista categorie
 * POST   /api/invoice-categories                — Crea/upsert categoria
 * DELETE /api/invoice-categories?id=xxx          — Elimina categoria
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  if (!clientId) return NextResponse.json({ error: "Missing client_id" }, { status: 400 });

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("invoice_categories")
    .select("*")
    .eq("client_id", clientId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { client_id, name } = body;

  if (!client_id || !name?.trim()) {
    return NextResponse.json({ error: "client_id e name obbligatori" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("invoice_categories")
    .upsert({ client_id, name: name.trim() }, { onConflict: "client_id,name" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = getServiceSupabase();
  const { error } = await sb.from("invoice_categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
