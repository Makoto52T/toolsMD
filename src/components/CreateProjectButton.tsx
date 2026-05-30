'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateProjectButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const createProject = async () => {
    const name = prompt('Project name:') || 'Untitled';
    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw await res.json();
      const p = await res.json();
      router.push('/project/' + p.id);
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={createProject}
      disabled={loading}
      className="btn btn-primary btn-lg"
      style={{ marginBottom: 24 }}
    >
      {loading ? 'Creating...' : '+ Create Project'}
    </button>
  );
}
