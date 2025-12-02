'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  AlertCircle, 
  Download,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react';

interface OverdueInvoice {
  id: string;
  invoice_no: string;
  subscriber_id: string;
  customer_name: string;
  account_no: string;
  amount: number;
  tax: number;
  due_date: string;
  days_overdue: number;
  phone?: string;
  email?: string;
}

export default function OverdueInvoicesPage() {
  const supabase = createSupabaseBrowserClient();
  const [invoices, setInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  useEffect(() => {
    const fetchOverdueInvoices = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE || '';

      try {
        const res = await fetch(`${baseUrl}/api/admin/invoices/overdue?page=${page}&limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setInvoices(data.data || []);
          setTotalPages(data.pagination?.totalPages || 1);
        }
      } catch (error) {
        console.error('Failed to fetch overdue invoices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOverdueInvoices();
  }, [supabase, page]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleSendReminder = async (invoiceId: string) => {
    setSendingReminder(invoiceId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const token = session.access_token;
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE || '';

    try {
      await fetch(`${baseUrl}/api/admin/invoices/${invoiceId}/remind`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Reminder sent successfully!');
    } catch (error) {
      console.error('Failed to send reminder:', error);
      alert('Failed to send reminder');
    } finally {
      setSendingReminder(null);
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.account_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSeverityClass = (daysOverdue: number) => {
    if (daysOverdue > 60) return 'bg-red-600 text-white';
    if (daysOverdue > 30) return 'bg-red-500 text-white';
    if (daysOverdue > 14) return 'bg-orange-500 text-white';
    return 'bg-yellow-500 text-white';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="h-96 animate-pulse bg-slate-200" />
      </div>
    );
  }

  const totalOutstanding = invoices.reduce((acc, inv) => acc + inv.amount + (inv.tax || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Overdue Invoices</h2>
          <p className="text-sm text-slate-600">
            {invoices.length} overdue invoices • Total: {formatCurrency(totalOutstanding)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-slate-50">
            <Mail className="h-4 w-4" />
            Send All Reminders
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, account number, or invoice..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>
      </Card>

      {/* Invoices Table */}
      <Card className="p-6">
        {filteredInvoices.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No overdue invoices found</p>
            <p className="text-sm mt-1">All invoices are paid on time!</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-slate-600">
                    <th className="pb-3 font-medium">Invoice</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Due Date</th>
                    <th className="pb-3 font-medium">Days Overdue</th>
                    <th className="pb-3 font-medium">Contact</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0">
                      <td className="py-3">
                        <p className="font-mono text-sm font-medium">{invoice.invoice_no}</p>
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-slate-900">{invoice.customer_name}</p>
                        <p className="text-xs text-slate-500">{invoice.account_no}</p>
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-red-600">
                          {formatCurrency(invoice.amount + (invoice.tax || 0))}
                        </p>
                      </td>
                      <td className="py-3 text-sm text-slate-600">
                        {new Date(invoice.due_date).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityClass(invoice.days_overdue)}`}>
                          {invoice.days_overdue} days
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {invoice.phone && (
                            <a href={`tel:${invoice.phone}`} className="text-slate-500 hover:text-slate-700">
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                          {invoice.email && (
                            <a href={`mailto:${invoice.email}`} className="text-slate-500 hover:text-slate-700">
                              <Mail className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSendReminder(invoice.id)}
                            disabled={sendingReminder === invoice.id}
                            className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                          >
                            {sendingReminder === invoice.id ? 'Sending...' : 'Send Reminder'}
                          </button>
                          <a 
                            href={`/admin/subscribers/${invoice.subscriber_id}`}
                            className="text-xs text-slate-600 hover:text-slate-700"
                          >
                            View
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-slate-600">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
