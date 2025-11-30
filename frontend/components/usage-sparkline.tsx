"use client";

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Wifi } from 'lucide-react';

interface UsageDay {
  date: string;
  bytes_down: number;
  bytes_up: number;
  download_gb: number;
  upload_gb: number;
}

interface UsageResponse {
  days: UsageDay[];
  total_download_gb: number;
  total_upload_gb: number;
  avg_daily_gb: number;
  peak_day: {
    date: string;
    download_gb: number;
  } | null;
}

function formatBytes(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(1)} TB`;
  }
  return `${gb.toFixed(1)} GB`;
}

export function UsageSparkline() {
  const { data, isLoading, error } = useQuery<UsageResponse>({
    queryKey: ['usage', 'daily'],
    queryFn: async () => {
      const resp = await fetch('/api/proxy/usage');
      if (!resp.ok) throw new Error('Failed to load usage');
      return resp.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-medium text-slate-900 mb-2">Data Usage</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-slate-200 rounded w-1/2"></div>
          <div className="h-16 bg-slate-200 rounded"></div>
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-medium text-slate-900 mb-2">Data Usage</h2>
        <p className="text-sm text-red-500">Failed to load usage data</p>
      </div>
    );
  }

  const days = data.days || [];
  const maxDownload = Math.max(...days.map(d => d.download_gb), 1);
  
  // Calculate week-over-week change
  const lastWeek = days.slice(-7);
  const prevWeek = days.slice(-14, -7);
  const lastWeekTotal = lastWeek.reduce((sum, d) => sum + d.download_gb, 0);
  const prevWeekTotal = prevWeek.reduce((sum, d) => sum + d.download_gb, 0);
  const weekChange = prevWeekTotal > 0 ? ((lastWeekTotal - prevWeekTotal) / prevWeekTotal) * 100 : 0;
  const isUp = weekChange >= 0;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium text-slate-900">Data Usage</h2>
        <div className="flex items-center gap-1">
          <Wifi className="h-4 w-4 text-emerald-500" />
          <span className="text-xs text-slate-500">Last 30 days</span>
        </div>
      </div>
      
      {/* Total usage display */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-bold text-slate-900">
          {formatBytes(data.total_download_gb)}
        </span>
        <span className="text-sm text-slate-500">downloaded</span>
        <span className={`flex items-center text-xs ${isUp ? 'text-orange-600' : 'text-emerald-600'}`}>
          {isUp ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
          {Math.abs(weekChange).toFixed(0)}% vs last week
        </span>
      </div>
      
      {/* Sparkline chart */}
      <div className="flex items-end gap-0.5 h-16 mb-3">
        {days.map((day, i) => {
          const heightPercent = (day.download_gb / maxDownload) * 100;
          const isWeekend = new Date(day.date).getDay() === 0 || new Date(day.date).getDay() === 6;
          
          return (
            <div
              key={day.date}
              className={`flex-1 rounded-t transition-all ${
                isWeekend ? 'bg-blue-500' : 'bg-blue-400'
              } hover:bg-blue-600`}
              style={{ height: `${Math.max(heightPercent, 5)}%` }}
              title={`${day.date}: ${day.download_gb.toFixed(1)} GB`}
            />
          );
        })}
      </div>
      
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center border-t pt-3">
        <div>
          <p className="text-xs text-slate-500">Avg/Day</p>
          <p className="text-sm font-semibold text-slate-700">{data.avg_daily_gb.toFixed(1)} GB</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Uploaded</p>
          <p className="text-sm font-semibold text-slate-700">{formatBytes(data.total_upload_gb)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Peak Day</p>
          <p className="text-sm font-semibold text-slate-700">
            {data.peak_day?.download_gb.toFixed(1) || '0'} GB
          </p>
        </div>
      </div>
    </div>
  );
}
