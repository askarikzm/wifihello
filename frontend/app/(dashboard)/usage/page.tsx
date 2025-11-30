import { createSupabaseServerClient } from '@/lib/supabase-client';
import { Card } from '@/components/ui/card';
import { BarChart3, TrendingUp, Download, Upload, Calendar } from 'lucide-react';

export default async function UsagePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  
  if (!session) return null;

  const usageRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/usage/daily`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const usage = usageRes.ok ? await usageRes.json() : { days: [], total_download_gb: 0, total_upload_gb: 0, avg_daily_gb: 0 };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-blue-500" />
          Data Usage
        </h1>
        <p className="text-sm text-slate-400 mt-1">Monitor your bandwidth consumption over time</p>
      </header>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Download className="h-4 w-4" />
              Total Downloaded
            </div>
            <p className="text-2xl font-bold text-white">{usage.total_download_gb?.toFixed(1) || 0} GB</p>
          </div>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Upload className="h-4 w-4" />
              Total Uploaded
            </div>
            <p className="text-2xl font-bold text-white">{usage.total_upload_gb?.toFixed(1) || 0} GB</p>
          </div>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <TrendingUp className="h-4 w-4" />
              Daily Average
            </div>
            <p className="text-2xl font-bold text-white">{usage.avg_daily_gb?.toFixed(1) || 0} GB</p>
          </div>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Calendar className="h-4 w-4" />
              Peak Day
            </div>
            <p className="text-2xl font-bold text-white">{usage.peak_day?.download_gb?.toFixed(1) || 0} GB</p>
            <p className="text-xs text-slate-500">{usage.peak_day?.date || '-'}</p>
          </div>
        </Card>
      </div>

      {/* Usage Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Daily Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Date</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Download</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Upload</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {(usage.days || []).slice().reverse().map((row: any) => (
                  <tr key={row.date} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-3 px-4 text-sm text-slate-300">{row.date}</td>
                    <td className="py-3 px-4 text-sm text-right text-blue-400">{row.download_gb?.toFixed(1)} GB</td>
                    <td className="py-3 px-4 text-sm text-right text-emerald-400">{row.upload_gb?.toFixed(1)} GB</td>
                    <td className="py-3 px-4 text-sm text-right text-white font-medium">
                      {((row.download_gb || 0) + (row.upload_gb || 0)).toFixed(1)} GB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </main>
  );
}
