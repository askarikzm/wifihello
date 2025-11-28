import { createSupabaseServerClient } from '@/lib/supabase-client';
import { InvoiceList } from '@/components/invoice-list';
import { Card } from '@/components/ui/card';
import { redirect } from 'next/navigation';

export default async function InvoicesPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/billing/invoices`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const invoices = response.ok ? await response.json() : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Card>
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">Supabase RLS restricts these results to your tenant.</p>
        </header>
        <InvoiceList invoices={invoices} />
      </Card>
    </main>
  );
}
