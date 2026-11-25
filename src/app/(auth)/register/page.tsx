"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, PrimarySubmit } from "@/components/auth-card";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { ApiError, errorMessage, post, type SessionPayload } from "@/lib/client/api";

const TYPES = [
  ["GROCERY", "Grocery / supermarket"],
  ["FASHION", "Fashion & apparel"],
  ["ELECTRONICS", "Electronics & mobiles"],
  ["COSMETICS", "Cosmetics & beauty"],
  ["CONVENIENCE", "Convenience store"],
  ["FOOD", "Food & bakery"],
  ["GENERAL", "General retail"],
  ["OTHER", "Other"],
];

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Asia/Kathmandu";
  }
};

export default function RegisterPage() {
  const [f, setF] = useState({
    businessName: "",
    businessType: "GENERAL",
    ownerName: "",
    email: "",
    phone: "",
    password: "",
    currencyCode: "NPR",
    currencySymbol: "Rs.",
    calendarSystem: "AD",
    taxLabel: "VAT",
    defaultTaxRate: "13",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      const s = await post<SessionPayload>("/api/auth/register", {
        ...f,
        phone: f.phone || null,
        timezone: browserTz(),
        defaultTaxRate: f.defaultTaxRate === "" ? undefined : Number(f.defaultTaxRate),
      });
      window.location.assign(new URL(`/t/${s.organization.slug}`, window.location.origin).href);
    } catch (err) {
      if (err instanceof ApiError) setFields(err.fieldErrors);
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create your store" subtitle="14-day free trial · no card needed" wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FormGrid>
          <Field label="Business name" required error={fields.businessName}>
            <Input required value={f.businessName} onChange={set("businessName")} placeholder="e.g. Himalaya Mart" />
          </Field>
          <Field label="Business type" hint="Sets sensible defaults you can change later">
            <Select value={f.businessType} onChange={set("businessType")}>
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Your name" required error={fields.ownerName}>
            <Input required value={f.ownerName} onChange={set("ownerName")} />
          </Field>
          <Field label="Phone" error={fields.phone}>
            <Input value={f.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email" required error={fields.email}>
            <Input type="email" required autoComplete="email" value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Password" required error={fields.password} hint="8+ characters with letters and numbers">
            <Input type="password" required autoComplete="new-password" value={f.password} onChange={set("password")} />
          </Field>
        </FormGrid>
        <details className="rounded-xl border border-slate-200 px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">Currency, tax & calendar</summary>
          <div className="mt-3">
            <FormGrid cols={3}>
              <Field label="Currency code">
                <Input value={f.currencyCode} maxLength={3} onChange={set("currencyCode")} />
              </Field>
              <Field label="Symbol">
                <Input value={f.currencySymbol} onChange={set("currencySymbol")} />
              </Field>
              <Field label="Calendar">
                <Select value={f.calendarSystem} onChange={set("calendarSystem")}>
                  <option value="AD">Gregorian (AD)</option>
                  <option value="BS">Bikram Sambat (BS)</option>
                </Select>
              </Field>
              <Field label="Tax name">
                <Input value={f.taxLabel} onChange={set("taxLabel")} />
              </Field>
              <Field label="Default tax %">
                <Input type="number" min={0} max={100} step="any" value={f.defaultTaxRate} onChange={set("defaultTaxRate")} />
              </Field>
            </FormGrid>
          </div>
        </details>
        <PrimarySubmit loading={loading}>Create store</PrimarySubmit>
        <p className="pt-2 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#044d73] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
