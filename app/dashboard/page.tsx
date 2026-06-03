'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/Button';
import { Wordmark, BrandMark } from '@/components/BrandMark';
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
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/dashboard" aria-label="toolsMD home">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/tutorial"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              📖 Tutorial
            </Link>
            <Link
              href="/wiki-ingest"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              Wiki Ingest
            </Link>
            <Link
              href="/wiki-graph"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              🕸️ Knowledge Graph
            </Link>
            <Link
              href="/docs"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              Docs
            </Link>
            <div className="mx-1 h-5 w-px bg-[var(--color-neutral-200)]" />
            <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
              Sign out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[1.9375rem] font-bold tracking-tight text-[var(--color-neutral-900)]">
              Projects
            </h1>
            <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
              {projects.length > 0
                ? `${projects.length} architecture${projects.length === 1 ? '' : 's'} on your canvas`
                : 'Each project is a canvas of nodes wired into runnable chains'}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} leftIcon={<span className="text-base leading-none">+</span>}>
            New project
          </Button>
        </div>

        {projects.length === 0 ? (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-dashed border-[var(--color-neutral-300)] bg-white">
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)]">
                <BrandMark size={34} tone="light" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--color-neutral-900)]">
                Start your first architecture
              </h2>
              <p className="mt-1.5 mb-6 max-w-sm text-sm leading-relaxed text-[var(--color-neutral-500)]">
                Drop nodes on the canvas, give each one a function, HTTP call, or Puppeteer step,
                then connect them into a chain you can run.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => setShowCreate(true)}>Create a blank project</Button>
                {templates.length > 0 && (
                  <Button variant="secondary" onClick={() => setShowTemplates(true)}>
                    Browse templates
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white shadow-[var(--shadow-card)] transition-all duration-200 [transition-timing-function:var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[var(--color-neutral-300)] hover:shadow-[var(--shadow-card-hover)]"
              >
                <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-[var(--color-primary)] transition-transform duration-300 [transition-timing-function:var(--ease-out-quart)] group-hover:scale-x-100" />
                <Link href={`/projects/${project.id}`} className="flex flex-1 flex-col p-5">
                  <h3 className="text-[1.0625rem] font-semibold leading-snug text-[var(--color-neutral-900)]">
                    {project.name}
                  </h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--color-neutral-500)] line-clamp-3">
                    {project.description || 'No description yet'}
                  </p>
                </Link>
                <div className="flex items-center gap-2 border-t border-[var(--color-neutral-100)] px-5 py-3">
                  <Link href={`/projects/${project.id}`} className="flex-1">
                    <Button variant="primary" size="sm" fullWidth>
                      Open canvas
                    </Button>
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(project)}
                    aria-label={`Delete ${project.name}`}
                    className="rounded-lg p-2 text-[var(--color-neutral-400)] transition-colors hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18M8 6V4h8v2m-9 0v14a1 1 0 001 1h8a1 1 0 001-1V6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Templates section — reusable starting points (is_template=1 projects).
            Hidden from the projects grid above; surfaced here with fork/open. */}
        {templates.length > 0 && (
          <section className="mt-14">
            <button
              type="button"
              onClick={() => setShowTemplates((s) => !s)}
              className="group mb-5 flex w-full items-center gap-3 border-t border-[var(--color-neutral-200)] pt-6 text-left"
            >
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`text-[var(--color-neutral-400)] transition-transform duration-200 ${showTemplates ? 'rotate-90' : ''}`}
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
              <h2 className="text-xl font-bold tracking-tight text-[var(--color-neutral-900)]">
                Templates
              </h2>
              <span className="rounded-full border border-[var(--color-neutral-200)] bg-white px-2 py-0.5 font-mono text-xs font-medium text-[var(--color-neutral-600)]">
                {templates.length}
              </span>
              <span className="ml-auto text-sm font-medium text-[var(--color-neutral-400)] transition-colors group-hover:text-[var(--color-neutral-600)]">
                {showTemplates ? 'Hide' : 'Show'}
              </span>
            </button>

            {showTemplates && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white shadow-[var(--shadow-card)] transition-all duration-200 [transition-timing-function:var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[var(--color-neutral-300)] hover:shadow-[var(--shadow-card-hover)]"
                  >
                    <div className="flex flex-1 flex-col p-5">
                      <div className="mb-2 flex items-center gap-1.5">
                        <span className="rounded-md bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                          Template
                        </span>
                        {tpl.isPublicTemplate && (
                          <span className="rounded-md bg-[var(--color-success)]/12 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--color-success)]">
                            Public
                          </span>
                        )}
                      </div>
                      <h3 className="text-[1.0625rem] font-semibold leading-snug text-[var(--color-neutral-900)]">
                        {tpl.name}
                      </h3>
                      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--color-neutral-500)] line-clamp-3">
                        {tpl.description || 'No description'}
                      </p>
                      <div className="mt-3 flex items-center gap-3 font-mono text-[0.7rem] text-[var(--color-neutral-400)]">
                        <span><span className="text-[var(--color-neutral-700)]">{tpl.nodeCount ?? 0}</span> nodes</span>
                        <span className="text-[var(--color-neutral-200)]">·</span>
                        <span><span className="text-[var(--color-neutral-700)]">{tpl.edgeCount ?? 0}</span> edges</span>
                        <span className="text-[var(--color-neutral-200)]">·</span>
                        <span><span className="text-[var(--color-neutral-700)]">{tpl.tagCount ?? 0}</span> tags</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-t border-[var(--color-neutral-100)] px-5 py-3">
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
                  </div>
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
