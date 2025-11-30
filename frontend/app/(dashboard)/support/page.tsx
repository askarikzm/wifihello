import { createSupabaseServerClient } from '@/lib/supabase-client';
import { SupportClient } from './support-client';

export default async function SupportPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE;

  // Fetch user's tickets
  const res = await fetch(`${apiBase}/api/support/tickets`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const tickets = res.ok ? await res.json() : [];

  return <SupportClient tickets={tickets} />;
}
