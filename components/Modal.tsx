'use client';

import React, { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  // When false, the modal can only be closed via the X button or an explicit
  // action in the footer (e.g. Cancel) — backdrop click and Esc are disabled.
  // Used for long config forms (node edit) to prevent accidental dismissal.
  dismissable?: boolean;
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (dismissable && e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 ds-animate-fade-in sm:items-center sm:p-4"
      onClick={dismissable ? onClose : undefined}
    >
      <div
        className={[
          'ds-animate-slide-up flex max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-2xl',
          'rounded-t-2xl sm:rounded-2xl',
          sizeMap[size],
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--color-neutral-200)] px-6 py-4">
            <h2 className="text-lg font-bold text-[var(--color-neutral-900)]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 rounded-lg p-2 text-[var(--color-neutral-500)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="border-t border-[var(--color-neutral-200)] px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
