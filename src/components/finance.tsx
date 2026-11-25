"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LocationSelect, PartySelect } from "@/components/pickers";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Button, EmptyState, LoadingBlock, Tabs } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { del, patch, post } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction, useApi } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useSession } from "@/lib/client/session";

export interface FinanceCategory {
  id: string;
  kind: "INCOME" | "EXPENSE";
  name: string;
  isActive: boolean;
  entryCount: number;
}

export interface FinanceEntry {
  id: string;
  kind: "INCOME" | "EXPENSE";
  amount: number;
  entryDate: string;
  method: string;
  referenceNumber: string | null;
  description: string;
  note: string | null;
  categoryId: string | null;
  categoryName: string | null;
  partyId: string | null;
  partyName: string | null;
  locationId: string | null;
  locationName: string | null;
  createdByName: string | null;
  createdAt: string;
}

export function EntryModal({ entry, kind: initialKind = "EXPENSE", onClose, onSaved }: { entry?: FinanceEntry; kind?: "INCOME" | "EXPENSE"; onClose: () => void; onSaved: (e: FinanceEntry) => void }) {
  const { settings, session } = useSession();
  const toast = useToast();
  const cats = useApi<{ items: FinanceCategory[] }>("/api/finance/categories");
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">(entry?.kind ?? initialKind);
  const [f, setF] = useState({
    description: entry?.description ?? "",
    amount: entry ? String(entry.amount) : "",
    entryDate: entry?.entryDate ?? todayIso(settings.timezone),
    categoryId: entry?.categoryId ?? "",
    method: entry?.method ?? "CASH",
    referenceNumber: entry?.referenceNumber ?? "",
    partyId: entry?.partyId ?? "",
    locationId: entry?.locationId ?? session.activeLocationId,
    note: entry?.note ?? "",
  });
  const { busy, error, fieldErrors, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const options = (cats.data?.items ?? []).filter((c) => c.kind === kind && (c.isActive || c.id === f.categoryId));

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? "Edit entry" : kind === "EXPENSE" ? "Record expense" : "Record income"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!f.description.trim() || !(Number(f.amount) > 0)}
            onClick={() =>
              run(async () => {
                const body = {
                  kind,
                  description: f.description,
                  amount: Number(f.amount),
                  entryDate: f.entryDate,
                  categoryId: f.categoryId || null,
                  method: f.method,
                  referenceNumber: f.referenceNumber || null,
                  partyId: f.partyId || null,
                  locationId: f.locationId || null,
                  note: f.note || null,
                };
                const r = entry ? await patch<{ entry: FinanceEntry }>(`/api/finance/entries/${entry.id}`, body) : await post<{ entry: FinanceEntry }>("/api/finance/entries", body);
                toast(entry ? "Entry updated" : kind === "EXPENSE" ? "Expense recorded" : "Income recorded");
                onSaved(r.entry);
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!entry && <Tabs value={kind} onChange={(k) => { setKind(k); setF((x) => ({ ...x, categoryId: "" })); }} tabs={[{ value: "EXPENSE", label: "Expense" }, { value: "INCOME", label: "Income" }]} />}
        <Field label="Description" required error={fieldErrors.description}>
          <Input value={f.description} onChange={set("description")} placeholder={kind === "EXPENSE" ? "Shop rent for November" : "Commission received"} autoFocus maxLength={255} />
        </Field>
        <FormGrid>
          <Field label="Amount" required error={fieldErrors.amount}>
            <Input inputMode="decimal" value={f.amount} onChange={set("amount")} />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.entryDate} onChange={set("entryDate")} />
          </Field>
          <Field label="Category">
            <Select value={f.categoryId} onChange={set("categoryId")}>
              <option value="">{cats.loading ? "Loading…" : "Uncategorised"}</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label={kind === "EXPENSE" ? "Paid by" : "Received by"}>
            <Select value={f.method} onChange={set("method")}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={f.referenceNumber} onChange={set("referenceNumber")} placeholder="Receipt / voucher no." />
          </Field>
          {settings.enableMultiLocation && (
            <Field label="Location">
              <LocationSelect value={f.locationId} onChange={(v) => setF((x) => ({ ...x, locationId: v }))} />
            </Field>
          )}
        </FormGrid>
        <Field label={kind === "EXPENSE" ? "Paid to (optional)" : "Received from (optional)"} hint="Only for your records — doesn’t change their account balance">
          <PartySelect type={kind === "EXPENSE" ? "SUPPLIER" : "CUSTOMER"} value={f.partyId} allowEmpty emptyLabel="— None —" onChange={(id) => setF((x) => ({ ...x, partyId: id }))} />
        </Field>
        <Field label="Note">
          <Textarea rows={2} value={f.note} onChange={set("note")} />
        </Field>
      </div>
    </Modal>
  );
}

export function CategoriesModal({ onClose, readOnly }: { onClose: () => void; readOnly?: boolean }) {
  const { data, loading, error, reload } = useApi<{ items: FinanceCategory[] }>("/api/finance/categories");
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [name, setName] = useState("");
  const action = useAction();
  const toast = useToast();
  const items = (data?.items ?? []).filter((c) => c.kind === kind);
  return (
    <Modal open onClose={onClose} title="Income & expense categories" footer={<Button variant="secondary" onClick={onClose}>Done</Button>}>
      <div className="space-y-4">
        <Tabs value={kind} onChange={setKind} tabs={[{ value: "EXPENSE", label: "Expense" }, { value: "INCOME", label: "Income" }]} />
        {(action.error || error) && <Alert>{action.error || error}</Alert>}
        {!readOnly && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async () => {
                await post("/api/finance/categories", { kind, name });
                setName("");
                reload();
              });
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "EXPENSE" ? "e.g. Rent, Electricity, Salaries" : "e.g. Commission, Rent received"} maxLength={150} />
            <Button type="submit" icon={Plus} disabled={!name.trim()} loading={action.busy}>Add</Button>
          </form>
        )}
        {loading && !data ? (
          <LoadingBlock className="py-8" />
        ) : items.length === 0 ? (
          <EmptyState title="No categories yet" className="py-8" />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className={c.isActive ? "text-slate-800" : "text-slate-400 line-through"}>{c.name}</span>
                <span className="flex items-center gap-2">
                  {c.entryCount > 0 && <Badge>{c.entryCount} entries</Badge>}
                  {!readOnly && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => action.run(async () => { await patch(`/api/finance/categories/${c.id}`, { isActive: !c.isActive }); reload(); })}>
                        {c.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      {c.entryCount === 0 && (
                        <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${c.name}`} onClick={() => action.run(async () => { await del(`/api/finance/categories/${c.id}`); toast("Category deleted"); reload(); })} />
                      )}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
