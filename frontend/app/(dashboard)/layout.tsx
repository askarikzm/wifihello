import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase-client';
import { Navbar } from '@/components/navbar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      {children}
    </div>
  );
}
