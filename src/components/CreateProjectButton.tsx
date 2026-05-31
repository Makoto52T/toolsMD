'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateProjectButton() {
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const router = useRouter();

  const createProject = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw await res.json();
      const p = await res.json();
      router.push('/project/' + p.id);
    } catch {
      setLoading(false);
    }
  };

  if (showForm) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px',
        borderRadius: 10, background: '#0d1117', border: '1px solid #4493f8',
        boxShadow: '0 0 0 2px rgba(68,147,248,0.12)',
      }}>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') createProject();
            if (e.key === 'Escape') { setShowForm(false); setName(''); }
          }}
          placeholder="Project name..."
          style={{
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '8px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={createProject}
            disabled={loading || !name.trim()}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 6, border: 'none',
              background: loading || !name.trim() ? 'var(--surface-elevated)' : 'var(--accent)',
              color: loading || !name.trim() ? 'var(--text-muted)' : '#fff',
              cursor: loading || !name.trim() ? 'default' : 'pointer',
              fontSize: 13, fontWeight: 500,
            }}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={() => { setShowForm(false); setName(''); }}
            style={{
              padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowForm(true)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px 18px', borderRadius: 10,
        background: 'transparent', border: '1px dashed var(--border)',
        color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer',
        minHeight: 56, transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#4493f8'; e.currentTarget.style.color = '#4493f8'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      + New Project
    </button>
  );
}
