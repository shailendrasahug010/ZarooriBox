// POST { text, today, currency } -> ParsedQuickAdd-shaped JSON, or { fallback: true }.
// Requires a signed-in user. Secrets: ANTHROPIC_API_KEY (set with `supabase secrets set`).

import Anthropic from 'npm:@anthropic-ai/sdk@^0.131';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { parseWithClaude } from '../_shared/quickAddAI.ts';

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Only signed-in LifeBox users may spend AI credits.
  const authHeader = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: 'Not signed in' }, 401);

  let body: { text?: unknown; today?: unknown; currency?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const currency = typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : 'INR';
  if (!text || text.length > 300) return json({ error: 'Text must be 1-300 characters' }, 400);

  try {
    const parsed = await parseWithClaude(anthropic, { text, today, currency });
    return parsed ? json(parsed) : json({ fallback: true });
  } catch (e) {
    // Rate limits, outages: the app quietly uses its rule parser instead.
    if (e instanceof Anthropic.APIError) console.error(`Claude API ${e.status}: ${e.message}`);
    else console.error(e);
    return json({ fallback: true });
  }
});
