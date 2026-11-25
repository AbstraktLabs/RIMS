"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ImageUp, MapPin, Pencil, Percent, Plus, Ruler, Save, Trash2 } from "lucide-react";
import { Field, FormGrid, Input, Select, Textarea, Toggle, Checkbox } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Badge, Button, Card, CardHeader, ErrorState, LoadingBlock, PageHeader, Tabs } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, del, patch, post } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";
import { useSession, type OrgSettings } from "@/lib/client/session";
import type { Location, TaxRate, Unit } from "@/lib/client/types";

type Tab = "business" | "preferences" | "locations" | "tax" | "units" | "numbering";

export default function SettingsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>((params.get("tab") as Tab) || "business");
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace(`?tab=${t}`, { scroll: false });
  };
  return (
    <div>
      <PageHeader title="Business settings" subtitle="Your business profile, money and tax preferences, and store setup" />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "business", label: "Business" },
            { value: "preferences", label: "Preferences" },
            { value: "locations", label: "Locations" },
            { value: "tax", label: "Tax rates" },
            { value: "units", label: "Units" },
            { value: "numbering", label: "Numbering" },
          ]}
        />
      </div>
      {tab === "business" && <BusinessTab />}
      {tab === "preferences" && <PreferencesTab />}
      {tab === "locations" && <LocationsTab />}
      {tab === "tax" && <TaxTab />}
      {tab === "units" && <UnitsTab />}
      {tab === "numbering" && <NumberingTab />}
    </div>
  );
}

function BusinessTab() {
  const { org, can, reloadSettings, settings, readOnly } = useSession();
  const toast = useToast();
  const editable = can("settings.manage") && !readOnly;
  const [f, setF] = useState({
    name: org.name,
    legalName: org.legalName ?? "",
    taxId: org.taxId ?? "",
    email: org.email ?? "",
    phone: org.phone ?? "",
    address: org.address ?? "",
  });
  const { busy, error, run } = useAction();
  const logo = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Business profile" subtitle="Shown on invoices, receipts and reports" />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await patch("/api/settings", {
                organization: {
                  name: f.name,
                  legalName: f.legalName || null,
                  taxId: f.taxId || null,
                  email: f.email || null,
                  phone: f.phone || null,
                  address: f.address || null,
                },
              });
              await reloadSettings();
              toast("Business profile saved");
            });
          }}
        >
          {error && <Alert>{error}</Alert>}
          <fieldset disabled={!editable} className="space-y-4">
            <FormGrid>
              <Field label="Business name" required>
                <Input required value={f.name} onChange={set("name")} />
              </Field>
              <Field label="Registered / legal name">
                <Input value={f.legalName} onChange={set("legalName")} />
              </Field>
              <Field label={settings.taxIdLabel}>
                <Input value={f.taxId} onChange={set("taxId")} />
              </Field>
              <Field label="Phone">
                <Input value={f.phone} onChange={set("phone")} />
              </Field>
              <Field label="Email" className="sm:col-span-2">
                <Input type="email" value={f.email} onChange={set("email")} />
              </Field>
            </FormGrid>
            <Field label="Address">
              <Textarea value={f.address} onChange={set("address")} />
            </Field>
          </fieldset>
          {editable && (
            <div className="flex justify-end">
              <Button type="submit" icon={Save} loading={busy}>
                Save profile
              </Button>
            </div>
          )}
        </form>
      </Card>
      <Card>
        <CardHeader title="Logo" />
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
            {org.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-[#044d73]">{org.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          {logo.error && <Alert>{logo.error}</Alert>}
          {editable && (
            <div className="flex gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <ImageUp className="h-4 w-4" /> {logo.busy ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const form = new FormData();
                    form.set("file", file);
                    logo.run(async () => {
                      await api("/api/settings/logo", { form });
                      await reloadSettings();
                      toast("Logo updated");
                    });
                  }}
                />
              </label>
              {org.logoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() =>
                    logo.run(async () => {
                      await del("/api/settings/logo");
                      await reloadSettings();
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          )}
          <p className="text-center text-[11px] text-slate-400">JPEG, PNG, WebP or GIF up to 5 MB.</p>
        </div>
      </Card>
    </div>
  );
}

const TIMEZONES = ["Asia/Kathmandu", "Asia/Kolkata", "Asia/Dhaka", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];

function PreferencesTab() {
  const { settings, can, reloadSettings, readOnly } = useSession();
  const toast = useToast();
  const editable = can("settings.manage") && !readOnly;
  const [s, setS] = useState<OrgSettings>(settings);
  const { busy, error, run } = useAction();
  const up = <K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) => setS((x) => ({ ...x, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await patch("/api/settings", {
            settings: {
              currencyCode: s.currencyCode,
              currencySymbol: s.currencySymbol,
              currencyDecimals: Number(s.currencyDecimals),
              locale: s.locale,
              timezone: s.timezone,
              calendarSystem: s.calendarSystem,
              taxLabel: s.taxLabel,
              taxIdLabel: s.taxIdLabel,
              taxRegistered: s.taxRegistered,
              pricesIncludeTax: s.pricesIncludeTax,
              enableVariants: s.enableVariants,
              enableBatchTracking: s.enableBatchTracking || s.enableExpiryTracking,
              enableExpiryTracking: s.enableExpiryTracking,
              enableSerialTracking: s.enableSerialTracking,
              enableMultiLocation: s.enableMultiLocation,
              enableWholesalePricing: s.enableWholesalePricing,
              allowNegativeStock: !!s.allowNegativeStock,
              expiryAlertDays: Number(s.expiryAlertDays),
              invoiceFooter: (s.invoiceFooter as string) || null,
              receiptFooter: (s.receiptFooter as string) || null,
            },
          });
          await reloadSettings();
          toast("Preferences saved");
        });
      }}
      className="space-y-6"
    >
      {error && <Alert>{error}</Alert>}
      <fieldset disabled={!editable} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Money & dates" />
          <FormGrid>
            <Field label="Currency code">
              <Input value={s.currencyCode} maxLength={3} onChange={(e) => up("currencyCode", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Currency symbol">
              <Input value={s.currencySymbol} onChange={(e) => up("currencySymbol", e.target.value)} />
            </Field>
            <Field label="Decimal places">
              <Select value={String(s.currencyDecimals)} onChange={(e) => up("currencyDecimals", Number(e.target.value))}>
                {[0, 1, 2, 3].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Number format (locale)" hint="e.g. en-US, en-IN, ne-NP">
              <Input value={s.locale} onChange={(e) => up("locale", e.target.value)} />
            </Field>
            <Field label="Time zone">
              <Select value={s.timezone} onChange={(e) => up("timezone", e.target.value)}>
                {[...new Set([s.timezone, ...TIMEZONES])].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Calendar">
              <Select value={s.calendarSystem} onChange={(e) => up("calendarSystem", e.target.value as "AD" | "BS")}>
                <option value="AD">Gregorian (AD)</option>
                <option value="BS">Bikram Sambat (BS)</option>
              </Select>
            </Field>
          </FormGrid>
        </Card>
        <Card>
          <CardHeader title="Tax" />
          <FormGrid>
            <Field label="Tax name" hint="VAT, GST, Sales tax…">
              <Input value={s.taxLabel} onChange={(e) => up("taxLabel", e.target.value)} />
            </Field>
            <Field label="Tax ID label" hint="PAN, VAT No., GSTIN…">
              <Input value={s.taxIdLabel} onChange={(e) => up("taxIdLabel", e.target.value)} />
            </Field>
          </FormGrid>
          <div className="mt-3 divide-y divide-slate-100">
            <Toggle
              checked={s.taxRegistered}
              onChange={(v) => up("taxRegistered", v)}
              label="Registered for tax"
              description="When off, sales carry no tax and tax paid on purchases is added to stock cost."
            />
            <Toggle
              checked={s.pricesIncludeTax}
              onChange={(v) => up("pricesIncludeTax", v)}
              label="Selling prices include tax"
              description="Tax is worked out from the price instead of added on top."
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Inventory features" subtitle="Turn on only what your products need" />
          <div className="divide-y divide-slate-100">
            <Toggle checked={s.enableVariants} onChange={(v) => up("enableVariants", v)} label="Product variants" description="Sizes, colours, weights… each with its own SKU, price and stock." />
            <Toggle
              checked={s.enableBatchTracking}
              onChange={(v) => up("enableBatchTracking", v)}
              disabled={s.enableExpiryTracking}
              label="Batch / lot tracking"
              description="Record a batch number on each purchase."
            />
            <Toggle
              checked={s.enableExpiryTracking}
              onChange={(v) => setS((x) => ({ ...x, enableExpiryTracking: v, enableBatchTracking: v || x.enableBatchTracking }))}
              label="Expiry dates"
              description="Track expiry per batch and sell the earliest-expiring stock first."
            />
            <Toggle checked={s.enableSerialTracking} onChange={(v) => up("enableSerialTracking", v)} label="Serial numbers" description="Track individual units (IMEI, serial) for electronics." />
            <Toggle checked={s.enableWholesalePricing} onChange={(v) => up("enableWholesalePricing", v)} label="Wholesale prices" description="A second price level you can choose at checkout." />
            <Toggle checked={!!s.allowNegativeStock} onChange={(v) => up("allowNegativeStock", v)} label="Allow selling below zero stock" />
            <Toggle checked={s.enableMultiLocation} onChange={(v) => up("enableMultiLocation", v)} label="Multiple locations" description="Branches and warehouses with transfers." />
          </div>
          {s.enableExpiryTracking && (
            <div className="mt-3">
              <Field label="Warn about expiry this many days ahead">
                <Input type="number" min={0} value={s.expiryAlertDays} onChange={(e) => up("expiryAlertDays", Number(e.target.value))} />
              </Field>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Document footers" />
          <div className="space-y-4">
            <Field label="Invoice footer" hint="Terms, bank details, thank-you note">
              <Textarea value={(s.invoiceFooter as string) ?? ""} onChange={(e) => up("invoiceFooter", e.target.value)} />
            </Field>
            <Field label="Receipt footer">
              <Textarea value={(s.receiptFooter as string) ?? ""} onChange={(e) => up("receiptFooter", e.target.value)} />
            </Field>
          </div>
        </Card>
      </fieldset>
      {editable && (
        <div className="flex justify-end">
          <Button type="submit" icon={Save} loading={busy}>
            Save preferences
          </Button>
        </div>
      )}
    </form>
  );
}

/** Generic create/edit modal for the small settings lists. */
function useEditor<T>() {
  const [editing, setEditing] = useState<{ row: T | null } | null>(null);
  return { editing, openNew: () => setEditing({ row: null }), openEdit: (row: T) => setEditing({ row }), close: () => setEditing(null) };
}

function LocationsTab() {
  const { can, readOnly, session } = useSession();
  const editable = can("settings.manage") && !readOnly && session.user.isOwner;
  const { data, error, loading, reload } = useApi<{ items: Location[] }>("/api/locations");
  const ed = useEditor<Location>();
  const toast = useToast();
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader
          title="Locations"
          subtitle="Stores and warehouses. Stock is kept separately for each."
          icon={MapPin}
          actions={editable && <Button size="sm" icon={Plus} onClick={ed.openNew}>Add location</Button>}
        />
      </div>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        columns={[
          {
            key: "name",
            header: "Name",
            cell: (r) => (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{r.name}</span>
                {r.isDefault && <Badge tone="blue">Default</Badge>}
                {!r.isActive && <Badge tone="red">Inactive</Badge>}
              </div>
            ),
          },
          { key: "type", header: "Type", cell: (r) => (r.type === "STORE" ? "Store" : "Warehouse") },
          { key: "code", header: "Code", cell: (r) => r.code ?? "—", hideBelow: "sm" },
          { key: "phone", header: "Phone", cell: (r) => r.phone ?? "—", hideBelow: "md" },
          { key: "staff", header: "Staff", cell: (r) => r.staffCount, align: "right", hideBelow: "sm" },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) =>
              editable && (
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => ed.openEdit(r)}>
                  Edit
                </Button>
              ),
          },
        ]}
      />
      {ed.editing && (
        <LocationModal
          row={ed.editing.row}
          onClose={ed.close}
          onSaved={() => {
            ed.close();
            reload();
            toast("Location saved");
          }}
        />
      )}
    </Card>
  );
}

function LocationModal({ row, onClose, onSaved }: { row: Location | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: row?.name ?? "",
    code: row?.code ?? "",
    type: row?.type ?? "STORE",
    phone: row?.phone ?? "",
    address: row?.address ?? "",
    isDefault: row?.isDefault ?? false,
    isActive: row?.isActive ?? true,
  });
  const { busy, error, run } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = () =>
    run(async () => {
      const body = { name: f.name, code: f.code || null, type: f.type, phone: f.phone || null, address: f.address || null, isDefault: f.isDefault || undefined };
      if (row) await patch(`/api/locations/${row.id}`, { ...body, isActive: f.isActive });
      else await post("/api/locations", body);
      onSaved();
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={row ? "Edit location" : "Add location"}
      footer={
        <>
          {row && !row.isDefault && (
            <Button variant="ghost" icon={Trash2} className="mr-auto text-rose-600" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save} disabled={!f.name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FormGrid>
          <Field label="Name" required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Type">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "STORE" | "WAREHOUSE" })}>
              <option value="STORE">Store</option>
              <option value="WAREHOUSE">Warehouse</option>
            </Select>
          </Field>
          <Field label="Short code">
            <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </FormGrid>
        <Field label="Address">
          <Textarea value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} rows={2} />
        </Field>
        <div className="flex flex-wrap gap-5">
          {!row?.isDefault && <Checkbox checked={f.isDefault} onChange={(v) => setF({ ...f, isDefault: v })} label="Make default location" />}
          {row && !row.isDefault && <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />}
        </div>
      </div>
      <DeleteConfirm open={confirmDelete} onClose={() => setConfirmDelete(false)} path={row ? `/api/locations/${row.id}` : ""} what={row?.name ?? ""} onDone={onSaved} />
    </Modal>
  );
}

function DeleteConfirm({ open, onClose, path, what, onDone }: { open: boolean; onClose: () => void; path: string; what: string; onDone: () => void }) {
  const { busy, error, run } = useAction();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Delete ${what}?`}
      message="If it has been used it will be deactivated instead, so your history stays intact."
      confirmLabel="Delete"
      busy={busy}
      error={error}
      onConfirm={() =>
        run(async () => {
          await del(path);
          onClose();
          onDone();
        })
      }
    />
  );
}

function TaxTab() {
  const { can, readOnly, settings } = useSession();
  const editable = can("settings.manage") && !readOnly;
  const { data, error, loading, reload } = useApi<{ items: TaxRate[] }>("/api/tax-rates");
  const ed = useEditor<TaxRate>();
  const [f, setF] = useState({ name: "", rate: "", isDefault: false, isActive: true });
  const { busy, error: saveErr, run } = useAction();
  const [deleting, setDeleting] = useState<TaxRate | null>(null);
  const open = (r: TaxRate | null) => {
    setF({ name: r?.name ?? "", rate: r?.rate ?? "", isDefault: r?.isDefault ?? false, isActive: r?.isActive ?? true });
    if (r) ed.openEdit(r);
    else ed.openNew();
  };
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader
          title={`${settings.taxLabel} rates`}
          subtitle={settings.taxRegistered ? "Applied to products and documents" : "You’re not tax-registered — rates only affect purchase costs."}
          icon={Percent}
          actions={editable && <Button size="sm" icon={Plus} onClick={() => open(null)}>Add rate</Button>}
        />
      </div>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        columns={[
          {
            key: "n",
            header: "Name",
            cell: (r) => (
              <span className="flex items-center gap-2 font-semibold text-slate-800">
                {r.name} {r.isDefault && <Badge tone="blue">Default</Badge>} {!r.isActive && <Badge tone="red">Inactive</Badge>}
              </span>
            ),
          },
          { key: "r", header: "Rate", cell: (r) => `${Number(r.rate)}%`, align: "right" },
          { key: "p", header: "Products", cell: (r) => r.productCount, align: "right" },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) =>
              editable && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => setDeleting(r)} />
                </div>
              ),
          },
        ]}
      />
      <Modal
        open={!!ed.editing}
        onClose={ed.close}
        title={ed.editing?.row ? "Edit tax rate" : "Add tax rate"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={ed.close}>Cancel</Button>
            <Button
              loading={busy}
              disabled={!f.name.trim() || f.rate === ""}
              onClick={() =>
                run(async () => {
                  const body = { name: f.name, rate: Number(f.rate), isDefault: f.isDefault || undefined };
                  if (ed.editing?.row) await patch(`/api/tax-rates/${ed.editing.row.id}`, { ...body, isActive: f.isActive });
                  else await post("/api/tax-rates", body);
                  ed.close();
                  reload();
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {saveErr && <Alert>{saveErr}</Alert>}
          <Field label="Name" hint="e.g. VAT 13%, Zero rated">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Rate (%)">
            <Input type="number" min={0} max={100} step="any" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          </Field>
          <div className="flex gap-5">
            <Checkbox checked={f.isDefault} onChange={(v) => setF({ ...f, isDefault: v })} label="Default for new products" />
            {ed.editing?.row && <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />}
          </div>
        </div>
      </Modal>
      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} path={`/api/tax-rates/${deleting?.id}`} what={deleting?.name ?? ""} onDone={reload} />
    </Card>
  );
}

function UnitsTab() {
  const { can, readOnly } = useSession();
  const editable = can("products.manage") && !readOnly;
  const { data, error, loading, reload } = useApi<{ items: Unit[] }>("/api/units");
  const ed = useEditor<Unit>();
  const [f, setF] = useState({ name: "", code: "", allowDecimal: false, isActive: true });
  const { busy, error: saveErr, run } = useAction();
  const [deleting, setDeleting] = useState<Unit | null>(null);
  const open = (r: Unit | null) => {
    setF({ name: r?.name ?? "", code: r?.code ?? "", allowDecimal: r?.allowDecimal ?? false, isActive: r?.isActive ?? true });
    if (r) ed.openEdit(r);
    else ed.openNew();
  };
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader
          title="Units of measure"
          subtitle="Decimal units (kg, litre, metre) allow fractional quantities"
          icon={Ruler}
          actions={editable && <Button size="sm" icon={Plus} onClick={() => open(null)}>Add unit</Button>}
        />
      </div>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        columns={[
          { key: "n", header: "Name", cell: (r) => <span className="font-semibold text-slate-800">{r.name} {!r.isActive && <Badge tone="red">Inactive</Badge>}</span> },
          { key: "c", header: "Code", cell: (r) => <code className="text-xs">{r.code}</code> },
          { key: "d", header: "Quantities", cell: (r) => (r.allowDecimal ? <Badge tone="blue">Decimal</Badge> : <Badge>Whole</Badge>) },
          { key: "p", header: "Products", cell: (r) => r.productCount, align: "right" },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) =>
              editable && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => setDeleting(r)} />
                </div>
              ),
          },
        ]}
      />
      <Modal
        open={!!ed.editing}
        onClose={ed.close}
        title={ed.editing?.row ? "Edit unit" : "Add unit"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={ed.close}>Cancel</Button>
            <Button
              loading={busy}
              disabled={!f.name.trim() || !f.code.trim()}
              onClick={() =>
                run(async () => {
                  const body = { name: f.name, code: f.code, allowDecimal: f.allowDecimal };
                  if (ed.editing?.row) await patch(`/api/units/${ed.editing.row.id}`, { ...body, isActive: f.isActive });
                  else await post("/api/units", body);
                  ed.close();
                  reload();
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {saveErr && <Alert>{saveErr}</Alert>}
          <FormGrid>
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
            <Field label="Code" hint="Short label, e.g. kg"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          </FormGrid>
          <div className="flex gap-5">
            <Checkbox checked={f.allowDecimal} onChange={(v) => setF({ ...f, allowDecimal: v })} label="Allow decimal quantities" />
            {ed.editing?.row && <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />}
          </div>
        </div>
      </Modal>
      <DeleteConfirm open={!!deleting} onClose={() => setDeleting(null)} path={`/api/units/${deleting?.id}`} what={deleting?.name ?? ""} onDone={reload} />
    </Card>
  );
}

const DOC_LABELS: Record<string, string> = {
  SALE: "Sales invoice",
  SALE_RETURN: "Sale return",
  PURCHASE: "Purchase",
  PURCHASE_ORDER: "Purchase order",
  PURCHASE_RETURN: "Purchase return",
  STOCK_ADJUSTMENT: "Stock adjustment",
  STOCK_TRANSFER: "Stock transfer",
  PAYMENT: "Payment",
};

interface Sequence {
  documentType: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  preview: string;
}

function NumberingTab() {
  const { can, readOnly } = useSession();
  const editable = can("settings.manage") && !readOnly;
  const { data, error, loading, reload } = useApi<{ items: Sequence[] }>("/api/settings/sequences");
  const [edit, setEdit] = useState<Sequence | null>(null);
  const { busy, error: saveErr, run, setError } = useAction();
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5">
        <CardHeader title="Document numbering" subtitle="Numbers are gap-free and never reused" />
      </div>
      <DataTable
        rows={data?.items}
        rowKey={(r) => r.documentType}
        columns={[
          { key: "t", header: "Document", cell: (r) => <span className="font-semibold text-slate-800">{DOC_LABELS[r.documentType] ?? r.documentType}</span> },
          { key: "p", header: "Prefix", cell: (r) => <code className="text-xs">{r.prefix || "—"}</code> },
          { key: "n", header: "Next number", cell: (r) => r.nextNumber, align: "right" },
          { key: "v", header: "Next will be", cell: (r) => <Badge tone="blue">{r.preview}</Badge> },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) =>
              editable && (
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setError(null); setEdit(r); }}>
                  Edit
                </Button>
              ),
          },
        ]}
      />
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`Numbering — ${edit ? DOC_LABELS[edit.documentType] : ""}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() =>
                run(async () => {
                  if (!edit) return;
                  await patch("/api/settings/sequences", { documentType: edit.documentType, prefix: edit.prefix, nextNumber: Number(edit.nextNumber), padding: Number(edit.padding) });
                  setEdit(null);
                  reload();
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            {saveErr && <Alert>{saveErr}</Alert>}
            <Field label="Prefix" hint="Letters, digits and - / _ .">
              <Input value={edit.prefix} onChange={(e) => setEdit({ ...edit, prefix: e.target.value })} />
            </Field>
            <FormGrid>
              <Field label="Next number" hint="Can only move forward for the same prefix">
                <Input type="number" min={1} value={edit.nextNumber} onChange={(e) => setEdit({ ...edit, nextNumber: Number(e.target.value) })} />
              </Field>
              <Field label="Digits">
                <Input type="number" min={1} max={12} value={edit.padding} onChange={(e) => setEdit({ ...edit, padding: Number(e.target.value) })} />
              </Field>
            </FormGrid>
            <p className="text-xs text-slate-500">
              Preview: <Badge tone="blue">{`${edit.prefix}${String(edit.nextNumber).padStart(Number(edit.padding) || 1, "0")}`}</Badge>
            </p>
          </div>
        )}
      </Modal>
    </Card>
  );
}

