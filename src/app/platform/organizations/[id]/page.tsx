"use client";

import { use, useState } from "react";
import { Save } from "lucide-react";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Alert, Button, Card, CardHeader, DetailList, ErrorState, LoadingBlock, PageHeader, StatCard, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { patch } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";

interface Detail {
  organization: { id: string; name: string; legalName: string | null; slug: string; businessType: string; status: string; plan: string; trialEndsAt: string | null; suspendedAt: string | null; email: string | null; phone: string | null; createdAt: string };
  owner: { id: string; name: string; email: string; phone: string | null; lastLoginAt: string | null } | null;
  stats: { users: number; locations: number; products: number; sales: number; lastSaleAt: string | null };
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function PlatformOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload, setData } = useApi<Detail>(`/api/platform/organizations/${id}`);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !data) return <LoadingBlock />;
  return <OrgView key={data.organization.status + data.organization.plan + data.organization.trialEndsAt} data={data} onSaved={(o) => setData({ ...data, organization: { ...data.organization, ...o } })} />;
}

function OrgView({ data, onSaved }: { data: Detail; onSaved: (o: Partial<Detail["organization"]>) => void }) {
  const o = data.organization;
  const toast = useToast();
  const [status, setStatus] = useState(o.status);
  const [plan, setPlan] = useState(o.plan);
  const [trialEndsAt, setTrial] = useState(o.trialEndsAt ? o.trialEndsAt.slice(0, 10) : "");
  const { busy, error, run } = useAction();
  const dirty = status !== o.status || plan !== o.plan || trialEndsAt !== (o.trialEndsAt ? o.trialEndsAt.slice(0, 10) : "");
  return (
    <div>
      <PageHeader back={{ href: "/platform", label: "Businesses" }} title={<span className="flex items-center gap-2">{o.name} <StatusBadge status={o.status} /></span>} subtitle={`/${o.slug} · ${o.businessType.toLowerCase()} · joined ${dt(o.createdAt)}`} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={data.stats.users} />
        <StatCard label="Locations" value={data.stats.locations} />
        <StatCard label="Products" value={data.stats.products} />
        <StatCard label="Sales" value={data.stats.sales} hint={data.stats.lastSaleAt ? `Last ${dt(data.stats.lastSaleAt)}` : "None yet"} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Subscription" subtitle="Suspended businesses can’t sign in or use the API" />
          {error && <div className="mb-3"><Alert>{error}</Alert></div>}
          <FormGrid cols={3}>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="TRIAL">Trial</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </Field>
            <Field label="Plan">
              <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="BASIC">Basic</option>
                <option value="STANDARD">Standard</option>
                <option value="PRO">Pro</option>
              </Select>
            </Field>
            <Field label="Trial ends">
              <Input type="date" value={trialEndsAt} onChange={(e) => setTrial(e.target.value)} />
            </Field>
          </FormGrid>
          <div className="mt-4 flex justify-end">
            <Button
              icon={Save}
              loading={busy}
              disabled={!dirty}
              onClick={() =>
                run(async () => {
                  const r = await patch<{ organization: Detail["organization"] }>(`/api/platform/organizations/${o.id}`, {
                    status,
                    plan,
                    trialEndsAt: trialEndsAt ? `${trialEndsAt}T23:59:59Z` : null,
                  });
                  toast("Business updated");
                  onSaved(r.organization);
                })
              }
            >
              Save
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Owner" />
          {data.owner ? (
            <DetailList items={[["Name", data.owner.name], ["Email", data.owner.email], ["Phone", data.owner.phone ?? "—"], ["Last sign in", dt(data.owner.lastLoginAt)]]} />
          ) : (
            <p className="text-sm text-slate-400">No owner account found.</p>
          )}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <DetailList items={[["Business email", o.email ?? "—"], ["Phone", o.phone ?? "—"], ["Suspended", o.suspendedAt ? dt(o.suspendedAt) : "—"]]} />
          </div>
        </Card>
      </div>
    </div>
  );
}
