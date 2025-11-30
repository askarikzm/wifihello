'use client';

import { useEffect, useState, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { Card } from '@/components/ui/card';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  Signal,
  SignalLow,
  SignalZero,
  Server,
  Wifi,
  WifiOff,
  Zap,
  ThermometerSun
} from 'lucide-react';

interface OLTStatus {
  id: string;
  name: string;
  ip: string;
  vendor: string;
  model: string;
  status: 'online' | 'offline' | 'degraded';
  uptime: string;
  onu_count: number;
  offline_onus: number;
  cpu_usage: number;
  temperature: number;
  last_check: string;
}

interface Alarm {
  id: string;
  olt_id: string;
  olt_name: string;
  severity: 'critical' | 'major' | 'minor' | 'warning';
  type: string;
  message: string;
  created_at: string;
  acknowledged: boolean;
}

interface OfflineONU {
  subscriber_id: string;
  subscriber_name: string;
  onu_serial: string;
  olt_name: string;
  last_seen: string;
  offline_duration: string;
}

export default function NOCDashboard() {
  const supabase = createSupabaseBrowserClient();
  const [olts, setOlts] = useState<OLTStatus[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [offlineOnus, setOfflineOnus] = useState<OfflineONU[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNOCData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const token = session.access_token;
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    try {
      const res = await fetch(`${baseUrl}/admin/dashboard/noc`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        setOlts(data.olts || []);
        setAlarms(data.alarms || []);
        setOfflineOnus(data.offlineOnus || []);
      }
    } catch (error) {
      console.error('Failed to fetch NOC data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNOCData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchNOCData, 30000);
    return () => clearInterval(interval);
  }, [fetchNOCData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNOCData();
  };

  const handleAcknowledgeAlarm = async (alarmId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const token = session.access_token;
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE;

    await fetch(`${baseUrl}/admin/alarms/${alarmId}/acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlarms(alarms.map(a => 
      a.id === alarmId ? { ...a, acknowledged: true } : a
    ));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'offline':
        return <WifiOff className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5 text-slate-400" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'major':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'minor':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'warning':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getSignalStrength = (percentage: number) => {
    if (percentage >= 80) return <Signal className="h-4 w-4 text-green-500" />;
    if (percentage >= 50) return <SignalLow className="h-4 w-4 text-yellow-500" />;
    return <SignalZero className="h-4 w-4 text-red-500" />;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-24 animate-pulse bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  const onlineOlts = olts.filter(o => o.status === 'online').length;
  const totalOnus = olts.reduce((acc, o) => acc + o.onu_count, 0);
  const offlineOnuCount = olts.reduce((acc, o) => acc + o.offline_onus, 0);
  const criticalAlarms = alarms.filter(a => a.severity === 'critical' && !a.acknowledged).length;

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Network Operations Center</h2>
          <p className="text-sm text-slate-600">Real-time network monitoring and alerts</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
              onlineOlts === olts.length ? 'bg-green-100' : 'bg-yellow-100'
            }`}>
              <Server className={`h-5 w-5 ${
                onlineOlts === olts.length ? 'text-green-600' : 'text-yellow-600'
              }`} />
            </div>
            <div>
              <p className="text-sm text-slate-600">OLTs Online</p>
              <p className="text-xl font-bold">{onlineOlts}/{olts.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Wifi className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Total ONUs</p>
              <p className="text-xl font-bold">{totalOnus.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
              offlineOnuCount === 0 ? 'bg-green-100' : 'bg-red-100'
            }`}>
              <WifiOff className={`h-5 w-5 ${
                offlineOnuCount === 0 ? 'text-green-600' : 'text-red-600'
              }`} />
            </div>
            <div>
              <p className="text-sm text-slate-600">ONUs Offline</p>
              <p className="text-xl font-bold">{offlineOnuCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
              criticalAlarms === 0 ? 'bg-green-100' : 'bg-red-100'
            }`}>
              <AlertTriangle className={`h-5 w-5 ${
                criticalAlarms === 0 ? 'text-green-600' : 'text-red-600'
              }`} />
            </div>
            <div>
              <p className="text-sm text-slate-600">Critical Alarms</p>
              <p className="text-xl font-bold">{criticalAlarms}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Alarms */}
      {alarms.filter(a => !a.acknowledged).length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Active Alarms
          </h3>
          <div className="space-y-3">
            {alarms
              .filter(a => !a.acknowledged)
              .sort((a, b) => {
                const severityOrder = { critical: 0, major: 1, minor: 2, warning: 3 };
                return severityOrder[a.severity] - severityOrder[b.severity];
              })
              .map((alarm) => (
                <div 
                  key={alarm.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${getSeverityColor(alarm.severity)}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase">{alarm.severity}</span>
                      <span className="text-xs">•</span>
                      <span className="text-xs">{alarm.olt_name}</span>
                    </div>
                    <p className="font-medium mt-1">{alarm.message}</p>
                    <p className="text-xs mt-1 opacity-75">
                      {new Date(alarm.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAcknowledgeAlarm(alarm.id)}
                    className="ml-4 px-3 py-1.5 text-xs font-medium bg-white/50 rounded hover:bg-white/80 transition-colors"
                  >
                    Acknowledge
                  </button>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* OLT Status Grid */}
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">OLT Status</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-slate-600">
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">IP Address</th>
                <th className="pb-3 font-medium">Vendor</th>
                <th className="pb-3 font-medium">ONUs</th>
                <th className="pb-3 font-medium">CPU</th>
                <th className="pb-3 font-medium">Temp</th>
                <th className="pb-3 font-medium">Uptime</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {olts.map((olt) => (
                <tr key={olt.id} className="border-b last:border-0">
                  <td className="py-3">
                    {getStatusIcon(olt.status)}
                  </td>
                  <td className="py-3">
                    <p className="font-medium text-slate-900">{olt.name}</p>
                    <p className="text-xs text-slate-500">{olt.model}</p>
                  </td>
                  <td className="py-3 font-mono text-sm">{olt.ip}</td>
                  <td className="py-3 text-sm">{olt.vendor}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{olt.onu_count}</span>
                      {olt.offline_onus > 0 && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                          {olt.offline_onus} offline
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {getSignalStrength(100 - olt.cpu_usage)}
                      <span className="text-sm">{olt.cpu_usage}%</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <ThermometerSun className={`h-4 w-4 ${
                        olt.temperature > 70 ? 'text-red-500' : 
                        olt.temperature > 50 ? 'text-yellow-500' : 'text-green-500'
                      }`} />
                      <span className="text-sm">{olt.temperature}°C</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-slate-600">{olt.uptime}</td>
                  <td className="py-3">
                    <a 
                      href={`/admin/noc/olt/${olt.id}`}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Details
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Offline ONUs */}
      {offlineOnus.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-red-500" />
            Offline ONUs ({offlineOnus.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-slate-600">
                  <th className="pb-3 font-medium">Subscriber</th>
                  <th className="pb-3 font-medium">ONU Serial</th>
                  <th className="pb-3 font-medium">OLT</th>
                  <th className="pb-3 font-medium">Last Seen</th>
                  <th className="pb-3 font-medium">Duration</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {offlineOnus.slice(0, 20).map((onu, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-3">
                      <p className="font-medium text-slate-900">{onu.subscriber_name}</p>
                    </td>
                    <td className="py-3 font-mono text-sm">{onu.onu_serial}</td>
                    <td className="py-3 text-sm">{onu.olt_name}</td>
                    <td className="py-3 text-sm text-slate-600">
                      {new Date(onu.last_seen).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <span className="text-sm text-red-600 font-medium">
                        {onu.offline_duration}
                      </span>
                    </td>
                    <td className="py-3">
                      <a 
                        href={`/admin/subscribers/${onu.subscriber_id}`}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
