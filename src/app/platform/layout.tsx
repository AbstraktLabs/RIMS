"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { post } from "@/lib/client/api";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
      <PlatformShell>{children}</PlatformShell>
    </Suspense>
  );
}

function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/platform/login") return <>{children}</>;
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/platform" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex size-8 items-center justify-center rounded-full bg-[#044d73] text-white"><ShieldCheck className="size-4" /></span>
            Retail IMS · Platform
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            onClick={async () => {
              await post("/api/platform/logout").catch(() => undefined);
              window.location.assign(new URL("/platform/login", window.location.origin).href);
            }}
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
