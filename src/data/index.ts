import type { ID } from '../types';
import { createLocalRepository } from './localRepository';
import type { Repository } from './repository';
import { isSupabaseConfigured } from './supabase';
import { createSupabaseRepository } from './supabaseRepository';

export type { Repository } from './repository';

export function createRepository(userId: ID): Repository {
  return isSupabaseConfigured ? createSupabaseRepository(userId) : createLocalRepository(userId);
}
