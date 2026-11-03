import type { LucideIcon } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode, useEffect } from 'react';

export function PageHeader(props: { title: string; description?: string; actions?: ReactNode }) {
  // El título de la pestaña del navegador acompaña a la sección (útil con varias pestañas abiertas).
  useEffect(() => {
    document.title = `${props.title} · Etiquetas de góndola`;
  }, [props.title]);
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
        {props.description && <p className="mt-1 text-sm text-slate-500">{props.description}</p>}
      </div>
      {props.actions && <div className="flex gap-2">{props.actions}</div>}
    </header>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 aria-invalid:border-red-400';

export function Field(props: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={props.className}>
      <label htmlFor={props.htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {props.label}
        {props.required && <span className="text-red-500"> *</span>}
      </label>
      {props.children}
      {props.error ? (
        <p className="mt-1 text-xs text-red-600">{props.error}</p>
      ) : (
        props.hint && <p className="mt-1 text-xs text-slate-500">{props.hint}</p>
      )}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      {title && <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">{title}</h2>}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
} as const;

export function StatCard(props: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  hint?: string;
}) {
  const { label, value, icon: Icon, tone = 'neutral', hint } = props;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex size-8 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function ErrorMessage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado';
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}
