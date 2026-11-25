"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, PrimarySubmit } from "@/components/auth-card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { errorMessage, post } from "@/lib/client/api";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Reset password" subtitle={step === "email" ? "We’ll email you a 6-digit code" : undefined}>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {step === "email" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post("/api/auth/forgot-password", { email });
              setStep("code");
            });
          }}
        >
          <Field label="Email address">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <PrimarySubmit loading={loading}>Send code</PrimarySubmit>
        </form>
      )}
      {step === "code" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await post("/api/auth/reset-password", { email, code, newPassword: password });
              setStep("done");
            });
          }}
        >
          <Alert tone="blue">If an account exists for {email}, a code is on its way. It expires in 15 minutes.</Alert>
          <Field label="6-digit code">
            <Input inputMode="numeric" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="New password" hint="8+ characters with letters and numbers">
            <Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <PrimarySubmit loading={loading}>Set new password</PrimarySubmit>
        </form>
      )}
      {step === "done" && (
        <div className="space-y-4 text-center">
          <Alert tone="green">Password updated. You’ve been signed out on all devices.</Alert>
          <Link href="/login" className="inline-block text-sm font-semibold text-[#044d73] hover:underline">
            Go to sign in
          </Link>
        </div>
      )}
      {step !== "done" && (
        <p className="mt-4 text-center text-xs">
          <Link href="/login" className="font-semibold text-slate-500 hover:text-slate-900">
            ← Back to sign in
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
