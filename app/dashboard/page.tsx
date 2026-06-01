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

interface Template {
  id: string;
  name: string;
  description?: string;
  isPublicTemplate?: boolean;
  nodeCount?: number;
  edgeCount?: number;
  tagCount?: number;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(true);
  const [forkingId, setForkingId] = useState<string | null>(null);
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
      const [res, tplRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/projects/templates'),
      ]);
      if (res.ok) {
        setProjects(await res.json());
      } else {
        router.push('/');
        return;
      }
      if (tplRes.ok) setTemplates(await tplRes.json());
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

  const useTemplate = async (tpl: Template) => {
    setForkingId(tpl.id);
    try {
      const res = await fetch(`/api/projects/${tpl.id}/fork`, { method: 'POST' });
      if (res.ok) {
        const created = await res.json();
        toast.success('Project created from template');
        router.push(`/projects/${created.id}`);
      } else {
        toast.error('Failed to use template');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setForkingId(null);
    }
  };

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
          <div className="flex items-center gap-2">
            <Link
              href="/docs"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-primary)]"
            >
              📘 Docs
            </Link>
            <Button variant="ghost" onClick={() => router.push('/')}>
              Sign Out
            </Button>
          </div>
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

        {/* Templates section — reusable starting points (is_template=1 projects).
            Hidden from the projects grid above; surfaced here with fork/open. */}
        {templates.length > 0 && (
          <section className="mt-12">
            <button
              type="button"
              onClick={() => setShowTemplates((s) => !s)}
              className="mb-4 flex items-center gap-2 text-xl font-bold text-[var(--color-neutral-900)]"
            >
              <span className="text-base text-[var(--color-neutral-500)]">
                {showTemplates ? '▼' : '▶'}
              </span>
              Templates
              <span className="rounded-full bg-[var(--color-neutral-200)] px-2 py-0.5 text-xs font-medium text-[var(--color-neutral-600)]">
                {templates.length}
              </span>
            </button>

            {showTemplates && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((tpl) => (
                  <Card key={tpl.id} hoverable padding="md" className="flex flex-col">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)]">
                        Template
                      </span>
                      {tpl.isPublicTemplate && (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          Public
                        </span>
                      )}
                    </div>
                    <h3 className="mb-1 text-lg font-semibold text-[var(--color-neutral-900)]">
                      {tpl.name}
                    </h3>
                    <p className="mb-2 flex-1 text-sm text-[var(--color-neutral-500)]">
                      {tpl.description || 'No description'}
                    </p>
                    <p className="mb-4 text-xs text-[var(--color-neutral-400)]">
                      {tpl.nodeCount ?? 0} nodes · {tpl.edgeCount ?? 0} edges · {tpl.tagCount ?? 0} tags
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        fullWidth
                        loading={forkingId === tpl.id}
                        onClick={() => useTemplate(tpl)}
                      >
                        Use template
                      </Button>
                      <Link href={`/projects/${tpl.id}`}>
                        <Button variant="secondary" size="sm">
                          Open
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
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
