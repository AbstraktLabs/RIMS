"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AuthCard, PrimarySubmit } from "@/components/auth-card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { errorMessage, post } from "@/lib/client/api";

export default function PlatformLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-full bg-[#044d73] text-white"><ShieldCheck className="size-5" /></div>
        <span className="text-base font-bold text-slate-900">Retail IMS · Platform</span>
      </div>
      <AuthCard title="Platform sign in" subtitle="For Retail IMS operators only">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              await post("/api/platform/login", { email, password });
              window.location.assign(new URL("/platform", window.location.origin).href);
            } catch (err) {
              setError(errorMessage(err));
              setLoading(false);
            }
          }}
        >
          {error && <Alert>{error}</Alert>}
          <Field label="Email">
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <PrimarySubmit loading={loading}>Sign in</PrimarySubmit>
        </form>
      </AuthCard>
    </div>
  );
}
