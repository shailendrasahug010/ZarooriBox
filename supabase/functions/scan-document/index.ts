// POST { image (base64, no data: prefix), mediaType, today } -> scan result, or { fallback: true }.
// Requires a signed-in user. Secrets: ANTHROPIC_API_KEY.

import Anthropic from 'npm:@anthropic-ai/sdk@^0.131';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { scanWithClaude, type ScanRequest } from '../_shared/scanAI.ts';

let anthropic: Anthropic | null = null;
const TYPES: ScanRequest['mediaType'][] = ['image/jpeg', 'image/png', 'image/webp'];
/** About 4 MB of image; the app shrinks photos well below this. */
const MAX_BASE64 = 5_500_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: 'Not signed in' }, 401);

  const body = await req.json().catch(() => null);
  const image = typeof body?.image === 'string' ? body.image : '';
  const mediaType = TYPES.includes(body?.mediaType) ? (body.mediaType as ScanRequest['mediaType']) : null;
  const today = typeof body?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  if (!image || !mediaType || image.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) {
    return json({ error: 'Send a JPEG, PNG or WebP photo under 4 MB.' }, 400);
  }

  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ fallback: true, reason: 'ai_not_configured' });
  anthropic ??= new Anthropic();
  try {
    const result = await scanWithClaude(anthropic, { image, mediaType, today });
    return result ? json(result) : json({ fallback: true });
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`Claude API ${e.status}: ${e.message}`);
    else console.error(e);
    return json({ fallback: true });
  }
});
