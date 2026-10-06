import type { CategoryId } from '../types';
import { getSupabase, isSupabaseConfigured } from '../data/supabase';
import { getCategory } from './categories';
import { isValidISO, REPEAT_PRESETS, todayISO } from './dates';
import type { MemoryInput } from '../store/memoryInput';

// Document scanning: a photo of a passport, policy, bill or warranty card becomes a
// prefilled memory. The photo is shrunk on the device, read by Claude on the server
// (supabase/functions/scan-document), and every field that comes back is validated.

export type ScanOutcome = 'found' | 'not_found' | 'no_ai';

export interface ScanResult {
  outcome: ScanOutcome;
  /** Fields to prefill; empty when nothing usable was read. */
  fields: Partial<MemoryInput>;
}

const CATS: CategoryId[] = ['personal', 'home', 'finance', 'vehicle', 'documents'];
const MAX_SIDE = 1600;

export const isScannable = (f: File) => /^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name);

/** Shrinks a photo to at most 1600 px on its long side, as JPEG. */
export async function shrinkImage(file: File): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

type Obj = Record<string, unknown>;
const str = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined);

/** Turns the server's answer into form fields, dropping anything malformed. */
export function fieldsFromScan(data: unknown, defaultReminder: number): ScanResult {
  if (typeof data !== 'object' || data === null) return { outcome: 'not_found', fields: {} };
  const d = data as Obj;
  if (d.fallback === true) return { outcome: d.reason === 'ai_not_configured' ? 'no_ai' : 'not_found', fields: {} };
  if (d.isDocument === false) return { outcome: 'not_found', fields: {} };
  const title = str(d.title, 120);
  const categoryId = CATS.includes(d.categoryId as CategoryId) ? (d.categoryId as CategoryId) : 'documents';
  const subRaw = str(d.subcategory, 60);
  const subcategory = subRaw && getCategory(categoryId).subcategories.includes(subRaw) ? subRaw : undefined;
  const dueDate = typeof d.dueDate === 'string' && isValidISO(d.dueDate) ? d.dueDate : null;
  const amount = typeof d.amount === 'number' && Number.isFinite(d.amount) && d.amount > 0 && d.amount < 1e10 ? Math.round(d.amount * 100) / 100 : null;
  const days = typeof d.reminderDaysBefore === 'number' && Number.isInteger(d.reminderDaysBefore) && d.reminderDaysBefore >= 0 && d.reminderDaysBefore <= 365 ? d.reminderDaysBefore : defaultReminder;
  const description = [str(d.provider, 80), str(d.reference, 60)].filter(Boolean).join(' · ') || undefined;
  if (!title) return { outcome: 'not_found', fields: {} };
  return {
    outcome: dueDate ? 'found' : 'not_found',
    fields: {
      title,
      categoryId,
      subcategory,
      dueDate,
      amount,
      description,
      reminder: dueDate ? { mode: 'offset', offsetDays: days } : { mode: 'none' },
      repeat: d.repeatYearly === true && dueDate ? { ...REPEAT_PRESETS.yearly } : { ...REPEAT_PRESETS.never },
    },
  };
}

/** Reads a document photo. Never throws: without the AI it reports "no_ai". */
export async function scanDocument(file: File, defaultReminder: number): Promise<ScanResult> {
  if (!isSupabaseConfigured) return { outcome: 'no_ai', fields: {} };
  try {
    const { base64, mediaType } = await shrinkImage(file);
    const { data, error } = await getSupabase().functions.invoke('scan-document', { body: { image: base64, mediaType, today: todayISO() } });
    if (error) return { outcome: 'not_found', fields: {} };
    return fieldsFromScan(data, defaultReminder);
  } catch {
    return { outcome: 'not_found', fields: {} };
  }
}
