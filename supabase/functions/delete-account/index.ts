// POST (signed in) -> { deleted: true }. Permanently deletes the caller's account:
// their files, then the auth user, which removes every row they own (each table
// cascades from auth.users). A family they started passes to another member
// instead of disappearing for everyone. Uses the service role key, which Supabase
// provides to functions automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const BUCKET = 'attachments';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json({ error: 'Not signed in' }, 401);
  const uid = auth.user.id;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const fail = (step: string, message: string) => {
    console.error(`delete-account ${step}: ${message}`);
    return json({ error: 'Could not delete your account. Please try again.' }, 500);
  };

  // 1. Hand any family this person started to the longest-standing other member.
  const { data: started, error: hErr } = await admin.from('households').select('id').eq('created_by', uid);
  if (hErr) return fail('households', hErr.message);
  for (const h of started ?? []) {
    const { data: next } = await admin
      .from('household_members')
      .select('user_id')
      .eq('household_id', h.id)
      .eq('active', true)
      .neq('user_id', uid)
      .order('joined_at')
      .limit(1)
      .maybeSingle();
    if (!next) continue; // Nobody else is in it, so it goes with the account.
    const { error } = await admin.from('households').update({ created_by: next.user_id }).eq('id', h.id);
    if (error) return fail('handover', error.message);
    await admin.from('household_members').update({ role: 'owner' }).eq('household_id', h.id).eq('user_id', next.user_id);
  }

  // 2. Files. Rows go with the user, but storage objects have to be removed here.
  const { data: files, error: fErr } = await admin.from('attachments').select('storage_path').eq('user_id', uid);
  if (fErr) return fail('files', fErr.message);
  const paths = (files ?? []).map((f) => f.storage_path as string | null).filter((p): p is string => !!p);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) return fail('storage', error.message);
  }

  // 3. The account itself, and with it every row this person owns.
  const { error: dErr } = await admin.auth.admin.deleteUser(uid);
  if (dErr) return fail('user', dErr.message);
  return json({ deleted: true });
});
