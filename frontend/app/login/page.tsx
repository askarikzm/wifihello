"use client";

import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Wifi, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
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

    // Check if user is an admin - admins should use admin portal
    if (data.user) {
      const { data: adminRole } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (adminRole) {
        setError('Admin users should use the Admin Portal to login.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
    }

    router.push('/dashboard');
  }

  // Demo login for POC
  async function handleDemoLogin() {
    setLoading(true);
    setError(null);
    setEmail('demo@wancom.pk');
    setPassword('demo123456');
    
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: 'demo@wancom.pk', 
      password: 'demo123456' 
    });
    if (error) {
      setError('Demo account not configured. Please set up Supabase credentials.');
      setLoading(false);
      return;
    }

    // Check if user is an admin - admins should use admin portal
    if (data.user) {
      const { data: adminRole } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (adminRole) {
        setError('Admin users should use the Admin Portal to login.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
    }

    router.push('/dashboard');
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
            <Wifi className="w-8 h-8 text-blue-500" />
            <span className="text-2xl font-bold text-white">WANCOM</span>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-semibold text-white">Sign in</h1>
            <p className="text-sm text-slate-400 mt-1">Access your customer portal</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
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
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 py-3 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
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
            onClick={handleDemoLogin}
            className="w-full rounded-lg border border-slate-600 hover:border-slate-500 py-3 text-slate-300 hover:text-white font-medium transition-colors disabled:opacity-50"
            disabled={loading}
          >
            Try Demo Account
          </button>

          <p className="text-center text-sm text-slate-400">
            Don&apos;t have an account?{' '}
            <a href="#" className="text-blue-400 hover:text-blue-300">
              Contact Support
            </a>
          </p>

          <p className="text-center text-sm text-slate-500">
            <Link href="/admin/login" className="text-orange-400 hover:text-orange-300">
              Admin Portal →
            </Link>
          </p>
        </form>

        {/* Demo credentials info */}
        <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p className="text-sm text-blue-300 text-center">
            <strong>POC Demo:</strong> demo@wancom.pk / demo123456
          </p>
        </div>
      </div>
    </main>
  );
}
