'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useToast } from '@/components/Toast';
import { renderMarkdown } from './markdown';

type Status =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'done'; wikiPath: string; templateId: string | null; warning?: string }
  | { kind: 'error'; message: string };

export default function WikiIngestPage() {
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [rawContent, setRawContent] = useState('');
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
    setStatus({ kind: 'processing' });
    setWikiContent('');
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch('/api/wiki/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), rawContent, tags }),
      });
      const data = await res.json();
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
        templateId: data.templateId ?? null,
        warning: data.warning,
      });
      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success('Saved to wiki and template');
      }
    } catch (e: any) {
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
          วาง raw text อะไรก็ได้ (markdown, notes, code, plain text) แล้ว AI จะแปลงเป็น
          Obsidian wiki page เก็บลง <code className="font-mono">ai-wiki/wiki/</code> และ
          สร้างเป็น template ส่วนตัวของคุณ.
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
                placeholder="ชื่อ wiki page (ใช้เป็นชื่อ template ด้วย)"
                className="w-full rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-neutral-700)]">
                Topic tags <span className="text-[var(--color-neutral-400)]">(optional, comma-separated)</span>
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
                rows={18}
                className="w-full flex-1 resize-y rounded-lg border border-[var(--color-neutral-300)] px-3 py-2 font-mono text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-neutral-700)]">
                Wiki Preview
              </h2>
              {status.kind === 'done' && status.templateId && (
                <Link
                  href={`/projects/${status.templateId}`}
                  className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                >
                  Open template →
                </Link>
              )}
            </div>

            {processing ? (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-neutral-400)]">
                AI กำลังแปลง content…
              </div>
            ) : wikiContent ? (
              <div
                className="prose-wiki min-w-0 flex-1 overflow-auto text-sm leading-relaxed text-[var(--color-neutral-800)]"
                // Markdown is escaped then converted by renderMarkdown (no raw
                // HTML passes through), so this is safe from injected markup.
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-neutral-400)]">
                Wiki output จะแสดงที่นี่หลังประมวลผล
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status.kind === 'processing') {
    return <span className="text-sm text-[var(--color-neutral-500)]">⏳ processing…</span>;
  }
  if (status.kind === 'done') {
    return (
      <span className="truncate text-sm text-[var(--color-success)]">
        ✓ saved → {status.wikiPath.split('/').slice(-2).join('/')}
        {status.templateId ? ' + template' : ''}
      </span>
    );
  }
  if (status.kind === 'error') {
    return <span className="truncate text-sm text-[var(--color-error)]">✕ {status.message}</span>;
  }
  return <span className="text-sm text-[var(--color-neutral-400)]">idle</span>;
}
