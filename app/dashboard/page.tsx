'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FullPageSpinner } from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';

interface Project {
  id: string;
  name: string;
  description?: string;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        setProjects(await res.json());
      } else {
        router.push('/');
      }
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name.trim()) {
      toast.warning('Project name is required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });
      if (res.ok) {
        setNewProject({ name: '', description: '' });
        setShowCreate(false);
        toast.success('Project created');
        loadProjects();
      } else {
        toast.error('Failed to create project');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Project deleted');
        setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      } else {
        toast.error('Failed to delete project');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) return <FullPageSpinner label="Loading projects..." />;

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="border-b border-[var(--color-neutral-200)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--color-primary)]">
            <span>🗂️</span> ProjectPlanner
          </h1>
          <Button variant="ghost" onClick={() => router.push('/')}>
            Sign Out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--color-neutral-900)]">My Projects</h2>
          <Button onClick={() => setShowCreate(true)} leftIcon={<span className="text-lg leading-none">+</span>}>
            New Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card padding="lg" className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 text-5xl">📭</div>
            <h3 className="mb-1 text-lg font-semibold text-[var(--color-neutral-800)]">No projects yet</h3>
            <p className="mb-6 text-sm text-[var(--color-neutral-500)]">
              Create your first project to start building workflows.
            </p>
            <Button onClick={() => setShowCreate(true)}>Create your first project</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} hoverable padding="md" className="flex flex-col">
                <h3 className="mb-1 text-lg font-semibold text-[var(--color-neutral-900)]">
                  {project.name}
                </h3>
                <p className="mb-4 flex-1 text-sm text-[var(--color-neutral-500)]">
                  {project.description || 'No description'}
                </p>
                <div className="flex gap-2">
                  <Link href={`/projects/${project.id}`} className="flex-1">
                    <Button variant="primary" size="sm" fullWidth>
                      Open
                    </Button>
                  </Link>
                  <Button variant="danger" size="sm" onClick={() => setDeleteTarget(project)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Project"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} loading={creating}>
              Create
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
              Project Name
            </label>
            <input
              type="text"
              value={newProject.name}
              onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              placeholder="My Workflow"
              autoFocus
              className="w-full rounded-lg border border-[var(--color-neutral-300)] px-4 py-2.5 text-base transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
              Description
            </label>
            <textarea
              value={newProject.description}
              onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              placeholder="Optional description"
              rows={3}
              className="w-full rounded-lg border border-[var(--color-neutral-300)] px-4 py-2.5 text-base transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Project"
        danger
        loading={deleting}
        confirmText="Delete"
        message={
          <>
            Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </>
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
