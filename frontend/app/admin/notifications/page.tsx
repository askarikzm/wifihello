'use client';

import { useState } from 'react';
import { 
  Bell, 
  Send, 
  Users, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  MessageSquare,
  Mail,
  Smartphone,
  Filter,
  Search
} from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  channel: 'sms' | 'email' | 'both';
  recipients: string;
  sentAt: string;
  status: 'sent' | 'pending' | 'failed';
}

const notifications: Notification[] = [
  {
    id: '1',
    title: 'Maintenance Notice',
    message: 'Scheduled maintenance on Dec 1, 2025 from 2 AM to 4 AM',
    type: 'warning',
    channel: 'both',
    recipients: 'All Subscribers',
    sentAt: 'Nov 28, 2025 10:30 AM',
    status: 'sent'
  },
  {
    id: '2',
    title: 'Payment Reminder',
    message: 'Your invoice is due in 3 days. Please pay to avoid service interruption.',
    type: 'info',
    channel: 'sms',
    recipients: '45 subscribers',
    sentAt: 'Nov 27, 2025 9:00 AM',
    status: 'sent'
  },
  {
    id: '3',
    title: 'New Package Available',
    message: 'Upgrade to our new 100 Mbps plan at just Rs. 2,500/month!',
    type: 'success',
    channel: 'email',
    recipients: 'Active Subscribers',
    sentAt: 'Nov 25, 2025 2:00 PM',
    status: 'sent'
  },
  {
    id: '4',
    title: 'Service Outage Alert',
    message: 'We are experiencing connectivity issues in Sector F-8. Our team is working on it.',
    type: 'error',
    channel: 'both',
    recipients: 'F-8 Area',
    sentAt: 'Nov 24, 2025 5:45 PM',
    status: 'sent'
  },
];

export default function NotificationsPage() {
  const [showCompose, setShowCompose] = useState(false);
  const [filter, setFilter] = useState('all');
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    channel: 'both',
    recipients: 'all',
  });

  const handleSend = () => {
    // Simulate sending notification
    alert('Notification sent successfully!');
    setShowCompose(false);
    setNewNotification({ title: '', message: '', channel: 'both', recipients: 'all' });
  };

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'warning': return 'bg-amber-100 text-amber-700';
      case 'success': return 'bg-green-100 text-green-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Notifications</h2>
          <p className="text-slate-500 mt-1">Send and manage subscriber notifications</p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Send className="h-4 w-4" />
          New Notification
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Send className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">1,245</p>
              <p className="text-sm text-slate-500">Sent This Month</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">98.5%</p>
              <p className="text-sm text-slate-500">Delivery Rate</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Smartphone className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">856</p>
              <p className="text-sm text-slate-500">SMS Sent</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Mail className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">389</p>
              <p className="text-sm text-slate-500">Emails Sent</p>
            </div>
          </div>
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">New Notification</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Title</label>
                <input
                  type="text"
                  value={newNotification.title}
                  onChange={(e) => setNewNotification({...newNotification, title: e.target.value})}
                  placeholder="Notification title"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
                <textarea
                  value={newNotification.message}
                  onChange={(e) => setNewNotification({...newNotification, message: e.target.value})}
                  placeholder="Write your notification message..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">{newNotification.message.length}/160 characters (SMS limit)</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Channel</label>
                  <select
                    value={newNotification.channel}
                    onChange={(e) => setNewNotification({...newNotification, channel: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="both">SMS & Email</option>
                    <option value="sms">SMS Only</option>
                    <option value="email">Email Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Recipients</label>
                  <select
                    value={newNotification.recipients}
                    onChange={(e) => setNewNotification({...newNotification, recipients: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">All Subscribers</option>
                    <option value="active">Active Only</option>
                    <option value="suspended">Suspended Only</option>
                    <option value="overdue">Overdue Payments</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCompose(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!newNotification.title || !newNotification.message}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Send Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search notifications..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All Channels</option>
          <option value="sms">SMS Only</option>
          <option value="email">Email Only</option>
        </select>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Notification History</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {notifications.map((notification) => (
            <div key={notification.id} className="px-6 py-4 hover:bg-slate-50">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${getTypeStyles(notification.type)}`}>
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-900">{notification.title}</h4>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusStyles(notification.status)}`}>
                        {notification.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{notification.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {notification.recipients}
                      </span>
                      <span className="flex items-center gap-1">
                        {notification.channel === 'sms' ? <Smartphone className="h-3.5 w-3.5" /> : 
                         notification.channel === 'email' ? <Mail className="h-3.5 w-3.5" /> :
                         <MessageSquare className="h-3.5 w-3.5" />}
                        {notification.channel === 'both' ? 'SMS & Email' : notification.channel.toUpperCase()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {notification.sentAt}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
