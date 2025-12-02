import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Check if we're in a build environment with placeholder values
const isBuildTime = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return url.includes('placeholder') || !url || url === 'https://placeholder.supabase.co';
};

// Create a mock client for build time that doesn't throw
const createMockClient = () => {
  const mockClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
        limit: async () => ({ data: [], error: null }),
      }),
      insert: async () => ({ data: null, error: null }),
      update: async () => ({ data: null, error: null }),
      delete: async () => ({ data: null, error: null }),
    }),
    rpc: async () => ({ data: null, error: null }),
  };
  return mockClient as unknown as ReturnType<typeof createServerComponentClient>;
};

export function createSupabaseServerClient() {
  if (isBuildTime()) {
    return createMockClient();
  }
  return createServerComponentClient({ cookies });
}
