import { createSupabaseServerClient } from '@/lib/supabase-client';
import { redirect } from 'next/navigation';

type Payment = {
  id: string;
  gateway?: string;
  amount?: number;
  status?: string;
  settled_at?: string;
};

export default async function PaymentsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const apiBase = process.env.NEXT_PUBLIC_API_BASE;
  if (!apiBase) {
    throw new Error('NEXT_PUBLIC_API_BASE is not configured');
  }

  const res = await fetch(`${apiBase}/api/payments/history`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const payments: Payment[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold">Payments</h1>
      <p className="text-sm text-slate-500">Gateway confirmations are verified via HMAC before updating Supabase rows.</p>
      <div className="mt-4 space-y-3">
        {payments.length === 0 && <p className="text-sm text-slate-500">No payment attempts recorded.</p>}
        {payments.map((payment) => (
          <div key={payment.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between text-sm">
              <span>{payment.gateway}</span>
              <span className="font-medium">PKR {payment.amount?.toFixed?.(0)}</span>
            </div>
            <p className="text-xs text-slate-500">
              Status: {payment.status} {payment.settled_at ? `• Settled ${payment.settled_at}` : ''}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
