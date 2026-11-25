"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { FilterSelect, SearchInput } from "@/components/ui/form";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useApi, useList } from "@/lib/client/hooks";

interface Org {
  id: string;
  name: string;
  slug: string;
  businessType: string;
  plan: string;
  status: string;
  trialEndsAt: string | null;
  createdAt: string;
  ownerEmail: string | null;
  userCount: number;
  locationCount: number;
}
interface Stats {
  totals: { organizations: number; users: number; expiredTrials: number };
  byStatus: Record<string, number>;
  signupsLast30Days: { day: string; count: number }[];
}

const d = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

export default function PlatformHome() {
  const router = useRouter();
  const stats = useApi<Stats>("/api/platform/stats");
  const list = useList<Org, { search: string; status: string }>("/api/platform/organizations", { search: "", status: "" });
  const { filters: f, set } = list;
  if (stats.error && /sign in|unauthori|not signed/i.test(stats.error)) {
    return (
      <Alert tone="amber">
        Your platform session has ended. <Link href="/platform/login" className="font-semibold underline">Sign in again</Link>
      </Alert>
    );
  }
  const s = stats.data;
  const signups = s?.signupsLast30Days.reduce((a, b) => a + Number(b.count), 0) ?? 0;
  return (
    <div>
      <PageHeader title="Businesses" subtitle="Every tenant on this Retail IMS installation" />
      {s && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Businesses" value={s.totals.organizations} hint={`${signups} new in 30 days`} />
          <StatCard label="Active" value={s.byStatus.ACTIVE ?? 0} accent="green" />
          <StatCard label="On trial" value={s.byStatus.TRIAL ?? 0} accent="amber" hint={s.totals.expiredTrials ? `${s.totals.expiredTrials} expired` : undefined} />
          <StatCard label="Suspended" value={s.byStatus.SUSPENDED ?? 0} accent="red" />
          <StatCard label="Users" value={s.totals.users} />
        </div>
      )}
      {stats.error && <Card className="mb-6"><p className="text-sm text-rose-600">{stats.error}</p></Card>}
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-64" value={f.search} onChange={(v) => set("search", v)} placeholder="Business name or slug…" />
            <FilterSelect label="Status" value={f.status} onChange={(v) => set("status", v)} options={[{ value: "", label: "Any status" }, { value: "TRIAL", label: "Trial" }, { value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }]} />
          </>
        }
      >
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/platform/organizations/${r.id}`)}
          empty={<EmptyState icon={Building2} title="No businesses found" description="Businesses appear here when someone registers." />}
          columns={[
            { key: "n", header: "Business", cell: (r) => <div><div className="font-semibold text-slate-800">{r.name}</div><div className="text-xs text-slate-400">/{r.slug} · {r.businessType.toLowerCase()}</div></div> },
            { key: "o", header: "Owner", hideBelow: "md", cell: (r) => r.ownerEmail ?? "—" },
            { key: "p", header: "Plan", cell: (r) => <Badge tone="blue">{r.plan}</Badge> },
            { key: "u", header: "Users", align: "right", hideBelow: "lg", cell: (r) => r.userCount },
            { key: "l", header: "Locations", align: "right", hideBelow: "lg", cell: (r) => r.locationCount },
            { key: "t", header: "Trial ends", hideBelow: "md", cell: (r) => (r.status === "TRIAL" ? <span className={r.trialEndsAt && new Date(r.trialEndsAt) < new Date() ? "font-semibold text-rose-600" : ""}>{d(r.trialEndsAt)}</span> : "—") },
            { key: "c", header: "Joined", hideBelow: "lg", cell: (r) => d(r.createdAt) },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
