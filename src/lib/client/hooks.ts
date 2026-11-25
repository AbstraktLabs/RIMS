"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, errorMessage, withQuery } from "./api";

type Query = Record<string, string | number | boolean | null | undefined>;

/**
 * Fetches `path` (with `query`) and refetches whenever either changes.
 * Pass `null` to skip. Stale responses from earlier requests are ignored.
 */
export function useApi<T>(path: string | null, query?: Query) {
  const key = path ? withQuery(path, query) : null;
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; key: string | null }>({
    data: null,
    error: null,
    loading: !!key,
    key: null,
  });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!key) return;
    const id = ++seq.current;
    let cancelled = false;
    // keep showing previous data while reloading
    Promise.resolve().then(() => {
      if (!cancelled) setState((s) => ({ ...s, loading: true, error: null }));
    });
    api<T>(key)
      .then((data) => {
        if (!cancelled && id === seq.current) setState({ data, error: null, loading: false, key });
      })
      .catch((err) => {
        if (!cancelled && id === seq.current) setState((s) => ({ ...s, error: errorMessage(err), loading: false, key }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: state.data, error: state.error, loading: !!key && state.loading, reload, setData: (d: T) => setState((s) => ({ ...s, data: d })) };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Runs an async action with busy/error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      return await fn();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, fieldErrors, run };
}

/**
 * List-page state: filters + page, with the text `search` filter debounced.
 * Changing any filter goes back to page 1.
 */
export function useList<T, F extends Record<string, string>>(path: string, initial: F, extra?: Query) {
  const [filters, setFilters] = useState<F>(initial);
  const [page, setPage] = useState(1);
  const search = useDebounced(filters.search ?? "", 300);
  const query: Query = { ...extra, page, limit: 25 };
  for (const [k, v] of Object.entries(filters)) {
    const val = k === "search" ? search : v;
    if (val !== "" && val !== undefined) query[k] = val;
  }
  const res = useApi<{ items: T[]; page: number; total: number; totalPages: number; summary?: Record<string, unknown> }>(path, query);
  const set = useCallback(<K extends keyof F>(k: K, v: F[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  }, []);
  return { ...res, filters, set, setFilters, page, setPage };
}
