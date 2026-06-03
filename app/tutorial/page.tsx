'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/BrandMark';
import DemoPlayer from '@/components/tutorial/DemoPlayer';
import { CHAPTERS } from '@/components/tutorial/chapters';

// Public, no-auth animated tutorial. Left: chapter list. Right: animated demo
// player + explanation. The demo is a hand-controlled mock canvas (not React
// Flow) so every step animates exactly. Mobile: chapters become a horizontal
// scroller above the demo.

// Public "Script Mode" example templates (owned by toonteamm, is_public_template=1,
// fixed ids seeded by scripts/seed-script-mode-examples.cjs). They appear in every
// user's Templates section on the dashboard, ready to fork. Opening them directly
// requires being the owner; everyone else forks from the dashboard first.
const SCRIPT_EXAMPLES = [
  {
    id: '5c1b7000-0000-4000-a000-000000000001',
    icon: '🔁',
    title: 'Loop + Call + Return',
    blurb: 'env array → วน for-of → call() ยิง HTTP ทุกรอบ → return รวมเป็น list',
  },
  {
    id: '5c1b7000-0000-4000-a000-000000000002',
    icon: '📞',
    title: 'Call แล้ว Return',
    blurb: 'await call() รับผลกลับ → ปรับแต่ง → return ส่งต่อ node ถัดไปผ่าน inputs[]',
  },
  {
    id: '5c1b7000-0000-4000-a000-000000000003',
    icon: '🔔',
    title: 'Send (Fire & Forget)',
    blurb: 'await send() ยิง notification ทิ้งโดยไม่รอผล → งานหลัก return ทันที',
  },
];

export default function TutorialPage() {
  const [active, setActive] = useState(0);
  const chapter = CHAPTERS[active];

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-50)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Link href="/dashboard" aria-label="toolsMD home">
              <Wordmark />
            </Link>
            <span className="hidden h-5 w-px bg-[var(--color-neutral-200)] sm:block" />
            <span className="hidden font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-neutral-500)] sm:inline">
              Tutorial
            </span>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              href="/docs"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              Docs
            </Link>
            <Link
              href="/wiki-graph"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              🕸️ Knowledge Graph
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              Dashboard →
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--color-neutral-900)] sm:text-[1.9375rem]">
            เรียนรู้ TMD แบบเห็นภาพ
          </h1>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            {CHAPTERS.length} บท เล่น animation ทีละขั้น ครบทุก node type และ feature
          </p>
        </div>

        {/* Mobile chapter scroller */}
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {CHAPTERS.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(idx)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium transition-colors ${
                idx === active
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                  : 'border-[var(--color-neutral-200)] bg-white text-[var(--color-neutral-600)]'
              }`}
            >
              <span>{c.icon}</span>
              {c.num}. {c.title}
            </button>
          ))}
        </div>

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <nav className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-24 space-y-1.5">
              {CHAPTERS.map((c, idx) => {
                const on = idx === active;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActive(idx)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      on
                        ? 'border-[var(--color-primary)] bg-white shadow-sm'
                        : 'border-transparent hover:bg-[var(--color-neutral-100)]'
                    }`}
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
                      style={{
                        background: on ? 'var(--color-primary)' : 'var(--color-neutral-100)',
                      }}
                    >
                      {c.icon}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block text-[13.5px] font-semibold ${
                          on ? 'text-[var(--color-primary)]' : 'text-[var(--color-neutral-800)]'
                        }`}
                      >
                        {c.num}. {c.title}
                      </span>
                      <span className="block truncate text-[11.5px] text-[var(--color-neutral-400)]">
                        {c.blurb}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Main demo area */}
          <main className="min-w-0 flex-1">
            <div className="rounded-2xl border border-[var(--color-neutral-200)] bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-neutral-100)] text-lg">
                  {chapter.icon}
                </span>
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-neutral-900)]">
                    บทที่ {chapter.num}: {chapter.title}
                  </h2>
                  <p className="text-xs text-[var(--color-neutral-500)]">{chapter.blurb}</p>
                </div>
              </div>

              <DemoPlayer chapter={chapter} />
            </div>

            {/* Prev / Next chapter */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActive((a) => Math.max(0, a - 1))}
                disabled={active === 0}
                className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] disabled:opacity-40"
              >
                ‹ บทก่อนหน้า
              </button>
              {active < CHAPTERS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActive((a) => Math.min(CHAPTERS.length - 1, a + 1))}
                  className="rounded-lg bg-[var(--color-neutral-900)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-neutral-700)]"
                >
                  บทถัดไป ›
                </button>
              ) : (
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
                >
                  เริ่มสร้างเลย →
                </Link>
              )}
            </div>
          </main>
        </div>

        <section className="mt-12 border-t border-[var(--color-neutral-200)] pt-8">
          <h2 className="text-lg font-bold tracking-tight text-[var(--color-neutral-900)]">
            ลองเล่น template ตัวอย่าง
          </h2>
          <p className="mt-1 text-sm text-[var(--color-neutral-500)]">
            3 ตัวอย่าง Script Mode ที่รันได้จริง — call() · send() · return. กดเปิดเพื่อดูโครงสร้าง
            แล้วกด ▶ Run เพื่อเห็นผลลัพธ์ (ถ้ายังไม่ได้ของคุณ ให้กด “Use template” ใน Dashboard เพื่อ fork ก่อน)
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {SCRIPT_EXAMPLES.map((ex) => (
              <Link
                key={ex.id}
                href={`/projects/${ex.id}`}
                className="group rounded-xl border border-[var(--color-neutral-200)] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-md"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ex.icon}</span>
                  <span className="font-semibold text-[var(--color-neutral-900)]">{ex.title}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--color-neutral-500)]">{ex.blurb}</p>
                <span className="mt-3 inline-block text-xs font-medium text-[var(--color-primary)] group-hover:underline">
                  เปิด template →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-[var(--color-neutral-200)] pt-6 text-sm text-[var(--color-neutral-400)]">
          อยากอ่านแบบละเอียด?{' '}
          <Link href="/docs" className="font-medium text-[var(--color-primary)] hover:underline">
            ไปที่ Docs
          </Link>{' '}
          หรือ{' '}
          <Link href="/dashboard" className="font-medium text-[var(--color-primary)] hover:underline">
            เปิด Dashboard
          </Link>{' '}
          แล้วเริ่มจาก template.
        </footer>
      </div>
    </div>
  );
}
