import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border-border bg-surface rounded-lg border p-6 shadow-sm ${className}`}
      {...props}
    />
  );
}
