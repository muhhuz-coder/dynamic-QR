import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, className = '', ...props }: TextFieldProps) {
  const inputId = id ?? props.name;
  return (
    <label className="flex flex-col gap-1.5" htmlFor={inputId}>
      <span className="text-foreground text-sm font-medium">{label}</span>
      <input
        id={inputId}
        className={`border-border bg-background text-foreground focus:border-accent rounded-md border px-3 py-2 text-sm outline-none ${className}`}
        {...props}
      />
      {error && <span className="text-danger text-sm">{error}</span>}
    </label>
  );
}
