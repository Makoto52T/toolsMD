'use client';

import { useState } from 'react';

export default function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [deleted, setDeleted] = useState(false);

  if (deleted) return null;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete project "${projectName}"?\n\nThis will permanently delete all nodes, functions, and edges.`)) return;

    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleted(true);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch {
      alert('Delete failed');
    }
  };

  return (
    <button
      onClick={handleDelete}
      className="delete-btn"
      title="Delete project"
      aria-label={`Delete ${projectName}`}
    >
      🗑️
    </button>
  );
}
