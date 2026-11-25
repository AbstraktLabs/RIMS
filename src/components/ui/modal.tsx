"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Alert, Button } from "./primitives";
import { Field, Textarea } from "./form";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm print:hidden" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full ${w} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation with an optional required reason (for voids). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger = true,
  reason,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  reason?: { label: string; required?: boolean };
  busy?: boolean;
  error?: string | null;
}) {
  const [text, setText] = useState("");
  const invalid = !!reason?.required && text.trim().length < 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} disabled={invalid} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          {danger && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
            </div>
          )}
          <div className="text-sm text-slate-600">{message}</div>
        </div>
        {reason && (
          <Field label={reason.label} required={reason.required} hint={reason.required ? "At least 3 characters" : undefined}>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
          </Field>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
