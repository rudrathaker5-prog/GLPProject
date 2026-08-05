import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Two clients per request:
 *  - `userClient` carries the caller's JWT, so every query is still filtered by
 *    row level security. All patient reads/writes go through this.
 *  - `serviceClient` bypasses RLS and is only used for infrastructure work
 *    (dispatching reminders, writing audit rows for anonymous sessions).
 */

export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization') ?? '';
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function getUserId(req: Request): Promise<string | null> {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
