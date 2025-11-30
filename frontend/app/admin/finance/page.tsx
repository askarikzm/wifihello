'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Download,
  Filter,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface FinanceStats {
  todayCollections: number;
  weekCollections: number;
  monthCollections: number;
  yearCollections: number;
  outstanding: number;
  averagePaymentTime: string;
  collectionRate: number;
  growthPercent: number;
}

interface Payment {
  id: string;
  subscriber_id: string;
  subscriber_name: string;
  amount: number;
  gateway: string;
  status: string;
  reference: string;
  created_at: string;
}

interface Invoice {
  id: string;
  subscriber_id: string;
  subscriber_name: string;
  amount: number;
  status: string;
  due_date: string;
  days_overdue: number;
}

export default function FinanceDashboard() {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([]);
  const [dailyCollections, setDailyCollections] = useState<{date: string; amount: number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('month');

  useEffect(() => {
    const fetchFinanceData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

      try {
        // Fetch finance dashboard
        const financeRes = await fetch(`${baseUrl}/admin/dashboard/finance?period=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (financeRes.ok) {
          const data = await financeRes.json();
          setStats({
            todayCollections: data.todayCollections || 0,
            weekCollections: data.weekCollections || 0,
            monthCollections: data.monthCollections || 0,
            yearCollections: data.yearCollections || 0,
            outstanding: data.outstanding || 0,
            averagePaymentTime: data.averagePaymentTime || '3 days',
            collectionRate: data.collectionRate || 0,
            growthPercent: data.growthPercent || 0,
          });
          setPayments(data.recentPayments || []);
          setDailyCollections(data.dailyCollections || []);
        }

        // Fetch overdue invoices
        const overdueRes = await fetch(`${baseUrl}/admin/invoices/overdue`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (overdueRes.ok) {
          const overdueData = await overdueRes.json();
          setOverdueInvoices(overdueData || []);
        }
      } catch (error) {
        console.error('Failed to fetch finance data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFinanceData();
  }, [supabase, period]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="h-3 w-3" />
            {status}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <Clock className="h-3 w-3" />
            {status}
          </span>
        );
      case 'failed':
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <AlertCircle className="h-3 w-3" />
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-28 animate-pulse bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  // Calculate max for chart
  const maxCollection = Math.max(...dailyCollections.map(d => d.amount), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Finance Dashboard</h2>
          <p className="text-sm text-slate-600">Revenue tracking and payment management</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Today&apos;s Collections</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {formatCurrency(stats?.todayCollections || 0)}
              </p>
            </div>
            <div className="h-11 w-11 rounded-full bg-green-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Monthly Revenue</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {formatCurrency(stats?.monthCollections || 0)}
              </p>
              <div className="flex items-center mt-1">
                {(stats?.growthPercent || 0) >= 0 ? (
                  <>
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-600">+{stats?.growthPercent}%</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-600">{stats?.growthPercent}%</span>
                  </>
                )}
              </div>
            </div>
            <div className="h-11 w-11 rounded-full bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Outstanding</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">
                {formatCurrency(stats?.outstanding || 0)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {overdueInvoices.length} overdue invoices
              </p>
            </div>
            <div className="h-11 w-11 rounded-full bg-orange-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Collection Rate</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {stats?.collectionRate || 0}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Avg: {stats?.averagePaymentTime}
              </p>
            </div>
            <div className="h-11 w-11 rounded-full bg-purple-100 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Collections Chart */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Daily Collections</h3>
          <div className="h-48 flex items-end gap-1">
            {dailyCollections.slice(-14).map((day, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div 
                  className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors"
                  style={{ 
                    height: `${(day.amount / maxCollection) * 100}%`,
                    minHeight: day.amount > 0 ? '4px' : '0'
                  }}
                  title={`${day.date}: ${formatCurrency(day.amount)}`}
                />
                <span className="text-[10px] text-slate-500 -rotate-45 origin-left">
                  {new Date(day.date).getDate()}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Payment Methods */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Payment Methods</h3>
          <div className="space-y-4">
            {['PayFast', 'JazzCash', 'Easypaisa', 'Bank Transfer'].map((method, idx) => {
              const methodPayments = payments.filter(p => 
                p.gateway?.toLowerCase().includes(method.toLowerCase())
              );
              const total = methodPayments.reduce((acc, p) => acc + p.amount, 0);
              const percentage = stats?.monthCollections 
                ? Math.round((total / stats.monthCollections) * 100) 
                : 0;
              
              return (
                <div key={method}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{method}</span>
                    <span className="text-sm text-slate-600">{percentage}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        idx === 0 ? 'bg-blue-500' :
                        idx === 1 ? 'bg-green-500' :
                        idx === 2 ? 'bg-purple-500' :
                        'bg-orange-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Recent Payments</h3>
            <a href="/admin/finance/payments" className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">Subscriber</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Gateway</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 8).map((payment) => (
                  <tr key={payment.id} className="border-b last:border-0 text-sm">
                    <td className="py-2.5">
                      <p className="font-medium text-slate-900">{payment.subscriber_name}</p>
                      <p className="text-xs text-slate-500">{payment.reference}</p>
                    </td>
                    <td className="py-2.5 font-medium text-green-600">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-2.5 text-slate-600">{payment.gateway}</td>
                    <td className="py-2.5">{getStatusBadge(payment.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Overdue Invoices */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Overdue Invoices
            </h3>
            <a href="/admin/finance/invoices" className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">Subscriber</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Days Overdue</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {overdueInvoices.slice(0, 8).map((invoice) => (
                  <tr key={invoice.id} className="border-b last:border-0 text-sm">
                    <td className="py-2.5">
                      <p className="font-medium text-slate-900">{invoice.subscriber_name}</p>
                    </td>
                    <td className="py-2.5 font-medium text-red-600">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        invoice.days_overdue > 30 
                          ? 'bg-red-100 text-red-700' 
                          : invoice.days_overdue > 14 
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {invoice.days_overdue} days
                      </span>
                    </td>
                    <td className="py-2.5">
                      <button className="text-xs text-blue-600 hover:text-blue-700">
                        Send Reminder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
