'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  Search, 
  Filter, 
  Plus,
  MoreVertical,
  User,
  Mail,
  Phone,
  MapPin,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Download
} from 'lucide-react';

interface Subscriber {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  package_name: string;
  package_speed: string;
  status: 'active' | 'suspended' | 'pending' | 'terminated';
  onu_serial: string;
  onu_status: 'online' | 'offline';
  balance: number;
  created_at: string;
  last_payment: string;
}

export default function SubscribersPage() {
  const supabase = createSupabaseBrowserClient();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    const fetchSubscribers = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
        });
        
        if (search) params.append('search', search);
        if (statusFilter !== 'all') params.append('status', statusFilter);

        const res = await fetch(`${baseUrl}/admin/subscribers?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (res.ok) {
          const data = await res.json();
          setSubscribers(data.data || []);
          setTotal(data.total || 0);
          setTotalPages(Math.ceil((data.total || 0) / limit));
        }
      } catch (error) {
        console.error('Failed to fetch subscribers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscribers();
  }, [supabase, page, search, statusFilter]);

  const handleAction = async (action: string, subscriberId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const token = session.access_token;
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    try {
      await fetch(`${baseUrl}/admin/subscribers/${subscriberId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Refresh the list
      setPage(1);
    } catch (error) {
      console.error(`Failed to ${action} subscriber:`, error);
    }
    
    setShowDropdown(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="h-3 w-3" />
            Active
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <XCircle className="h-3 w-3" />
            Suspended
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case 'terminated':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            <XCircle className="h-3 w-3" />
            Terminated
          </span>
        );
      default:
        return null;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="p-6 animate-pulse bg-slate-200 h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Subscribers</h2>
          <p className="text-sm text-slate-600">{total.toLocaleString()} total subscribers</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-slate-50">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add Subscriber
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone, or ONU serial..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                <th className="px-6 py-3">Subscriber</th>
                <th className="px-6 py-3">Package</th>
                <th className="px-6 py-3">ONU</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Balance</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {subscribers.map((subscriber) => (
                <tr key={subscriber.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center">
                        <User className="h-5 w-5 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{subscriber.full_name}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {subscriber.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {subscriber.phone}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{subscriber.package_name}</p>
                    <p className="text-xs text-slate-500">{subscriber.package_speed}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {subscriber.onu_status === 'online' ? (
                        <Wifi className="h-4 w-4 text-green-500" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <p className="font-mono text-xs">{subscriber.onu_serial}</p>
                        <p className={`text-xs ${
                          subscriber.onu_status === 'online' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {subscriber.onu_status}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(subscriber.status)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-medium ${
                      subscriber.balance < 0 ? 'text-red-600' : 'text-slate-900'
                    }`}>
                      {formatCurrency(subscriber.balance)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(subscriber.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 relative">
                    <button
                      onClick={() => setShowDropdown(showDropdown === subscriber.id ? null : subscriber.id)}
                      className="p-1 hover:bg-slate-100 rounded"
                    >
                      <MoreVertical className="h-4 w-4 text-slate-500" />
                    </button>
                    
                    {showDropdown === subscriber.id && (
                      <div className="absolute right-6 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border z-10">
                        <a
                          href={`/admin/subscribers/${subscriber.id}`}
                          className="block px-4 py-2 text-sm hover:bg-slate-50"
                        >
                          View Details
                        </a>
                        <a
                          href={`/admin/subscribers/${subscriber.id}/edit`}
                          className="block px-4 py-2 text-sm hover:bg-slate-50"
                        >
                          Edit
                        </a>
                        {subscriber.status === 'active' && (
                          <button
                            onClick={() => handleAction('suspend', subscriber.id)}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Suspend
                          </button>
                        )}
                        {subscriber.status === 'suspended' && (
                          <button
                            onClick={() => handleAction('reactivate', subscriber.id)}
                            className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                          >
                            Reactivate
                          </button>
                        )}
                        <button
                          onClick={() => handleAction('reset-onu', subscriber.id)}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
                        >
                          Reset ONU
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <p className="text-sm text-slate-600">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-1 rounded text-sm ${
                    page === pageNum 
                      ? 'bg-blue-600 text-white' 
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
