'use client';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03,
        backgroundImage: 'radial-gradient(circle, var(--text-muted) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }} />

      {/* Gradient orb */}
      <div style={{
        position: 'absolute',
        top: '-30%', left: '50%',
        width: 800, height: 800,
        transform: 'translateX(-50%)',
        background: 'radial-gradient(circle, rgba(68,147,248,0.08) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px' }}>
        {/* Logo + tagline */}
        <div style={{ marginBottom: 48 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56, height: 56,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--accent-bg)',
            border: '1px solid var(--border-accent)',
            marginBottom: 20,
            fontSize: 28,
          }}>
            🧩
          </div>
          <h1 style={{
            fontSize: 36,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}>
            toolsMD
          </h1>
          <p style={{
            fontSize: 15,
            color: 'var(--text-muted)',
            maxWidth: 340,
            margin: '0 auto',
            lineHeight: 1.6,
          }}>
            Visual system planner — drag nodes, connect flows, export architecture as Markdown
          </p>
        </div>

        {/* Google Sign-in */}
        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 40px',
            borderRadius: 'var(--radius-lg)',
            background: '#fff',
            color: '#1f1f1f',
            fontSize: 15,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#fbbc04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {/* Footer */}
        <p style={{
          marginTop: 48,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}>
          No credit card required • Free to start
        </p>
      </div>
    </div>
  );
}
