import { createSupabaseServerClient } from '@/lib/supabase-client';
import { DashboardShell } from '@/components/dashboard-shell';

// Use internal Docker URL for SSR, fallback to public URL
function getApiBase() {
  // For server-side, prefer internal Docker URL
  if (typeof window === 'undefined') {
    return process.env.INTERNAL_API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://backend:9000';
  }
  return process.env.NEXT_PUBLIC_API_BASE || '';
}

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Auth check is in layout, but keep for safety
  if (!session) {
    return null;
  }

  const token = session.access_token;
  const apiBase = getApiBase().replace(/\/api\/?$/, '');
  
  const res = await fetch(`${apiBase}/api/billing/invoices`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const invoices = res.ok ? await res.json() : [];

  return <DashboardShell invoices={invoices} subscriberName={session.user.user_metadata?.full_name} />;
}
