"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState, ErrorState, LoadingBlock } from "./primitives";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  hideBelow?: "sm" | "md" | "lg";
}

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  footer,
}: {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  footer?: React.ReactNode;
}) {
  const showLoading = loading && !rows?.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-4 py-3 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""} ${
                  c.hideBelow ? hide[c.hideBelow] : ""
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={`divide-y divide-slate-100 ${loading && rows?.length ? "opacity-60" : ""}`}>
          {error ? (
            <tr>
              <td colSpan={columns.length}>
                <ErrorState message={error} onRetry={onRetry} />
              </td>
            </tr>
          ) : showLoading ? (
            <tr>
              <td colSpan={columns.length}>
                <LoadingBlock />
              </td>
            </tr>
          ) : !rows?.length ? (
            <tr>
              <td colSpan={columns.length}>{empty ?? <EmptyState title="Nothing here yet" />}</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`text-slate-700 transition-colors hover:bg-slate-50/80 ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 align-middle ${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""} ${
                      c.hideBelow ? hide[c.hideBelow] : ""
                    } ${c.className ?? ""}`}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && !error && rows?.length ? (
          <tfoot>
            <tr>
              <td colSpan={columns.length} className="p-0">
                {footer}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 print:hidden">
      <span>
        {total} record{total === 1 ? "" : "s"} · page {page} of {totalPages}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Card with a toolbar on top and a table below — the standard list layout. */
export function TableCard({ toolbar, children }: { toolbar?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 sm:p-4 print:hidden">{toolbar}</div>}
      {children}
    </div>
  );
}
