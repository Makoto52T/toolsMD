'use client';

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const sizeMap = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export function LoadingSpinner({ size = 'md', className = '', label }: LoadingSpinnerProps) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span
        className={[
          'ds-animate-spin rounded-full border-current border-t-transparent',
          sizeMap[size],
          className,
        ].join(' ')}
      />
      {label && <span className="text-sm text-[var(--color-neutral-500)]">{label}</span>}
      <span className="sr-only">Loading</span>
    </span>
  );
}

export function FullPageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-neutral-50)]">
      <LoadingSpinner size="lg" className="text-[var(--color-primary)]" label={label} />
    </div>
  );
}
