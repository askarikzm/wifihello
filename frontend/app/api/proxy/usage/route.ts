import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-client';

// Use internal Docker URL for server-side API calls
function getApiBase() {
  const internal = process.env.INTERNAL_API_BASE || 'http://backend:9000';
  const external = process.env.NEXT_PUBLIC_API_BASE || '';
  // Prefer internal URL for server-side, remove trailing /api to avoid duplication
  return (internal || external).replace(/\/api\/?$/, '');
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiBase = getApiBase();

  try {
    const upstream = await fetch(`${apiBase}/api/usage/daily`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const details = await upstream.text();
      console.error('Usage API error:', upstream.status, details);
      return NextResponse.json(
        { error: 'Upstream usage request failed', details },
        { status: upstream.status },
      );
    }

    const payload = await upstream.json();
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Usage API fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage data' },
      { status: 500 },
    );
  }
}
