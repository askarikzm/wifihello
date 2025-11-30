'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  MessageSquare, 
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Send,
  X,
  Loader2,
  Headphones
} from 'lucide-react';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed';
  category: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  message: string;
  sender_type: 'customer' | 'agent';
  sender_name: string;
  created_at: string;
}

interface SupportClientProps {
  tickets: Ticket[];
}

const categories = [
  { value: 'billing', label: 'Billing & Payments' },
  { value: 'technical', label: 'Technical Support' },
  { value: 'network', label: 'Network Issues' },
  { value: 'account', label: 'Account Management' },
  { value: 'other', label: 'Other' },
];

export function SupportClient({ tickets: initialTickets }: SupportClientProps) {
  const supabase = createSupabaseBrowserClient();
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // New ticket form
  const [newTicket, setNewTicket] = useState({
    subject: '',
    category: 'technical',
    priority: 'medium',
    description: '',
  });

  const fetchTicketMessages = async (ticketId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setLoading(true);
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    try {
      const res = await fetch(`${baseUrl}/api/support/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessages(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    fetchTicketMessages(ticket.id);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setSubmitting(true);
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    try {
      const res = await fetch(`${baseUrl}/api/support/tickets`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTicket),
      });
      
      if (res.ok) {
        const ticket = await res.json();
        setTickets([ticket, ...tickets]);
        setShowNewTicket(false);
        setNewTicket({
          subject: '',
          category: 'technical',
          priority: 'medium',
          description: '',
        });
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    try {
      const res = await fetch(`${baseUrl}/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${session.access_token}`,
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
            <AlertCircle className="h-3 w-3" />
            Open
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
            <Clock className="h-3 w-3" />
            In Progress
          </span>
        );
      case 'pending_customer':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400">
            <Clock className="h-3 w-3" />
            Awaiting Reply
          </span>
        );
      case 'resolved':
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
            <CheckCircle className="h-3 w-3" />
            {status === 'resolved' ? 'Resolved' : 'Closed'}
          </span>
        );
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

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <Headphones className="h-6 w-6 text-blue-500" />
            Support
          </h1>
          <p className="text-sm text-slate-400 mt-1">Get help with your account or report issues</p>
        </div>
        <button
          onClick={() => setShowNewTicket(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </button>
      </div>

      {/* New Ticket Modal */}
      {showNewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg mx-4 p-6 bg-slate-800 border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Create Support Ticket</h2>
              <button 
                onClick={() => setShowNewTicket(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={newTicket.subject}
                  onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
                  placeholder="Brief description of your issue"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newTicket.category}
                    onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical - Service Down</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 resize-none h-32"
                  placeholder="Please describe your issue in detail..."
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTicket(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Ticket'
                  )}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Ticket View Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col bg-slate-800 border-slate-700">
            {/* Header */}
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {selectedTicket.subject}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(selectedTicket.status)}
                    <span className="text-xs text-slate-500">
                      Created {getTimeAgo(selectedTicket.created_at)}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedTicket(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-slate-300 mt-3 p-3 bg-slate-700/50 rounded-lg">
                {selectedTicket.description}
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  No messages yet. Our team will respond shortly.
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] rounded-lg p-3 ${
                      msg.sender_type === 'customer'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-100'
                    }`}>
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
                ))
              )}
            </div>

            {/* Reply */}
            {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
              <div className="p-4 border-t border-slate-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
                    onKeyPress={(e) => e.key === 'Enter' && handleSendReply()}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tickets List */}
      <Card className="overflow-hidden bg-slate-800/50 border-slate-700">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <MessageSquare className="h-12 w-12 mb-3 opacity-50" />
            <p className="font-medium">No support tickets</p>
            <p className="text-sm">Create a ticket to get help from our team</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => handleSelectTicket(ticket)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white truncate">
                      {ticket.subject}
                    </span>
                    {getStatusBadge(ticket.status)}
                  </div>
                  <p className="text-sm text-slate-400 truncate">
                    {ticket.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {categories.find(c => c.value === ticket.category)?.label} • {getTimeAgo(ticket.created_at)}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-500 flex-shrink-0 ml-4" />
              </button>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
