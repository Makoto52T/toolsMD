'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useToast } from '@/components/Toast';
import { renderMarkdown } from './markdown';

// Pipeline steps surfaced to the user while the request is in flight. The
// server does these sequentially; the client shows an indeterminate stepper
// since it gets a single response (not a stream).
type Step = 'analyzing' | 'searching' | 'generating' | 'creating' | 'done';

const STEP_LABELS: Record<Step, string> = {
  analyzing: 'วิเคราะห์ content',
  searching: 'ค้นหาข้อมูลเพิ่ม',
  generating: 'สร้าง wiki + project',
  creating: 'สร้าง TMD project',
  done: 'เสร็จสิ้น',
};

const STEP_ORDER: Step[] = ['analyzing', 'searching', 'generating', 'creating', 'done'];

interface DoneInfo {
  wikiPath: string;
  projectId: string | null;
  summary: string;
  usedWebSearch: boolean;
  nodeCount: number;
  edgeCount: number;
  warning?: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'processing'; step: Step }
  | ({ kind: 'done' } & DoneInfo)
  | { kind: 'error'; message: string };

export default function WikiIngestPage() {
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [projectName, setProjectName] = useState('');
  const [webSearch, setWebSearch] = useState(true);
  const [autoProject, setAutoProject] = useState(true);
  const [wikiContent, setWikiContent] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const router = useRouter();
  const toast = useToast();

  const previewHtml = useMemo(() => renderMarkdown(wikiContent), [wikiContent]);
  const processing = status.kind === 'processing';

  const handleProcess = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!rawContent.trim()) {
      toast.error('Raw content is required');
      return;
    }
    setWikiContent('');
    setStatus({ kind: 'processing', step: 'analyzing' });

    // The server returns once; advance the visible step on a soft timer so the
    // user sees the pipeline progressing. The real result overrides this.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const advance = (step: Step, delay: number) =>
      timers.push(
        setTimeout(() => {
          setStatus((s) => (s.kind === 'processing' ? { kind: 'processing', step } : s));
        }, delay)
      );
    if (webSearch) advance('searching', 1500);
    advance('generating', webSearch ? 3500 : 1500);
    if (autoProject) advance('creating', webSearch ? 9000 : 7000);

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch('/api/wiki/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          rawContent,
          tags,
          webSearch,
          autoProject,
          projectName: projectName.trim() || undefined,
        }),
      });
      const data = await res.json();
      timers.forEach(clearTimeout);

      if (!res.ok) {
        const msg = data?.error || 'Ingest failed';
        setStatus({ kind: 'error', message: msg });
        toast.error(msg);
        return;
      }

      setWikiContent(data.wikiContent || '');
      setStatus({
        kind: 'done',
        wikiPath: data.wikiPath,
        projectId: data.projectId ?? null,
        summary: data.summary || '',
        usedWebSearch: Boolean(data.usedWebSearch),
        nodeCount: data.nodeCount ?? 0,
        edgeCount: data.edgeCount ?? 0,
        warning: data.warning,
      });
      if (data.warning) toast.warning(data.warning);
      else toast.success(data.projectId ? 'Saved wiki + created project' : 'Saved to wiki');
    } catch (e: any) {
      timers.forEach(clearTimeout);
      const msg = e?.message || 'Network error';
      setStatus({ kind: 'error', message: msg });
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="border-b border-[var(--color-neutral-200)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-primary)]">
            <span>📥</span> Wiki Ingest
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href="/docs"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-primary)]"
            >
              📘 Docs
            </Link>
            <Button variant="ghost" onClick={() => router.push('/dashboard')}>
              ← Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="mb-6 text-sm text-[var(--color-neutral-600)]">
          วาง raw text อะไรก็ได้ แล้ว AI จะ (1) วิเคราะห์ความเพียงพอ (2) ค้นหาข้อมูลเสริมจาก
          internet (3) แปลงเป็น Obsidian wiki page <strong>และสร้าง TMD project</strong>{' '}
          (nodes + edges + tags) ให้อัตโนมัติ.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input column */}
          <Card padding="lg" className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
                Title <span className="text-[var(--color-error)]">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ชื่อ wiki page"
                className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
                Project name{' '}
                <span className="text-[var(--color-neutral-400)]">(optional, default: ใช้ title)</span>
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={title || 'ชื่อ TMD project ที่จะสร้าง'}
                disabled={!autoProject}
                className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:bg-[var(--color-neutral-100)] disabled:text-[var(--color-neutral-400)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
                Topic tags{' '}
                <span className="text-[var(--color-neutral-400)]">(optional, comma-separated)</span>
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="seo, marketing, notes"
                className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <div className="flex flex-1 flex-col">
              <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
                Raw content <span className="text-[var(--color-error)]">*</span>
              </label>
              <textarea
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                placeholder="วาง raw text ที่นี่..."
                rows={14}
                className="w-full flex-1 resize-y rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 font-mono text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            {/* Option toggles */}
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)] p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-neutral-700)]">
                <input
                  type="checkbox"
                  checked={webSearch}
                  onChange={(e) => setWebSearch(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                🔍 ค้นหาข้อมูลเพิ่มจาก internet
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-neutral-700)]">
                <input
                  type="checkbox"
                  checked={autoProject}
                  onChange={(e) => setAutoProject(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                📊 สร้าง TMD Project อัตโนมัติ
              </label>
            </div>

            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={status} />
              <Button onClick={handleProcess} disabled={processing} loading={processing}>
                {processing ? 'Processing…' : 'Process & Save'}
              </Button>
            </div>
          </Card>

          {/* Preview column */}
          <Card padding="lg" className="flex flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-neutral-700)]">
                Wiki Preview
              </h2>
              {status.kind === 'done' && status.projectId && (
                <Link
                  href={`/projects/${status.projectId}`}
                  className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                >
                  Open project →
                </Link>
              )}
            </div>

            {processing ? (
              <Stepper current={status.step} webSearch={webSearch} autoProject={autoProject} />
            ) : status.kind === 'done' ? (
              <DoneSummary info={status} />
            ) : wikiContent ? (
              <div
                className="prose-wiki min-w-0 flex-1 overflow-auto text-sm leading-relaxed text-[var(--color-neutral-800)]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-neutral-400)]">
                Wiki output จะแสดงที่นี่หลังประมวลผล
              </div>
            )}
          </Card>
        </div>

        {/* Generated wiki markdown shown full-width below once done. */}
        {status.kind === 'done' && wikiContent && (
          <Card padding="lg" className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-neutral-700)]">
              Generated Wiki Page
            </h2>
            <div
              className="prose-wiki min-w-0 overflow-auto text-sm leading-relaxed text-[var(--color-neutral-800)]"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </Card>
        )}
      </main>
    </div>
  );
}

// Indeterminate pipeline stepper shown while processing.
function Stepper({
  current,
  webSearch,
  autoProject,
}: {
  current: Step;
  webSearch: boolean;
  autoProject: boolean;
}) {
  const steps = STEP_ORDER.filter((s) => {
    if (s === 'searching' && !webSearch) return false;
    if (s === 'creating' && !autoProject) return false;
    return true;
  });
  const currentIdx = steps.indexOf(current);
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      {steps.map((s, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo';
        return (
          <div key={s} className="flex items-center gap-3 text-sm">
            <span
              className={
                state === 'done'
                  ? 'text-[var(--color-success)]'
                  : state === 'active'
                    ? 'animate-pulse text-[var(--color-primary)]'
                    : 'text-[var(--color-neutral-300)]'
              }
            >
              {state === 'done' ? '✓' : state === 'active' ? '⏳' : '○'}
            </span>
            <span
              className={
                state === 'todo'
                  ? 'text-[var(--color-neutral-400)]'
                  : 'font-medium text-[var(--color-neutral-700)]'
              }
            >
              {STEP_LABELS[s]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DoneSummary({ info }: { info: DoneInfo }) {
  const wikiName = info.wikiPath.split('/').slice(-1)[0];
  return (
    <div className="flex flex-1 flex-col gap-3 text-sm">
      {info.summary && (
        <p className="text-[var(--color-neutral-700)]">
          <span className="font-medium">สรุป:</span> {info.summary}
        </p>
      )}
      <ul className="space-y-1 text-[var(--color-neutral-600)]">
        <li>
          ✅ Wiki page: <code className="font-mono text-xs">wiki/{wikiName}</code>
        </li>
        <li>{info.usedWebSearch ? '🔍 ใช้ข้อมูลเสริมจาก internet' : '🔍 ไม่ได้ค้นเว็บเพิ่ม (content เพียงพอ)'}</li>
        {info.projectId ? (
          <li>
            📊 TMD project: {info.nodeCount} nodes, {info.edgeCount} edges —{' '}
            <Link
              href={`/projects/${info.projectId}`}
              className="font-medium text-[var(--color-primary)] hover:underline"
            >
              เปิด project →
            </Link>
          </li>
        ) : (
          <li className="text-[var(--color-neutral-400)]">📊 ไม่ได้สร้าง project</li>
        )}
      </ul>
      {info.warning && (
        <p className="rounded-lg bg-[var(--color-warning-50,#fff7ed)] px-3 py-2 text-xs text-[var(--color-warning,#b45309)]">
          ⚠️ {info.warning}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status.kind === 'processing') {
    return (
      <span className="text-sm text-[var(--color-neutral-500)]">
        ⏳ {STEP_LABELS[status.step]}…
      </span>
    );
  }
  if (status.kind === 'done') {
    return (
      <span className="truncate text-sm text-[var(--color-success)]">
        ✓ saved → wiki/{status.wikiPath.split('/').slice(-1)[0]}
        {status.projectId ? ' + project' : ''}
      </span>
    );
  }
  if (status.kind === 'error') {
    return <span className="truncate text-sm text-[var(--color-error)]">✕ {status.message}</span>;
  }
  return <span className="text-sm text-[var(--color-neutral-400)]">idle</span>;
}
