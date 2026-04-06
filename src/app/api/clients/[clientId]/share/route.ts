import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { randomBytes } from "crypto";

// POST → Generate or regenerate share token for a client
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const sb = getServiceSupabase();
  const { clientId } = await params;

  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  // Generate a secure random token (URL-safe, 32 chars)
  const token = randomBytes(24).toString("base64url");

  const { data, error } = await sb
    .from("clients")
    .update({ share_token: token })
    .eq("id", clientId)
    .select("id, name, share_token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, share_token: data.share_token });
}

// GET → Get current share token for a client
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const sb = getServiceSupabase();
  const { clientId } = await params;

  const { data, error } = await sb
    .from("clients")
    .select("share_token")
    .eq("id", clientId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ share_token: data.share_token });
}
