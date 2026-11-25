"use client";

import { useSession } from "@/lib/client/session";

/** Business letterhead shown on printed / PDF documents. */
export function PrintHeader({ title, number, meta, screen }: { title: string; number?: string; meta?: [string, React.ReactNode][]; screen?: boolean }) {
  const { org, settings } = useSession();
  return (
    <div className={`mb-6 items-start justify-between gap-6 border-b border-slate-200 pb-4 ${screen ? "flex" : "hidden print:flex"}`}>
      <div className="flex items-start gap-3">
        {org.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
        )}
        <div>
          <p className="text-lg font-bold text-slate-900">{org.legalName || org.name}</p>
          {org.address && <p className="whitespace-pre-line text-xs text-slate-500">{org.address}</p>}
          <p className="text-xs text-slate-500">
            {[org.phone, org.email].filter(Boolean).join(" · ")}
          </p>
          {org.taxId && (
            <p className="text-xs font-medium text-slate-600">
              {settings.taxIdLabel}: {org.taxId}
            </p>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold uppercase tracking-wide text-[#044d73]">{title}</p>
        {number && <p className="text-sm font-semibold text-slate-700">{number}</p>}
        {meta?.map(([k, v]) => (
          <p key={k} className="text-xs text-slate-500">
            {k}: <span className="font-medium text-slate-700">{v}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
