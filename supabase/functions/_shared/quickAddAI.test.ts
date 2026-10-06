// deno test supabase/functions/_shared/quickAddAI.test.ts
import type Anthropic from 'npm:@anthropic-ai/sdk@^0.131';
import { parseWithClaude, PARSED_SCHEMA } from './quickAddAI.ts';

function fakeClient(response: unknown, seen: unknown[] = []) {
  return { beta: { messages: { create: (params: unknown) => (seen.push(params), Promise.resolve(response)) } } } as unknown as Anthropic;
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const req = { text: 'Bike insurance expires on 17 November', today: '2026-10-06', currency: 'INR' };

Deno.test('returns the parsed JSON and sends a structured-output request', async () => {
  const seen: Record<string, unknown>[] = [];
  const out = await parseWithClaude(
    fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"kind":"memory","title":"Bike insurance"}' }] }, seen),
    req,
  );
  assert((out as { title: string }).title === 'Bike insurance', 'parsed title');
  const p = seen[0] as { output_config: { format: { schema: unknown } }; messages: { content: string }[]; system: { text: string }[] };
  assert(p.output_config.format.schema === PARSED_SCHEMA, 'uses the schema');
  assert(p.messages[0].content.includes('Today is 2026-10-06'), 'date in the user turn');
  assert(!p.system[0].text.includes('2026-10-06'), 'system prompt stays cacheable');
});

Deno.test('returns null on refusal, truncation, or bad JSON', async () => {
  for (const r of [
    { stop_reason: 'refusal', content: [] },
    { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"kind":' }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] },
  ]) {
    assert((await parseWithClaude(fakeClient(r), req)) === null, `null for ${r.stop_reason}`);
  }
});
