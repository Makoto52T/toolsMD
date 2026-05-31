'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useToast } from '@/components/Toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const doDemoLogin = async (value: string) => {
    if (!value.trim()) {
      toast.warning('Please enter an email');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, name: value.split('@')[0] }),
      });
      if (res.ok) {
        router.push('/dashboard');
      } else {
        toast.error('Login failed. Please try again.');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (e: React.FormEvent) => {
    e.preventDefault();
    doDemoLogin(email);
  };

  const handleGoogleLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/auth/google/callback`;
    const scope = 'openid profile email';
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_type=code&scope=${encodeURIComponent(scope)}`;

    if (clientId && clientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE') {
      window.location.href = googleAuthUrl;
    } else {
      toast.info('Google OAuth not configured — using demo mode');
      doDemoLogin(email || 'demo@example.com');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] p-4">
      <Card padding="lg" className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-2xl">
            🗂️
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-neutral-900)]">ProjectPlanner</h1>
          <p className="mt-2 text-sm text-[var(--color-neutral-500)]">
            Visual workflow planning with canvas editor
          </p>
        </div>

        <Button
          variant="secondary"
          fullWidth
          size="lg"
          onClick={handleGoogleLogin}
          leftIcon={
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          }
        >
          Sign in with Google
        </Button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--color-neutral-200)]" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-3 text-[var(--color-neutral-400)]">or try demo</span>
          </div>
        </div>

        <form onSubmit={handleDemoLogin} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="demo@example.com"
            className="w-full rounded-lg border border-[var(--color-neutral-300)] px-4 py-3 text-base transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
          <Button type="submit" variant="primary" size="lg" loading={loading} fullWidth>
            {loading ? 'Signing in...' : 'Demo Login'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--color-neutral-400)]">
          Demo mode: use any email to test. Configure Google OAuth in .env.local for production.
        </p>
      </Card>
    </div>
  );
}
