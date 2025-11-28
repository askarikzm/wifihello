"use client";

import { useQuery } from '@tanstack/react-query';

export function UsageSparkline() {
  const { data, isLoading } = useQuery({
    queryKey: ['usage', 'daily'],
    queryFn: async () => {
      const resp = await fetch('/api/proxy/usage');
      if (!resp.ok) throw new Error('Failed to load usage');
      return resp.json();
    },
  });

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900">Last 30 days usage</h2>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading usage...</p>
      ) : (
        <p className="text-2xl font-semibold text-slate-900">{data?.total_mb ?? 0} MB</p>
      )}
      <p className="text-xs text-slate-500">Live stats sourced from Supabase JWT + NestJS usage module.</p>
    </div>
  );
}
