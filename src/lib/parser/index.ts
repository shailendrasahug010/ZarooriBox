import { isSupabaseConfigured, getSupabase } from '../../data/supabase';
import { createAiParser, httpTransport, type AiTransport } from './aiParser';
import { ruleParser, parseQuickAdd } from './ruleParser';
import type { QuickAddParser } from './types';

export * from './types';
export { parseQuickAdd };
export { normalizeParsed } from './aiParser';

const aiEndpoint = import.meta.env.VITE_AI_PARSER_URL as string | undefined;
const aiDisabled = (import.meta.env.VITE_AI_QUICK_ADD as string | undefined) === 'off';

function pickTransport(): AiTransport | null {
  if (aiDisabled) return null;
  if (aiEndpoint) return httpTransport(aiEndpoint);
  if (isSupabaseConfigured) {
    // Supabase attaches the signed-in user's token, which the function checks.
    return async (body) => {
      const { data, error } = await getSupabase().functions.invoke('parse-quick-add', { body });
      if (error) throw error;
      return data;
    };
  }
  return null;
}

const transport = pickTransport();

/** True when Quick Add sends sentences to the AI function (Supabase or a custom endpoint). */
export const aiQuickAddEnabled = !!transport;

/** The parser used for the "understood" preview after typing pauses, and for saving. Falls back to rules. */
export const quickAddParser: QuickAddParser = transport ? createAiParser(transport) : ruleParser;
