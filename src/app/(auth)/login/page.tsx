"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { AuthCard, PrimarySubmit } from "@/components/auth-card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { errorMessage, post, type SessionPayload } from "@/lib/client/api";

function safeNext(slug: string) {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith(`/t/${slug}`) ? next : `/t/${slug}`;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const s = await post<SessionPayload>("/api/auth/login", { email, password });
      window.location.href = safeNext(s.organization.slug);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Welcome back to your store">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Email address">
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((s) => !s)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#044d73]"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="text-right">
          <Link href="/forgot-password" className="text-xs font-medium text-[#044d73] hover:underline">
            Forgot password?
          </Link>
        </div>
        <PrimarySubmit loading={loading}>Sign in</PrimarySubmit>
        <p className="pt-2 text-center text-xs text-slate-500">
          New here?{" "}
          <Link href="/register" className="font-semibold text-[#044d73] hover:underline">
            Create your store
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
