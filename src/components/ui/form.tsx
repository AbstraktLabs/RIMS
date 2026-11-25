"use client";

import { Search, X } from "lucide-react";

const base =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-[#212529] placeholder-slate-400 transition-all focus:border-[#044d73] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#044d73]/10 disabled:cursor-not-allowed disabled:opacity-60";

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className = "",
}: {
  label?: string;
  error?: string | null;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium text-slate-700">
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${base} ${className}`} />;
}

/** Numeric input that keeps the raw text while typing and reports numbers. */
export function NumberInput({
  value,
  onChange,
  min,
  step = "any",
  className = "",
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      className={`${base} tabular-nums ${className}`}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...rest} className={`${base} cursor-pointer pr-8 ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...rest} className={`${base} ${className}`} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-4 py-2 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-[#044d73]" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-[#044d73]"
      />
      {label}
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${base} bg-white pl-10 pr-9`}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FormGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  const c = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={`grid grid-cols-1 gap-4 ${c}`}>{children}</div>;
}

/** Inline compact select for toolbars */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-[#044d73] focus:outline-none focus:ring-4 focus:ring-[#044d73]/10"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DateRangeInputs({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (r: { from: string; to: string }) => void;
}) {
  const cls =
    "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-[#044d73] focus:outline-none focus:ring-4 focus:ring-[#044d73]/10";
  return (
    <div className="flex items-center gap-1.5">
      <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} className={cls} />
      <span className="text-xs text-slate-400">to</span>
      <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} className={cls} />
    </div>
  );
}
