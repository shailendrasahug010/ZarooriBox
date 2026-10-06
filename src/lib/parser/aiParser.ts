import type { ParsedQuickAdd, QuickAddParser } from './types';
import { ruleParser } from './ruleParser';

// Drop-in AI parser. Point VITE_AI_PARSER_URL at a server endpoint (for example a
// Supabase Edge Function that calls an LLM) that accepts { text, today, currency }
// and returns a ParsedQuickAdd-shaped JSON object. Never call an LLM provider
// directly from the browser: the API key would be exposed.

function looksValid(x: unknown): x is ParsedQuickAdd {
  const o = x as Partial<ParsedQuickAdd> | null;
  return !!o && typeof o.title === 'string' && typeof o.kind === 'string' && typeof o.categoryId === 'string';
}

export function createAiParser(endpoint: string): QuickAddParser {
  return {
    name: 'ai',
    async parse(text, ctx) {
      const fallback = await ruleParser.parse(text, ctx);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, today: ctx.today, currency: ctx.currency }),
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return fallback;
        const data: unknown = await res.json();
        // Rules fill anything the model leaves out.
        return looksValid(data) ? { ...fallback, ...data, raw: text } : fallback;
      } catch {
        return fallback;
      }
    },
  };
}
