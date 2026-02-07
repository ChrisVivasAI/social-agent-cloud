import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const errMsg = `Missing environment variables for supabase.
SUPABASE_URL missing: ${!!process.env.SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY missing: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`;
    throw new Error(errMsg);
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
