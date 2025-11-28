import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase-client';
import { DashboardShell } from '@/components/dashboard-shell';

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const token = session.access_token;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/billing/invoices`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const invoices = res.ok ? await res.json() : [];

  return <DashboardShell invoices={invoices} subscriberName={session.user.user_metadata?.full_name} />;
}
