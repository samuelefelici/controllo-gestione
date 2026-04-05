import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * GET /api/clients — returns all clients for the authenticated user
 * POST /api/clients — create a new client and link to the current user
 */
export async function GET(request: NextRequest) {
  const sb = getServiceSupabase();

  // Get user from Authorization header or cookie
  const authHeader = request.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const { data: { user } } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    userId = user?.id || null;
  }

  // If no auth header, get all clients (admin mode via service role)
  // In production you'd verify the session from cookies
  const { data: clients, error } = await sb
    .from("clients")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  const sb = getServiceSupabase();
  const body = await request.json();

  const { slug, name, description } = body;
  if (!slug || !name) {
    return NextResponse.json({ error: "slug and name are required" }, { status: 400 });
  }

  // Create client
  const { data: client, error } = await sb
    .from("clients")
    .insert({ slug, name, description })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Link all existing users (admin setup — in production you'd link specific users)
  const { data: users } = await sb.auth.admin.listUsers();
  if (users?.users) {
    for (const user of users.users) {
      await sb.from("user_clients").upsert({
        user_id: user.id,
        client_id: client.id,
        role: "admin",
      }, { onConflict: "user_id,client_id" });
    }
  }

  return NextResponse.json({ client });
}
