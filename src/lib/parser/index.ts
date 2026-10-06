import { createAiParser } from './aiParser';
import { ruleParser, parseQuickAdd } from './ruleParser';
import type { QuickAddParser } from './types';

export * from './types';
export { parseQuickAdd };

const aiEndpoint = import.meta.env.VITE_AI_PARSER_URL as string | undefined;

/** The parser used when saving. Live previews always use the instant rule parser. */
export const quickAddParser: QuickAddParser = aiEndpoint ? createAiParser(aiEndpoint) : ruleParser;
