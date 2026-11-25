"use client";

import { Suspense } from "react";
import { Lock } from "lucide-react";
import { Sidebar } from "@/components/shell/sidebar";
import { DotsLoader, LoadingBlock } from "@/components/ui/primitives";
import { SessionProvider, useSession } from "@/lib/client/session";

function ReadOnlyBanner() {
  const { readOnly, org } = useSession();
  if (!readOnly) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 print:hidden">
      <Lock className="h-4 w-4 shrink-0" />
      {org.status === "SUSPENDED"
        ? "This account is suspended. You can view your data but can’t make changes. Contact support to reactivate."
        : "Your free trial has ended. You can view your data but can’t make changes until a plan is activated."}
    </div>
  );
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50">
          <DotsLoader text="Loading your store…" />
        </div>
      }
    >
      <div className="flex min-h-screen bg-zinc-50 print:block print:min-h-0 print:bg-white">
        <Sidebar />
        <main className="min-w-0 flex-1 p-3.5 pt-[4.5rem] sm:p-5 sm:pt-[4.5rem] md:p-6 md:pt-6 print:m-0 print:w-full print:p-0">
          <ReadOnlyBanner />
          <Suspense fallback={<LoadingBlock />}>{children}</Suspense>
        </main>
      </div>
    </SessionProvider>
  );
}
