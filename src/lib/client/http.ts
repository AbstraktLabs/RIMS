"use client";

// Small axios-style wrapper over the RIMS fetch client, so the pharmacy-style
// pages can call `api.get(url, { params })` and read `res.data` / `err.response.data.error`.
// Auth (bearer token + silent refresh) is handled by the underlying client.

import { api as request, ApiError } from "./api";

type Params = Record<string, string | number | boolean | null | undefined>;

export class HttpError extends Error {
  response: { status: number; data: { error: string; details?: unknown } };
  constructor(e: ApiError) {
    super(e.message);
    this.response = { status: e.status, data: { error: e.message, details: e.details } };
  }
}

async function run<T>(fn: () => Promise<T>): Promise<{ data: T }> {
  try {
    return { data: await fn() };
  } catch (e) {
    throw e instanceof ApiError ? new HttpError(e) : e;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const api = {
  get: <T = any>(url: string, cfg?: { params?: Params }) => run(() => request<T>(url, { query: cfg?.params })),
  post: <T = any>(url: string, body: unknown = {}) => run(() => request<T>(url, { method: "POST", body })),
  put: <T = any>(url: string, body: unknown = {}) => run(() => request<T>(url, { method: "PUT", body })),
  patch: <T = any>(url: string, body: unknown = {}) => run(() => request<T>(url, { method: "PATCH", body })),
  delete: <T = any>(url: string) => run(() => request<T>(url, { method: "DELETE" })),
  upload: <T = any>(url: string, form: FormData) => run(() => request<T>(url, { method: "POST", form })),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The message a failed request carried, for toasts and inline errors. */
export function apiError(err: unknown, fallback = "Something went wrong"): string {
  const e = err as { response?: { data?: { error?: string; details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } } } };
  const d = e?.response?.data;
  if (!d) return err instanceof Error ? err.message : fallback;
  const fields = Object.entries(d.details?.fieldErrors ?? {});
  if (fields.length) return `${d.error}: ${fields.map(([k, v]) => `${k} — ${v?.[0]}`).join("; ")}`;
  if (d.details?.formErrors?.length) return d.details.formErrors.join("; ");
  return d.error ?? fallback;
}
