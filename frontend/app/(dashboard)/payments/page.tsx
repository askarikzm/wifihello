import { createSupabaseServerClient } from '@/lib/supabase-client';
import { Card } from '@/components/ui/card';
import { CreditCard, CheckCircle, Clock, Banknote } from 'lucide-react';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function GatewayBadge({ gateway }: { gateway: string }) {
  const colors: Record<string, string> = {
    jazzcash: 'bg-red-500/20 text-red-400',
    easypaisa: 'bg-green-500/20 text-green-400',
    payfast: 'bg-blue-500/20 text-blue-400',
  };
  
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${colors[gateway] || 'bg-slate-500/20 text-slate-400'}`}>
      {gateway}
    </span>
  );
}

export default async function PaymentsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  
  if (!session) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE;

  // Fetch payments history
  const paymentsRes = await fetch(`${apiBase}/api/payments/history`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const payments = paymentsRes.ok ? await paymentsRes.json() : [];

  // Fetch pending invoices for payment
  const invoicesRes = await fetch(`${apiBase}/api/billing/invoices`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const allInvoices = invoicesRes.ok ? await invoicesRes.json() : [];
  const pendingInvoices = allInvoices.filter((i: any) => i.status === 'pending');

  const totalPaid = payments.filter((p: any) => p.status === 'completed').reduce((sum: number, p: any) => sum + p.amount, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-blue-500" />
          Payments
        </h1>
        <p className="text-sm text-slate-400 mt-1">Manage payments and view transaction history</p>
      </header>

      {/* Outstanding Invoices */}
      {pendingInvoices.length > 0 && (
        <Card className="bg-amber-900/20 border-amber-700/50 mb-6">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5" />
              Outstanding Payments
            </h2>
            <div className="space-y-3">
              {pendingInvoices.map((invoice: any) => (
                <div key={invoice.id} className="flex items-center justify-between bg-slate-800/50 p-4 rounded-lg">
                  <div>
                    <p className="text-white font-medium">{invoice.invoice_number}</p>
                    <p className="text-sm text-slate-400">Due: {formatDate(invoice.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-amber-400">{formatCurrency(invoice.total_amount)}</p>
                    <button className="mt-1 px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
                      Pay Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4">
            <p className="text-slate-400 text-sm">Total Payments</p>
            <p className="text-2xl font-bold text-white">{payments.length}</p>
          </div>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4">
            <p className="text-slate-400 text-sm">Total Paid</p>
            <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalPaid)}</p>
          </div>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4">
            <p className="text-slate-400 text-sm">Last Payment</p>
            <p className="text-2xl font-bold text-white">
              {payments.length > 0 ? formatDate(payments[0].created_at) : '-'}
            </p>
          </div>
        </Card>
      </div>

      {/* Payment History */}
      <Card className="bg-slate-800/50 border-slate-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-500" />
            Payment History
          </h2>
          
          {payments.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No payment history available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Gateway</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Reference</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment: any) => (
                    <tr key={payment.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-sm text-slate-300">
                        {formatDate(payment.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <GatewayBadge gateway={payment.gateway} />
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-400 font-mono">
                        {payment.gateway_reference || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          payment.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {payment.status === 'completed' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {payment.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-white font-medium">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
