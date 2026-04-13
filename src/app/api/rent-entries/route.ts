import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const period = searchParams.get("period");

  if (!clientId) {
    return NextResponse.json({ error: "Missing client_id" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  let q = sb
    .from("rent_entries")
    .select("*")
    .eq("client_id", clientId)
    .order("period", { ascending: false })
    .order("created_at", { ascending: false });

  if (period) {
    q = q.eq("period", period);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);

  return NextResponse.json({ entries: rows, total, count: rows.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { client_id, period, amount, notes } = body;

  if (!client_id || !period || amount === undefined || amount === null) {
    return NextResponse.json({ error: "client_id, period e amount obbligatori" }, { status: 400 });
  }

  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return NextResponse.json({ error: "amount deve essere un numero positivo" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("rent_entries")
    .insert({
      client_id,
      period,
      amount: parsed,
      notes: (notes || "").trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, period, amount, notes } = body;

  if (!id) {
    return NextResponse.json({ error: "id obbligatorio" }, { status: 400 });
  }

  const updates: Record<string, any> = {};

  if (period !== undefined) {
    updates.period = period;
  }

  if (amount !== undefined) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "amount deve essere un numero positivo" }, { status: 400 });
    }
    updates.amount = parsed;
  }

  if (notes !== undefined) {
    updates.notes = String(notes || "").trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("rent_entries")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = getServiceSupabase();
  const { error } = await sb.from("rent_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
