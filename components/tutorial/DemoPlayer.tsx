'use client';

import { useEffect, useRef, useState } from 'react';
import MockCanvas from './MockCanvas';
import type { Chapter } from './types';

// Drives one chapter: renders the active step's scene in MockCanvas and offers
// Play/Pause/Next/Prev + progress dots + auto-play (3s/step). A monotonically
// increasing `stepKey` is passed down so transient CSS animations replay each
// time the active step changes (even when re-selecting the same index).

const STEP_MS = 3200;

export default function DemoPlayer({ chapter }: { chapter: Chapter }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stepKeyRef = useRef(0);
  const [stepKey, setStepKey] = useState(0);

  const last = chapter.steps.length - 1;

  // Reset to first step whenever the chapter changes.
  useEffect(() => {
    setI(0);
    setPlaying(false);
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id]);

  function bump() {
    stepKeyRef.current += 1;
    setStepKey(stepKeyRef.current);
  }

  function go(next: number) {
    const clamped = Math.max(0, Math.min(last, next));
    setI(clamped);
    bump();
  }

  // Auto-play timer.
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (i >= last) {
        setPlaying(false);
      } else {
        go(i + 1);
      }
    }, STEP_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, i, last]);

  function togglePlay() {
    if (i >= last && !playing) {
      // Restart from the top when pressing play at the end.
      go(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }

  const step = chapter.steps[i];

  return (
    <div className="flex flex-col gap-4">
      {/* Demo stage */}
      <div className="relative h-[300px] w-full sm:h-[360px]">
        <MockCanvas scene={step.scene} stepKey={stepKey} />
        {/* Step counter chip */}
        <div className="absolute left-3 top-3 z-30 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-neutral-600)] shadow-sm backdrop-blur">
          {chapter.icon} {i + 1} / {chapter.steps.length}
        </div>
      </div>

      {/* Caption */}
      <div className="min-h-[58px]">
        <p className="text-[15px] font-semibold text-[var(--color-neutral-900)]">{step.label}</p>
        {step.detail && (
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-neutral-600)]">{step.detail}</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(i - 1)}
          disabled={i === 0}
          className="rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] disabled:opacity-40"
          aria-label="Previous step"
        >
          ‹ Prev
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
        >
          {playing ? '⏸ Pause' : i >= last ? '↺ Replay' : '▶ Play'}
        </button>
        <button
          type="button"
          onClick={() => go(i + 1)}
          disabled={i >= last}
          className="rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm font-medium text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-100)] disabled:opacity-40"
          aria-label="Next step"
        >
          Next ›
        </button>

        {/* Progress dots */}
        <div className="ml-auto flex items-center gap-1.5">
          {chapter.steps.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setPlaying(false);
                go(idx);
              }}
              aria-label={`Go to step ${idx + 1}`}
              className="h-2 rounded-full transition-all"
              style={{
                width: idx === i ? 18 : 8,
                background: idx === i ? 'var(--color-primary)' : 'var(--color-neutral-300)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
