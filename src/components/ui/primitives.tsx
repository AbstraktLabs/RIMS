"use client";

import Link from "next/link";
import { AlertTriangle, Inbox, Loader2, RotateCcw, type LucideIcon } from "lucide-react";
import { titleCase } from "@/lib/client/format";

export const PRIMARY = "#044d73";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "dark";
const btnStyles: Record<BtnVariant, string> = {
  primary: "bg-[#044d73] text-white hover:bg-[#033a57] shadow-sm",
  dark: "bg-zinc-900 text-white hover:bg-zinc-700",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon: Icon,
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"
      } ${btnStyles[variant]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  icon: Icon,
  children,
  size = "md",
}: {
  href: string;
  variant?: BtnVariant;
  icon?: LucideIcon;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors ${
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"
      } ${btnStyles[variant]}`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </Link>
  );
}

export function Card({ children, className = "", padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none ${padded ? "p-4 sm:p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2">
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#044d73]/10 text-[#044d73]">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-xs font-semibold text-slate-400 hover:text-[#044d73]">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const ACCENTS = {
  primary: { border: "border-l-[#044d73]", icon: "bg-[#044d73]/10 text-[#044d73]", value: "text-slate-800" },
  green: { border: "border-l-emerald-500", icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-600" },
  red: { border: "border-l-rose-500", icon: "bg-rose-50 text-rose-600", value: "text-slate-800" },
  amber: { border: "border-l-amber-500", icon: "bg-amber-50 text-amber-600", value: "text-slate-800" },
  slate: { border: "border-l-slate-400", icon: "bg-slate-100 text-slate-600", value: "text-slate-800" },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "primary",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  accent?: keyof typeof ACCENTS;
  href?: string;
}) {
  const a = ACCENTS[accent];
  const body = (
    <div className={`flex h-full items-center justify-between gap-3 rounded-xl border border-l-4 border-slate-200 bg-white p-5 shadow-sm ${a.border} ${href ? "transition-shadow hover:shadow-md" : ""}`}>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p
          className={`mt-1 truncate text-2xl font-bold ${a.value}`}
          title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
        >
          {value}
        </p>
        {hint && <div className="mt-1 text-[11px] font-medium text-slate-500">{hint}</div>}
      </div>
      {Icon && (
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${a.icon}`}>
          <Icon className="h-6 w-6" />
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-[#044d73]/5 text-[#044d73] border-[#044d73]/20",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "slate", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  POSTED: "green",
  PAID: "green",
  ACTIVE: "green",
  RECEIVED: "green",
  COMPLETED: "green",
  IN_STOCK: "green",
  IN: "green",
  OK: "green",
  PARTIAL: "amber",
  PARTIALLY_RECEIVED: "amber",
  PENDING: "amber",
  IN_TRANSIT: "amber",
  LOW: "amber",
  EXPIRING_SOON: "amber",
  SENT: "blue",
  TRIAL: "blue",
  DRAFT: "slate",
  DEPLETED: "slate",
  SOLD: "slate",
  UNPAID: "red",
  VOID: "red",
  CANCELLED: "red",
  EXPIRED: "red",
  OUT: "red",
  DAMAGED: "red",
  SUSPENDED: "red",
  RETURNED_TO_SUPPLIER: "violet",
  REFUND: "green",
  CREDIT_NOTE: "blue",
  REPLACEMENT: "violet",
  STORE_CREDIT: "blue",
};
export const STATUS_LABELS: Record<string, string> = {
  IN: "In stock",
  OUT: "Out of stock",
  LOW: "Low stock",
  PARTIAL: "Part paid",
  PARTIALLY_RECEIVED: "Part received",
  REFUND: "Refunded",
  CREDIT_NOTE: "Credit note",
  REPLACEMENT: "Replaced",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <Badge tone={STATUS_TONES[status] ?? "slate"}>{STATUS_LABELS[status] ?? titleCase(status)}</Badge>;
}

export function DotsLoader({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="animate-dot-bounce h-2.5 w-2.5 rounded-full bg-[#044d73]" style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </div>
      {text && <p className="text-xs font-medium text-slate-400">{text}</p>}
    </div>
  );
}

export function LoadingBlock({ text = "Loading…", className = "py-16" }: { text?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <DotsLoader text={text} />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className = "py-14",
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className = "py-14" }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-700">Couldn’t load this</p>
      <p className="max-w-md text-xs text-slate-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "amber" | "green" | "blue"; children: React.ReactNode }) {
  const s = {
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    blue: "bg-[#044d73]/5 border-[#044d73]/20 text-[#044d73]",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${s}`}>{children}</div>;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold print:hidden">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`rounded-lg px-3 py-1.5 transition-colors cursor-pointer ${
            value === t.value ? "bg-white text-[#044d73] shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-slate-400">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** label / value list for detail pages */
export function DetailList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt>
          <dd className="mt-0.5 break-words text-slate-800">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SummaryRow({ label, value, strong, muted }: { label: string; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-1 text-sm ${strong ? "font-bold text-slate-900" : muted ? "text-slate-400" : "text-slate-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
