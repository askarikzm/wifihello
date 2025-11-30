'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  Users, 
  DollarSign, 
  AlertTriangle, 
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Wifi
} from 'lucide-react';

interface DashboardStats {
  revenue: {
    today: number;
    month: number;
    outstanding: number;
    trend: number;
  };
  subscribers: {
    total: number;
    active: number;
    suspended: number;
    newThisMonth: number;
  };
  network: {
    oltsOnline: number;
    oltsTotal: number;
    onusOffline: number;
    alarms: number;
  };
  support: {
    openTickets: number;
    pendingTickets: number;
    avgResponseTime: string;
  };
}

interface RecentPayment {
  id: string;
  subscriber_name: string;
  amount: number;
  status: string;
  created_at: string;
}

interface RecentTicket {
  id: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
}

export default function AdminDashboard() {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

      try {
        // Fetch revenue dashboard
        const revenueRes = await fetch(`${baseUrl}/admin/dashboard/revenue`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const revenueData = revenueRes.ok ? await revenueRes.json() : {};

        // Fetch NOC dashboard
        const nocRes = await fetch(`${baseUrl}/admin/dashboard/noc`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const nocData = nocRes.ok ? await nocRes.json() : {};

        // Fetch subscribers
        const subsRes = await fetch(`${baseUrl}/admin/subscribers?limit=5`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const subsData = subsRes.ok ? await subsRes.json() : { total: 0, data: [] };

        // Compose stats
        setStats({
          revenue: {
            today: revenueData.todayCollections || 0,
            month: revenueData.monthlyRevenue || 0,
            outstanding: revenueData.outstanding || 0,
            trend: revenueData.growthPercent || 0,
          },
          subscribers: {
            total: subsData.total || 0,
            active: revenueData.activeSubscribers || 0,
            suspended: revenueData.suspendedSubscribers || 0,
            newThisMonth: revenueData.newSubscribersThisMonth || 0,
          },
          network: {
            oltsOnline: nocData.olts?.filter((o: any) => o.status === 'online').length || 0,
            oltsTotal: nocData.olts?.length || 0,
            onusOffline: nocData.offlineOnus?.length || 0,
            alarms: nocData.alarms?.length || 0,
          },
          support: {
            openTickets: revenueData.openTickets || 0,
            pendingTickets: 0,
            avgResponseTime: '2.4h',
          },
        });

        // Fetch recent payments
        const paymentsRes = await fetch(`${baseUrl}/admin/dashboard/finance?period=today`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const paymentsData = paymentsRes.ok ? await paymentsRes.json() : {};
        setRecentPayments(paymentsData.recentPayments || []);

        // Fetch recent tickets
        const ticketsRes = await fetch(`${baseUrl}/support/tickets?limit=5`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const ticketsData = ticketsRes.ok ? await ticketsRes.json() : [];
        setRecentTickets(ticketsData.slice(0, 5));

      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-32 animate-pulse bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Revenue Today */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Today&apos;s Revenue</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatCurrency(stats?.revenue.today || 0)}
              </p>
              <div className="flex items-center mt-1">
                {(stats?.revenue.trend || 0) >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                )}
                <span className={`text-sm ${(stats?.revenue.trend || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats?.revenue.trend || 0}% vs last month
                </span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </Card>

        {/* Active Subscribers */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Active Subscribers</p>
              <p className="text-2xl font-bold text-slate-900">
                {stats?.subscribers.active?.toLocaleString() || 0}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                +{stats?.subscribers.newThisMonth || 0} this month
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>

        {/* Network Status */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Network Health</p>
              <p className="text-2xl font-bold text-slate-900">
                {stats?.network.oltsOnline || 0}/{stats?.network.oltsTotal || 0} OLTs
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {stats?.network.onusOffline || 0} ONUs offline
              </p>
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              stats?.network.alarms ? 'bg-yellow-100' : 'bg-green-100'
            }`}>
              <Wifi className={`h-6 w-6 ${
                stats?.network.alarms ? 'text-yellow-600' : 'text-green-600'
              }`} />
            </div>
          </div>
        </Card>

        {/* Support Tickets */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Open Tickets</p>
              <p className="text-2xl font-bold text-slate-900">
                {stats?.support.openTickets || 0}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Avg response: {stats?.support.avgResponseTime}
              </p>
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              (stats?.support.openTickets || 0) > 10 ? 'bg-red-100' : 'bg-blue-100'
            }`}>
              <AlertTriangle className={`h-6 w-6 ${
                (stats?.support.openTickets || 0) > 10 ? 'text-red-600' : 'text-blue-600'
              }`} />
            </div>
          </div>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Monthly Revenue</h3>
          <p className="text-3xl font-bold text-slate-900">
            {formatCurrency(stats?.revenue.month || 0)}
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Outstanding</span>
              <span className="font-medium text-orange-600">
                {formatCurrency(stats?.revenue.outstanding || 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Collection Rate</span>
              <span className="font-medium text-green-600">
                {stats?.revenue.month && stats?.revenue.outstanding
                  ? Math.round((stats.revenue.month / (stats.revenue.month + stats.revenue.outstanding)) * 100)
                  : 0}%
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Subscriber Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-slate-600">Active</span>
              </div>
              <span className="font-medium">{stats?.subscribers.active || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-slate-600">Suspended</span>
              </div>
              <span className="font-medium">{stats?.subscribers.suspended || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-slate-600">Total</span>
              </div>
              <span className="font-medium">{stats?.subscribers.total || 0}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Network Alerts</h3>
          {stats?.network.alarms ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">{stats.network.alarms} active alarms</span>
              </div>
              <p className="text-sm text-slate-600">
                {stats.network.onusOffline} ONUs currently offline
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">All systems operational</span>
            </div>
          )}
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Recent Payments</h3>
            <a href="/admin/finance" className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </a>
          </div>
          <div className="space-y-3">
            {recentPayments.length > 0 ? (
              recentPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-slate-900">{payment.subscriber_name}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(payment.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-green-600">{formatCurrency(payment.amount)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      payment.status === 'completed' 
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">No recent payments</p>
            )}
          </div>
        </Card>

        {/* Recent Tickets */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Recent Tickets</h3>
            <a href="/admin/tickets" className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </a>
          </div>
          <div className="space-y-3">
            {recentTickets.length > 0 ? (
              recentTickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{ticket.subject}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(ticket.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ticket.priority === 'high' || ticket.priority === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : ticket.priority === 'medium'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {ticket.priority}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ticket.status === 'open'
                        ? 'bg-blue-100 text-blue-700'
                        : ticket.status === 'in_progress'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">No recent tickets</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
