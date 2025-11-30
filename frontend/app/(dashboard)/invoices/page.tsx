import { createSupabaseServerClient } from '@/lib/supabase-client';
import { Card } from '@/components/ui/card';
import { FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';

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

function StatusBadge({ status }: { status: string }) {
  const config = {
    paid: { icon: CheckCircle, color: 'text-emerald-400 bg-emerald-400/10', label: 'Paid' },
    pending: { icon: Clock, color: 'text-amber-400 bg-amber-400/10', label: 'Pending' },
    overdue: { icon: AlertCircle, color: 'text-red-400 bg-red-400/10', label: 'Overdue' },
  }[status] || { icon: Clock, color: 'text-slate-400 bg-slate-400/10', label: status };
  
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

export default async function InvoicesPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  
  if (!session) return null;

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/billing/invoices`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const invoices = response.ok ? await response.json() : [];

  const totalPaid = invoices.filter((i: any) => i.status === 'paid').reduce((sum: number, i: any) => sum + i.total_amount, 0);
  const totalPending = invoices.filter((i: any) => i.status === 'pending').reduce((sum: number, i: any) => sum + i.total_amount, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <FileText className="h-6 w-6 text-blue-500" />
          Invoices
        </h1>
        <p className="text-sm text-slate-400 mt-1">View and manage your billing history</p>
      </header>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4">
            <p className="text-slate-400 text-sm">Total Invoices</p>
            <p className="text-2xl font-bold text-white">{invoices.length}</p>
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
            <p className="text-slate-400 text-sm">Pending Amount</p>
            <p className="text-2xl font-bold text-amber-400">{formatCurrency(totalPending)}</p>
          </div>
        </Card>
      </div>

      {/* Invoices Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Invoice</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Period</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Amount</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice: any) => (
                  <tr key={invoice.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium text-white">{invoice.invoice_number}</p>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-300">
                      {formatDate(invoice.billing_period_start)} - {formatDate(invoice.billing_period_end)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-white font-medium">
                      {formatCurrency(invoice.total_amount)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-slate-300">
                      {formatDate(invoice.due_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </main>
  );
}
