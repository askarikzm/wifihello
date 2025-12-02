'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  Search, 
  Filter, 
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronRight,
  User,
  Calendar,
  Tag
} from 'lucide-react';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed';
  category: string;
  subscriber_id: string;
  subscriber_name: string;
  subscriber_email: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface TicketMessage {
  id: string;
  message: string;
  sender_type: 'customer' | 'agent';
  sender_name: string;
  created_at: string;
}

export default function TicketsPage() {
  const supabase = createSupabaseBrowserClient();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchTickets = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.append('status', statusFilter);
        if (priorityFilter !== 'all') params.append('priority', priorityFilter);
        if (search) params.append('search', search);

        const res = await fetch(`${baseUrl}/api/support/tickets?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (res.ok) {
          const data = await res.json();
          setTickets(data || []);
        }
      } catch (error) {
        console.error('Failed to fetch tickets:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [supabase, statusFilter, priorityFilter, search]);

  const fetchTicketMessages = async (ticketId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const token = session.access_token;
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    try {
      const res = await fetch(`${baseUrl}/api/support/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessages(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    fetchTicketMessages(ticket.id);
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const token = session.access_token;
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    try {
      const res = await fetch(`${baseUrl}/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: replyText }),
      });
      
      if (res.ok) {
        setReplyText('');
        fetchTicketMessages(selectedTicket.id);
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const token = session.access_token;
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    try {
      await fetch(`${baseUrl}/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus }),
      });
      
      // Refresh tickets
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status: newStatus as any });
      }
      setTickets(tickets.map(t => 
        t.id === ticketId ? { ...t, status: newStatus as any } : t
      ));
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const getPriorityBadge = (priority: string) => {
    const styles = {
      critical: 'bg-red-100 text-red-700 border-red-200',
      high: 'bg-orange-100 text-orange-700 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      low: 'bg-slate-100 text-slate-700 border-slate-200',
    };
    
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${styles[priority as keyof typeof styles] || styles.low}`}>
        {priority}
      </span>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'pending_customer':
        return <Clock className="h-4 w-4 text-orange-500" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'closed':
        return <XCircle className="h-4 w-4 text-slate-500" />;
      default:
        return null;
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  if (loading) {
    return (
      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        <Card className="w-96 animate-pulse bg-slate-200" />
        <Card className="flex-1 animate-pulse bg-slate-200" />
      </div>
    );
  }

  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Support Tickets</h2>
          <p className="text-sm text-slate-600">
            {openCount} open, {inProgressCount} in progress
          </p>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-16rem)]">
        {/* Ticket List */}
        <div className="w-96 flex flex-col">
          {/* Filters */}
          <Card className="p-3 mb-4">
            <div className="flex gap-2 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tickets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border rounded text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 border rounded text-sm"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="pending_customer">Pending Customer</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 border rounded text-sm"
              >
                <option value="all">All Priority</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </Card>

          {/* Ticket List */}
          <Card className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto">
              {tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
                  <p>No tickets found</p>
                </div>
              ) : (
                tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => handleSelectTicket(ticket)}
                    className={`p-4 border-b cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedTicket?.id === ticket.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(ticket.status)}
                          <span className="font-medium text-slate-900 truncate">
                            {ticket.subject}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 truncate">
                          {ticket.subscriber_name}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {getPriorityBadge(ticket.priority)}
                          <span className="text-xs text-slate-500">
                            {getTimeAgo(ticket.created_at)}
                          </span>
                          {ticket.message_count > 0 && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {ticket.message_count}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Ticket Detail */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {selectedTicket ? (
            <>
              {/* Ticket Header */}
              <div className="p-6 border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {selectedTicket.subject}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {selectedTicket.subscriber_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(selectedTicket.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Tag className="h-4 w-4" />
                        {selectedTicket.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getPriorityBadge(selectedTicket.priority)}
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value)}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="pending_customer">Pending Customer</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
                
                {/* Original Description */}
                <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-700">{selectedTicket.description}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_type === 'agent' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] ${
                      msg.sender_type === 'agent' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-slate-100 text-slate-900'
                    } rounded-lg p-4`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium opacity-75">
                          {msg.sender_name}
                        </span>
                        <span className="text-xs opacity-50">
                          {getTimeAgo(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply Box */}
              <div className="p-4 border-t">
                <div className="flex gap-3">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    className="flex-1 px-4 py-2 border rounded-lg resize-none h-20"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed self-end"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <MessageSquare className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a ticket</p>
              <p className="text-sm">Choose a ticket from the list to view details</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
