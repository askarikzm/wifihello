import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-client';

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE;
  if (!apiBase) {
    return NextResponse.json({ error: 'API base not configured' }, { status: 500 });
  }

  const upstream = await fetch(`${apiBase}/api/usage/daily`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const details = await upstream.text();
    return NextResponse.json(
      { error: 'Upstream usage request failed', details },
      { status: upstream.status },
    );
  }

  const payload = await upstream.json();
  const rows: Array<{ total_mb?: number }> = Array.isArray(payload) ? payload : [];
  const totalMb = rows.reduce((sum, row) => sum + Number(row.total_mb ?? 0), 0);

  return NextResponse.json({ total_mb: Math.round(totalMb), rows });
}
