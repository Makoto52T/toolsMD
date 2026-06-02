'use client';

import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({
  hoverable = false,
  padding = 'md',
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        'rounded-[var(--radius-card)] border border-[var(--color-neutral-200)] bg-white',
        'shadow-[var(--shadow-card)]',
        hoverable
          ? 'transition-all duration-200 [transition-timing-function:var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[var(--color-neutral-300)] hover:shadow-[var(--shadow-card-hover)]'
          : '',
        paddingMap[padding],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
