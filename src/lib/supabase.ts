import { createClient } from "@supabase/supabase-js";

// Client-side (browser) — uses anon key, respects RLS
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-side — uses service role key (full DB access, bypasses RLS)
export function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Server-side helper: get the current user from a request cookie/header
export async function getServerUser() {
  const sb = supabase;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}
