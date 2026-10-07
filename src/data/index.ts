import type { ID } from '../types';
import { createLocalRepository } from './localRepository';
import type { Repository } from './repository';
import { isSupabaseConfigured } from './supabase';
import { createSupabaseRepository } from './supabaseRepository';

export type { Repository } from './repository';

export function createRepository(userId: ID, onDevice = false): Repository {
  return isSupabaseConfigured && !onDevice ? createSupabaseRepository(userId) : createLocalRepository(userId);
}
