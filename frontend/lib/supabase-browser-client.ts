'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Check if we're in a build environment with placeholder values
const isBuildTime = () => {
  if (typeof window === 'undefined') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    return url.includes('placeholder') || !url || url === 'https://placeholder.supabase.co';
  }
  return false;
};

// Create a mock client for build time that doesn't throw
const createMockClient = () => {
  const mockClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
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
  return mockClient as unknown as ReturnType<typeof createClientComponentClient>;
};

export function createSupabaseBrowserClient() {
  if (isBuildTime()) {
    return createMockClient();
  }
  return createClientComponentClient();
}
