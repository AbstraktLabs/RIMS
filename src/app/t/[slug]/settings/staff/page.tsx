"use client";

import { useMemo, useState } from "react";
import { Copy, KeyRound, Pencil, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Checkbox, Field, FilterSelect, FormGrid, Input, SearchInput, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Tabs } from "@/components/ui/primitives";
import { DataTable, TableCard } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { patch, post } from "@/lib/client/api";
import { useAction, useApi, useDebounced } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";
import { PERMISSION_CATALOG } from "@/lib/permissions/catalog";
import { useLocations } from "@/components/pickers";

interface Assignment {
  locationId: string;
  locationName: string;
  roleId: string;
  roleName: string;
}
interface Staff {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isOwner: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  assignments: Assignment[];
}
interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export default function StaffPage() {
  const [tab, setTab] = useState<"staff" | "roles">("staff");
  return (
    <div>
      <PageHeader title="Staff & roles" subtitle="Who can sign in, where they work and what they can do" />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "staff", label: "Staff" }, { value: "roles", label: "Roles" }]} />
      </div>
      {tab === "staff" ? <StaffTab /> : <RolesTab />}
    </div>
  );
}

function StaffTab() {
  const { can, readOnly, session } = useSession();
  const { dateTime } = useFmt();
  const toast = useToast();
  const editable = can("users.manage") && !readOnly;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const q = useDebounced(search, 300);
  const { data, error, loading, reload } = useApi<{ items: Staff[] }>("/api/staff", { search: q || undefined, status });
  const [editing, setEditing] = useState<{ row: Staff | null } | null>(null);
  const [deactivating, setDeactivating] = useState<Staff | null>(null);
  const [resetting, setResetting] = useState<Staff | null>(null);
  const [secret, setSecret] = useState<{ name: string; email: string; password: string; emailed?: boolean } | null>(null);
  const deact = useAction();
  const reset = useAction();

  return (
    <>
      <TableCard
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search name or email…" />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
            {editable && (
              <Button icon={UserPlus} className="ml-auto" onClick={() => setEditing({ row: null })}>
                Add staff
              </Button>
            )}
          </>
        }
      >
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Users} title="No staff found" description={search ? "Try another search." : "Add your first team member."} />}
          columns={[
            {
              key: "n",
              header: "Name",
              cell: (r) => (
                <div>
                  <div className="flex items-center gap-2 font-semibold text-slate-800">
                    {r.name}
                    {r.id === session.user.id && <Badge tone="slate">You</Badge>}
                  </div>
                  <div className="text-xs text-slate-500">{r.email}</div>
                </div>
              ),
            },
            {
              key: "a",
              header: "Access",
              cell: (r) =>
                r.isOwner ? (
                  <Badge tone="blue">Owner · all locations</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {r.assignments.map((a) => (
                      <Badge key={a.locationId} tone={a.roleName === "Viewer" ? "slate" : "green"}>
                        {a.locationName}: {a.roleName}
                      </Badge>
                    ))}
                  </div>
                ),
            },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} /> },
            { key: "l", header: "Last sign-in", cell: (r) => (r.lastLoginAt ? dateTime(r.lastLoginAt) : "Never"), hideBelow: "md" },
            {
              key: "x",
              header: "",
              align: "right",
              cell: (r) =>
                editable &&
                !r.isOwner && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ row: r })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" icon={KeyRound} aria-label="Reset password" title="Reset password" onClick={() => { reset.setError(null); setResetting(r); }} />
                    {r.isActive && (
                      <Button size="sm" variant="ghost" icon={Trash2} aria-label="Deactivate" title="Deactivate" onClick={() => { deact.setError(null); setDeactivating(r); }} />
                    )}
                  </div>
                ),
            },
          ]}
        />
      </TableCard>

      {editing && (
        <StaffModal
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null);
            reload();
            if (result?.temporaryPassword) setSecret({ name: result.user.name, email: result.user.email, password: result.temporaryPassword, emailed: result.emailed });
            else toast("Staff member saved");
          }}
        />
      )}

      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        title={`Deactivate ${deactivating?.name}?`}
        message="They will be signed out everywhere and won't be able to sign in. Their past work stays in your records. You can reactivate them later."
        confirmLabel="Deactivate"
        danger
        busy={deact.busy}
        error={deact.error}
        onConfirm={() =>
          deact.run(async () => {
            await patch(`/api/staff/${deactivating!.id}`, { isActive: false });
            setDeactivating(null);
            reload();
            toast("Staff member deactivated");
          })
        }
      />
      <ConfirmDialog
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={`Reset password for ${resetting?.name}?`}
        message="A new temporary password will be created and shown once. They will be signed out on all devices."
        confirmLabel="Reset password"
        busy={reset.busy}
        error={reset.error}
        onConfirm={() =>
          reset.run(async () => {
            const r = await post<{ temporaryPassword: string }>(`/api/staff/${resetting!.id}/reset-password`);
            setSecret({ name: resetting!.name, email: resetting!.email, password: r.temporaryPassword });
            setResetting(null);
          })
        }
      />
      <Modal
        open={!!secret}
        onClose={() => setSecret(null)}
        title="Temporary password"
        size="sm"
        footer={<Button onClick={() => setSecret(null)}>Done</Button>}
      >
        {secret && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Share this with <b>{secret.name}</b> ({secret.email}). It is shown only once — they should change it after signing in.
            </p>
            {secret.emailed && <Alert tone="green">A welcome email with these details was also sent.</Alert>}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <code className="flex-1 font-mono text-base font-semibold tracking-wide text-slate-800">{secret.password}</code>
              <Button
                size="sm"
                variant="secondary"
                icon={Copy}
                onClick={() => {
                  navigator.clipboard?.writeText(secret.password);
                  toast("Copied");
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

interface SaveResult {
  user: Staff;
  temporaryPassword?: string;
  emailed?: boolean;
}

function StaffModal({ row, onClose, onSaved }: { row: Staff | null; onClose: () => void; onSaved: (r?: SaveResult) => void }) {
  const { locations } = useLocations();
  const roles = useApi<{ items: Role[] }>("/api/roles");
  const assignableRoles = (roles.data?.items ?? []).filter((r) => r.name !== "Owner");
  const [f, setF] = useState({
    name: row?.name ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    password: "",
    isActive: row?.isActive ?? true,
    sendWelcomeEmail: true,
  });
  // locationId -> roleId ("" = no access)
  const [access, setAccess] = useState<Record<string, string>>(() =>
    Object.fromEntries((row?.assignments ?? []).map((a) => [a.locationId, a.roleId])),
  );
  const { busy, error, run, fieldErrors } = useAction();
  const activeLocations = (locations ?? []).filter((l) => l.isActive || access[l.id]);
  const assignments = Object.entries(access)
    .filter(([, roleId]) => roleId)
    .map(([locationId, roleId]) => ({ locationId, roleId }));
  const defaultRole = assignableRoles.find((r) => r.name === "Manager")?.id ?? assignableRoles[0]?.id ?? "";

  const save = () =>
    run(async () => {
      if (row) {
        const r = await patch<{ user: Staff }>(`/api/staff/${row.id}`, { name: f.name, phone: f.phone || null, isActive: f.isActive, assignments });
        onSaved(r);
      } else {
        const r = await post<SaveResult>("/api/staff", {
          name: f.name,
          email: f.email,
          phone: f.phone || null,
          password: f.password || undefined,
          assignments,
          sendWelcomeEmail: f.sendWelcomeEmail,
        });
        onSaved(r);
      }
    });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row ? `Edit ${row.name}` : "Add staff member"}
      subtitle={row ? row.email : "They’ll sign in with their email and a password"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save} disabled={!f.name.trim() || (!row && !f.email.trim()) || !assignments.length}>
            {row ? "Save changes" : "Add staff"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <FormGrid>
          <Field label="Full name" required error={fieldErrors.name}>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Email" required={!row} error={fieldErrors.email}>
            <Input type="email" value={f.email} disabled={!!row} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Phone" error={fieldErrors.phone}>
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          {!row && (
            <Field label="Password" hint="Leave empty to generate a temporary one" error={fieldErrors.password}>
              <Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
          )}
        </FormGrid>

        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">Location access</div>
          {fieldErrors.assignments && <p className="mb-2 text-xs text-rose-600">{fieldErrors.assignments}</p>}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {activeLocations.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                <Checkbox
                  checked={!!access[l.id]}
                  onChange={(v) => setAccess((a) => ({ ...a, [l.id]: v ? a[l.id] || defaultRole : "" }))}
                  label={l.name}
                />
                <div className="ml-auto w-44">
                  <Select
                    value={access[l.id] ?? ""}
                    disabled={!access[l.id]}
                    onChange={(e) => setAccess((a) => ({ ...a, [l.id]: e.target.value }))}
                  >
                    {!access[l.id] && <option value="">No access</option>}
                    {assignableRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
            {!activeLocations.length && <div className="px-3 py-4 text-sm text-slate-500">Loading locations…</div>}
          </div>
        </div>

        <div className="flex flex-wrap gap-5">
          {!row && <Checkbox checked={f.sendWelcomeEmail} onChange={(v) => setF({ ...f, sendWelcomeEmail: v })} label="Email them their sign-in details" />}
          {row && <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active (can sign in)" />}
        </div>
      </div>
    </Modal>
  );
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  products: "Products & catalogue",
  inventory: "Inventory",
  purchases: "Purchasing",
  sales: "Sales & POS",
  parties: "Customers & suppliers",
  finance: "Finance",
  reports: "Reports",
  settings: "Business settings",
  users: "Staff & roles",
};

function RolesTab() {
  const { data, error, loading, reload } = useApi<{ items: Role[] }>("/api/roles");
  const roles = useMemo(() => {
    const order = ["Owner", "Manager", "Viewer"];
    return [...(data?.items ?? [])].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }, [data]);
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader title="What each role can do" subtitle="Owners always have full access to every location" icon={ShieldCheck} />
      </div>
      <DataTable
        rows={loading && !data ? undefined : PERMISSION_CATALOG.map((p) => p)}
        loading={loading && !data}
        error={error}
        onRetry={reload}
        rowKey={(p) => p.resource}
        columns={[
          { key: "m", header: "Area", cell: (p) => <span className="font-semibold text-slate-800">{MODULE_LABELS[p.resource] ?? p.resource}</span> },
          ...roles.map((role) => ({
            key: role.id,
            header: role.name,
            align: "center" as const,
            cell: (p: (typeof PERMISSION_CATALOG)[number]) => {
              const granted = p.actions.filter((a) => role.name === "Owner" || role.permissions.includes(`${p.resource}.${a}`));
              if (!granted.length) return <span className="text-slate-300">—</span>;
              const full = granted.length === p.actions.length;
              return <Badge tone={full ? "green" : "blue"}>{granted.map((g) => (g === "manage" ? "Manage" : g === "export" ? "Export" : "View")).join(" + ")}</Badge>;
            },
          })),
        ]}
      />
      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-3 sm:p-5">
        {roles.map((r) => (
          <div key={r.id} className="rounded-xl bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-800">{r.name}</div>
            <div className="mt-1 text-xs text-slate-500">{r.description}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

