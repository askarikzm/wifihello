'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  MessageSquare, 
  Plus, 
  Clock, 
  CheckCircle,
  AlertCircle,
  User,
  Calendar,
  ChevronRight
} from 'lucide-react';

interface Ticket {
  id: string;
  ticket_no: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  assigned_to?: string;
}

function SupportTicketsContent() {
  const supabase = createSupabaseBrowserClient();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');

  useEffect(() => {
    const fetchTickets = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE || '';

      try {
        const url = statusFilter !== 'all' 
          ? `${baseUrl}/api/support/tickets?status=${statusFilter}`
          : `${baseUrl}/api/support/tickets`;
          
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setTickets(data.data || data || []);
        }
      } catch (error) {
        console.error('Failed to fetch tickets:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [supabase, statusFilter]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
      open: { color: 'bg-blue-100 text-blue-700', icon: <AlertCircle className="h-3 w-3" /> },
      in_progress: { color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-3 w-3" /> },
      resolved: { color: 'bg-green-100 text-green-700', icon: <CheckCircle className="h-3 w-3" /> },
      closed: { color: 'bg-slate-100 text-slate-700', icon: <CheckCircle className="h-3 w-3" /> },
    };
    const config = statusConfig[status] || statusConfig.open;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon}
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig: Record<string, string> = {
      low: 'bg-slate-100 text-slate-600',
      medium: 'bg-blue-100 text-blue-600',
      high: 'bg-orange-100 text-orange-600',
      urgent: 'bg-red-100 text-red-600',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityConfig[priority] || priorityConfig.medium}`}>
        {priority}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-24 animate-pulse bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Support Tickets</h2>
          <p className="text-sm text-slate-600">
            {openCount} open • {inProgressCount} in progress • {resolvedCount} resolved
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          New Ticket
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2">
        {['all', 'open', 'in_progress', 'resolved', 'closed'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        {tickets.length === 0 ? (
          <Card className="p-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-900">No tickets found</p>
            <p className="text-sm text-slate-500 mt-1">
              {statusFilter !== 'all' 
                ? `No ${statusFilter.replace('_', ' ')} tickets`
                : 'Create a new ticket to get started'
              }
            </p>
          </Card>
        ) : (
          tickets.map((ticket) => (
            <Card key={ticket.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm text-slate-500">{ticket.ticket_no}</span>
                    {getStatusBadge(ticket.status)}
                    {getPriorityBadge(ticket.priority)}
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                      {ticket.category}
                    </span>
                  </div>
                  <h3 className="font-medium text-slate-900 mb-1">{ticket.subject}</h3>
                  <p className="text-sm text-slate-600 line-clamp-2">{ticket.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    {ticket.customer_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {ticket.customer_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(ticket.created_at)}
                    </span>
                    {ticket.assigned_to && (
                      <span className="flex items-center gap-1">
                        Assigned to: {ticket.assigned_to}
                      </span>
                    )}
                  </div>
                </div>
                <a 
                  href={`/support/tickets/${ticket.id}`}
                  className="p-2 text-slate-400 hover:text-slate-600"
                >
                  <ChevronRight className="h-5 w-5" />
                </a>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="h-24 animate-pulse bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

export default function SupportTicketsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SupportTicketsContent />
    </Suspense>
  );
}
