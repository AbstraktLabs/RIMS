"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PartySelect } from "@/components/pickers";
import { Field, FormGrid, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { patch, post } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction, useApi } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

export type PartyType = "CUSTOMER" | "SUPPLIER" | "BOTH";

export interface PartyDetail {
  id: string;
  code: string | null;
  name: string;
  partyType: PartyType;
  contactPerson: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerms: string | null;
  creditLimit: number | null;
  openingBalance: number;
  openingBalanceType: "DR" | "CR";
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  balance: number;
  balanceType: "RECEIVABLE" | "PAYABLE" | "SETTLED";
  availableCredit: number | null;
  stats: {
    salesCount: number;
    salesTotal: number;
    lastSaleAt: string | null;
    purchasesCount: number;
    purchasesTotal: number;
    lastPurchaseAt: string | null;
    unpaidSales: number;
    unpaidPurchases: number;
  };
}

export const PARTY_TYPE_LABELS: Record<PartyType, string> = { CUSTOMER: "Customer", SUPPLIER: "Supplier", BOTH: "Customer & supplier" };

const blank = (type: PartyType) => ({
  name: "",
  partyType: type,
  code: "",
  contactPerson: "",
  phone: "",
  email: "",
  taxId: "",
  address: "",
  paymentTerms: "",
  creditLimit: "",
  openingBalance: "",
  openingBalanceType: (type === "SUPPLIER" ? "CR" : "DR") as "DR" | "CR",
  notes: "",
});

/** Add or edit a customer / supplier. */
export function PartyFormModal({
  party,
  defaultType = "CUSTOMER",
  onClose,
  onSaved,
}: {
  party?: PartyDetail;
  defaultType?: PartyType;
  onClose: () => void;
  onSaved: (p: PartyDetail) => void;
}) {
  const { settings } = useSession();
  const toast = useToast();
  const [f, setF] = useState(() =>
    party
      ? {
          name: party.name,
          partyType: party.partyType,
          code: party.code ?? "",
          contactPerson: party.contactPerson ?? "",
          phone: party.phone ?? "",
          email: party.email ?? "",
          taxId: party.taxId ?? "",
          address: party.address ?? "",
          paymentTerms: party.paymentTerms ?? "",
          creditLimit: party.creditLimit === null ? "" : String(party.creditLimit),
          openingBalance: party.openingBalance ? String(party.openingBalance) : "",
          openingBalanceType: party.openingBalanceType,
          notes: party.notes ?? "",
        }
      : blank(defaultType),
  );
  const [active, setActive] = useState(party?.isActive ?? true);
  const { busy, error, fieldErrors, run } = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sells = f.partyType !== "SUPPLIER";

  const save = () =>
    run(async () => {
      const body = {
        name: f.name,
        partyType: f.partyType,
        code: f.code || null,
        contactPerson: f.contactPerson || null,
        phone: f.phone || null,
        email: f.email || null,
        taxId: f.taxId || null,
        address: f.address || null,
        paymentTerms: f.paymentTerms || null,
        creditLimit: f.creditLimit === "" ? null : Number(f.creditLimit),
        openingBalance: Number(f.openingBalance || 0),
        openingBalanceType: f.openingBalanceType,
        notes: f.notes || null,
        ...(party && { isActive: active }),
      };
      const r = party ? await patch<{ party: PartyDetail }>(`/api/parties/${party.id}`, body) : await post<{ party: PartyDetail }>("/api/parties", body);
      toast(party ? "Saved" : `${PARTY_TYPE_LABELS[f.partyType]} added`);
      onSaved(r.party);
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={party ? `Edit ${party.name}` : f.partyType === "SUPPLIER" ? "New supplier" : f.partyType === "CUSTOMER" ? "New customer" : "New contact"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!f.name.trim()} onClick={save}>{party ? "Save changes" : "Add"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FormGrid>
          <Field label="Name" required error={fieldErrors.name}>
            <Input value={f.name} onChange={set("name")} autoFocus maxLength={255} />
          </Field>
          <Field label="Type">
            <Select value={f.partyType} onChange={set("partyType")}>
              {Object.entries(PARTY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Phone" error={fieldErrors.phone}>
            <Input value={f.phone} onChange={set("phone")} inputMode="tel" maxLength={30} />
          </Field>
          <Field label="Email" error={fieldErrors.email}>
            <Input type="email" value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Contact person">
            <Input value={f.contactPerson} onChange={set("contactPerson")} />
          </Field>
          <Field label={`${settings.taxLabel} / tax ID`}>
            <Input value={f.taxId} onChange={set("taxId")} maxLength={50} />
          </Field>
          <Field label="Code" hint="Your own reference, optional">
            <Input value={f.code} onChange={set("code")} maxLength={40} />
          </Field>
          <Field label="Payment terms" hint="e.g. Net 30, cash on delivery">
            <Input value={f.paymentTerms} onChange={set("paymentTerms")} />
          </Field>
          {sells && (
            <Field label="Credit limit" hint="Leave empty for no limit" error={fieldErrors.creditLimit}>
              <Input inputMode="decimal" value={f.creditLimit} onChange={set("creditLimit")} />
            </Field>
          )}
          <Field label="Opening balance" hint="What was owed before you started using this system" error={fieldErrors.openingBalance}>
            <div className="flex gap-2">
              <Input inputMode="decimal" value={f.openingBalance} onChange={set("openingBalance")} placeholder="0" />
              <Select value={f.openingBalanceType} onChange={set("openingBalanceType")} className="w-40" aria-label="Who owes">
                <option value="DR">They owe you</option>
                <option value="CR">You owe them</option>
              </Select>
            </div>
          </Field>
        </FormGrid>
        <Field label="Address">
          <Textarea rows={2} value={f.address} onChange={set("address")} />
        </Field>
        <Field label="Notes">
          <Textarea rows={2} value={f.notes} onChange={set("notes")} />
        </Field>
        {party && <Toggle checked={active} onChange={setActive} label="Active" />}
      </div>
    </Modal>
  );
}

export type Direction = "RECEIVED_FROM_CUSTOMER" | "PAID_TO_SUPPLIER" | "REFUND_TO_CUSTOMER" | "REFUND_FROM_SUPPLIER";

/** Money in or out against a party's account; settles oldest documents first. */
export function PartyPaymentModal({
  party,
  direction: initialDirection,
  onClose,
  onDone,
}: {
  party?: { id: string; name: string; partyType: PartyType; balance: number };
  direction?: Direction;
  onClose: () => void;
  onDone: () => void;
}) {
  const { settings, session } = useSession();
  const { money } = useFmt();
  const toast = useToast();
  const guess: Direction = initialDirection ?? (party && party.balance < 0 ? "PAID_TO_SUPPLIER" : party?.partyType === "SUPPLIER" ? "PAID_TO_SUPPLIER" : "RECEIVED_FROM_CUSTOMER");
  const [direction, setDirection] = useState<Direction>(guess);
  const [partyId, setPartyId] = useState(party?.id ?? "");
  const [balance, setBalance] = useState<number | null>(party?.balance ?? null);
  const [f, setF] = useState({
    amount: party && Math.abs(party.balance) > 0 ? String(Math.abs(party.balance)) : "",
    method: "CASH",
    paymentDate: todayIso(settings.timezone),
    referenceNumber: "",
    notes: "",
  });
  const [allocate, setAllocate] = useState(true);
  const { busy, error, run } = useAction();
  const customerSide = direction === "RECEIVED_FROM_CUSTOMER" || direction === "REFUND_TO_CUSTOMER";
  const settles = direction === "RECEIVED_FROM_CUSTOMER" || direction === "PAID_TO_SUPPLIER";

  return (
    <Modal
      open
      onClose={onClose}
      title={party ? `Payment · ${party.name}` : "Record payment"}
      subtitle={balance !== null ? (balance > 0 ? `They owe you ${money(balance)}` : balance < 0 ? `You owe them ${money(-balance)}` : "Account is settled") : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!partyId || !(Number(f.amount) > 0)}
            onClick={() =>
              run(async () => {
                await post("/api/payments", {
                  partyId,
                  direction,
                  amount: Number(f.amount),
                  method: f.method,
                  paymentDate: f.paymentDate,
                  referenceNumber: f.referenceNumber || null,
                  notes: f.notes || null,
                  locationId: session.activeLocationId,
                  allocate: settles ? allocate : false,
                });
                toast("Payment recorded");
                onDone();
              })
            }
          >
            Save payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Type">
          <Select value={direction} onChange={(e) => { setDirection(e.target.value as Direction); if (!party) { setPartyId(""); setBalance(null); } }}>
            <option value="RECEIVED_FROM_CUSTOMER">Money received from a customer</option>
            <option value="PAID_TO_SUPPLIER">Money paid to a supplier</option>
            <option value="REFUND_TO_CUSTOMER">Refund given to a customer</option>
            <option value="REFUND_FROM_SUPPLIER">Refund received from a supplier</option>
          </Select>
        </Field>
        {!party && (
          <Field label={customerSide ? "Customer" : "Supplier"} required>
            <PartySelect key={customerSide ? "c" : "s"} type={customerSide ? "CUSTOMER" : "SUPPLIER"} value={partyId} onChange={(id, p) => { setPartyId(id); setBalance(p ? p.balance : null); }} />
          </Field>
        )}
        <FormGrid>
          <Field label="Amount" required>
            <Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus />
          </Field>
          <Field label="Method">
            <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} />
          </Field>
          <Field label="Reference">
            <Input value={f.referenceNumber} onChange={(e) => setF({ ...f, referenceNumber: e.target.value })} placeholder="Cheque / transaction no." />
          </Field>
        </FormGrid>
        <Field label="Notes">
          <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {settles && (
          <Toggle
            checked={allocate}
            onChange={setAllocate}
            label={direction === "RECEIVED_FROM_CUSTOMER" ? "Apply to the oldest unpaid invoices first" : "Apply to the oldest unpaid bills first"}
          />
        )}
      </div>
    </Modal>
  );
}

/** Shown on list pages opened from a party (…?partyId=). */
export function PartyFilterNote({ partyId }: { partyId: string }) {
  const { data } = useApi<{ party: { name: string } }>(`/api/parties/${partyId}`);
  const pathname = usePathname();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#044d73]/20 bg-[#044d73]/5 px-3 py-2 text-sm text-slate-700">
      Showing only <b>{data?.party.name ?? "…"}</b>
      <Link href={pathname} className="ml-auto text-xs font-semibold text-[#044d73] hover:underline">Show everyone</Link>
    </div>
  );
}
