import { createSupabaseServerClient } from '@/lib/supabase-client';
import { Card } from '@/components/ui/card';
import { redirect } from 'next/navigation';

export default async function UsagePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const usageRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/usage/daily`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const usage = usageRes.ok ? await usageRes.json() : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Card>
        <h1 className="text-xl font-semibold">Daily Usage</h1>
        <div className="mt-4 space-y-2">
          {usage.map((row: any) => (
            <div key={row.date} className="flex justify-between text-sm text-slate-700">
              <span>{row.date}</span>
              <span>{row.total_mb} MB</span>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}
