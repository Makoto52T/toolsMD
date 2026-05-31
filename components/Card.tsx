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
        'rounded-xl border border-[var(--color-neutral-200)] bg-white',
        'shadow-[var(--shadow-card)]',
        hoverable
          ? 'transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]'
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
