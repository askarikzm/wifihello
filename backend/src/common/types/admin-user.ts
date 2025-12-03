import { SupabaseUser } from './supabase-user';

export type AdminUser = SupabaseUser & { adminRole?: string };
