"use client";

import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Check if user has admin role in admin_roles table
    if (data.user) {
      const { data: adminRole, error: roleError } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (roleError || !adminRole) {
        // Also check user_metadata as fallback
        const metadataRole = data.user.user_metadata?.role;
        if (!['admin', 'noc', 'finance', 'support', 'superadmin', 'supervisor'].includes(metadataRole)) {
          setError('Access denied. You do not have admin privileges. Please use the Customer Portal.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }
    }
    
    router.push('/admin');
  }

  // Demo admin login for POC
  async function handleDemoAdminLogin() {
    setLoading(true);
    setError(null);
    setEmail('admin@wancom.pk');
    setPassword('@dmin123456');
    
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: 'admin@wancom.pk', 
      password: '@dmin123456' 
    });
    
    if (error) {
      setError('Admin demo account not configured. See setup instructions below.');
      setLoading(false);
      return;
    }

    // Check admin_roles table first
    if (data.user) {
      const { data: adminRole } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (!adminRole) {
        // Fallback to user_metadata
        const metadataRole = data.user.user_metadata?.role;
        if (!['admin', 'noc', 'finance', 'support', 'superadmin', 'supervisor'].includes(metadataRole)) {
          setError('Admin account role not configured. Add user to admin_roles table or set role in user_metadata.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }
    }
    
    router.push('/admin');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-6">
      <div className="w-full max-w-md">
        {/* Back to home */}
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <form onSubmit={handleLogin} className="w-full space-y-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-8 backdrop-blur-sm">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-8 h-8 text-orange-500" />
            <span className="text-2xl font-bold text-white">WANCOM Admin</span>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-semibold text-white">Admin Portal</h1>
            <p className="text-sm text-slate-400 mt-1">Sign in with your admin credentials</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors"
                placeholder="admin@wancom.pk"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-colors"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button 
            className="w-full rounded-lg bg-orange-600 hover:bg-orange-700 py-3 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in to Admin'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-slate-800/50 px-2 text-slate-400">or</span>
            </div>
          </div>

          <button 
            type="button"
            onClick={handleDemoAdminLogin}
            className="w-full rounded-lg border border-slate-600 hover:border-slate-500 py-3 text-slate-300 hover:text-white font-medium transition-colors disabled:opacity-50"
            disabled={loading}
          >
            Try Demo Admin Account
          </button>

          <p className="text-center text-sm text-slate-400">
            Not an admin?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Customer Login
            </Link>
          </p>
        </form>

        {/* Admin setup info */}
        <div className="mt-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/30 space-y-2">
          <p className="text-sm text-orange-300 font-medium">
            Admin Setup Required:
          </p>
          <ol className="text-xs text-orange-200/80 space-y-1 list-decimal list-inside">
            <li>Go to Supabase Dashboard → Authentication → Users</li>
            <li>Click &quot;Add User&quot; and create admin@wancom.pk</li>
            <li>After creation, click the user and edit user_metadata</li>
            <li>Add: <code className="bg-slate-800 px-1 rounded">{`{"role": "admin"}`}</code></li>
          </ol>
        </div>
      </div>
    </main>
  );
}
