'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  Wifi, 
  WifiOff,
  Signal,
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

interface NetworkStatus {
  onu_serial: string;
  onu_status: 'online' | 'offline' | 'degraded';
  signal_strength: number; // in dBm
  connection_type: string;
  uptime: string;
  download_speed: string;
  upload_speed: string;
  last_checked: string;
  olt_name: string;
  port: string;
}

export function NetworkStatusCard() {
  const supabase = createSupabaseBrowserClient();
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const token = session.access_token;
    let baseUrl = process.env.NEXT_PUBLIC_API_BASE || '';
    
    // Remove trailing /api if present to avoid double /api/api
    baseUrl = baseUrl.replace(/\/api\/?$/, '');

    try {
      const res = await fetch(`${baseUrl}/api/network/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setError(null);
      } else {
        setError('Unable to fetch network status');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatus();
  };

  const getSignalQuality = (dbm: number) => {
    if (dbm >= -20) return { label: 'Excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (dbm >= -23) return { label: 'Good', color: 'text-green-600', bg: 'bg-green-100' };
    if (dbm >= -26) return { label: 'Fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { label: 'Poor', color: 'text-red-600', bg: 'bg-red-100' };
  };

  if (loading) {
    return (
      <Card className="p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-32 mb-4" />
        <div className="h-20 bg-slate-200 rounded" />
      </Card>
    );
  }

  if (error || !status) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Network Status</h3>
          <button 
            onClick={handleRefresh}
            className="text-slate-500 hover:text-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-center py-8 text-slate-500">
          <AlertTriangle className="h-5 w-5 mr-2" />
          <span>{error || 'No data available'}</span>
        </div>
      </Card>
    );
  }

  const signalQuality = getSignalQuality(status.signal_strength);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Network Status</h3>
        <button 
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-slate-500 hover:text-slate-700 disabled:animate-spin"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Connection Status */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`h-14 w-14 rounded-full flex items-center justify-center ${
          status.onu_status === 'online' ? 'bg-green-100' : 
          status.onu_status === 'degraded' ? 'bg-yellow-100' : 'bg-red-100'
        }`}>
          {status.onu_status === 'online' ? (
            <Wifi className="h-7 w-7 text-green-600" />
          ) : status.onu_status === 'degraded' ? (
            <Activity className="h-7 w-7 text-yellow-600" />
          ) : (
            <WifiOff className="h-7 w-7 text-red-600" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-semibold ${
              status.onu_status === 'online' ? 'text-green-600' : 
              status.onu_status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {status.onu_status === 'online' ? 'Connected' : 
               status.onu_status === 'degraded' ? 'Degraded' : 'Offline'}
            </span>
            {status.onu_status === 'online' && (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
          </div>
          <p className="text-sm text-slate-500">
            {status.connection_type} • Uptime: {status.uptime}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Signal Strength */}
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Signal className="h-4 w-4 text-slate-500" />
            <span className="text-xs text-slate-500">Signal Strength</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{status.signal_strength} dBm</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${signalQuality.bg} ${signalQuality.color}`}>
              {signalQuality.label}
            </span>
          </div>
        </div>

        {/* Download Speed */}
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-slate-500" />
            <span className="text-xs text-slate-500">Speed</span>
          </div>
          <div className="text-sm">
            <span className="font-semibold text-green-600">↓ {status.download_speed}</span>
            <span className="text-slate-400 mx-1">/</span>
            <span className="font-semibold text-blue-600">↑ {status.upload_speed}</span>
          </div>
        </div>
      </div>

      {/* ONU Details */}
      <div className="mt-4 pt-4 border-t text-sm">
        <div className="flex justify-between text-slate-600">
          <span>ONU Serial</span>
          <span className="font-mono text-slate-900">{status.onu_serial}</span>
        </div>
        <div className="flex justify-between text-slate-600 mt-1">
          <span>OLT / Port</span>
          <span className="text-slate-900">{status.olt_name} / {status.port}</span>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Last checked: {new Date(status.last_checked).toLocaleString()}
        </p>
      </div>
    </Card>
  );
}
