"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Send, Trash2 } from "lucide-react";
import { Field, FormGrid, Input } from "@/components/ui/form";
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { LocationSelect, VariantSearch, useLocations } from "@/components/pickers";
import { LotSelect, SerialPicker, type LineVariant } from "@/components/stock-pickers";
import { post } from "@/lib/client/api";
import { useAction } from "@/lib/client/hooks";
import { todayIso } from "@/lib/client/format";
import { useFmt, useSession } from "@/lib/client/session";

interface Line {
  uid: number;
  v: LineVariant;
  quantity: string;
  lotId: string;
  serials: string[];
}

export default function NewTransferPage() {
  const { base, session, settings, can, readOnly } = useSession();
  const { qty } = useFmt();
  const router = useRouter();
  const { locations } = useLocations();
  const [fromId, setFromId] = useState(session.activeLocationId);
  const [toId, setToId] = useState("");
  const [tDate, setTDate] = useState(todayIso(settings.timezone));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const uid = useRef(1);
  const { busy, error, run } = useAction();
  const [mode, setMode] = useState<"draft" | "dispatch">("dispatch");
  const myLocations = new Set(session.locations.map((l) => l.id));

  const add = (v: LineVariant, serial?: string | null) =>
    setLines((ls) => {
      const ex = ls.find((l) => l.v.variantId === v.variantId && !v.trackBatches);
      if (ex && !v.trackSerials) return ls.map((l) => (l === ex ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l));
      if (ex && serial) return ls.map((l) => (l === ex && !l.serials.includes(serial) ? { ...l, serials: [...l.serials, serial], quantity: String(l.serials.length + 1) } : l));
      return [...ls, { uid: uid.current++, v, quantity: "1", lotId: "", serials: serial ? [serial] : [] }];
    });
  const up = (u: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...p } : l)));

  const submit = (dispatch: boolean) => {
    setMode(dispatch ? "dispatch" : "draft");
    return run(async () => {
      if (!toId) throw new Error("Choose where the stock is going");
      const r = await post<{ transfer: { id: string } }>("/api/inventory/transfers", {
        fromLocationId: fromId,
        toLocationId: toId,
        transferDate: tDate,
        note: note || null,
        dispatch,
        items: lines.map((l) => ({ variantId: l.v.variantId, quantity: Number(l.quantity), lotId: l.lotId || null, serials: l.v.trackSerials ? l.serials : [] })),
      });
      router.push(`${base}/inventory/transfers/${r.transfer.id}`);
    });
  };

  if (!can("inventory.manage") || readOnly) return <Alert tone="amber">You don’t have permission to transfer stock.</Alert>;
  if (locations.length && locations.length < 2)
    return (
      <div>
        <PageHeader title="New transfer" back={{ href: `${base}/inventory/transfers`, label: "Transfers" }} />
        <Alert tone="blue">You need at least two active locations to transfer stock. Add one in Settings → Locations.</Alert>
      </div>
    );

  return (
    <div>
      <PageHeader title="New transfer" back={{ href: `${base}/inventory/transfers`, label: "Transfers" }} />
      <div className="space-y-6">
        {error && <Alert>{error}</Alert>}
        <Card>
          <FormGrid cols={4}>
            <Field label="From">
              <select
                value={fromId}
                onChange={(e) => { setFromId(e.target.value); setLines([]); if (e.target.value === toId) setToId(""); }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                {locations.filter((l) => myLocations.has(l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="To" required>
              <LocationSelect value={toId} onChange={setToId} exclude={fromId} />
            </Field>
            <Field label="Date">
              <Input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} />
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </Field>
          </FormGrid>
        </Card>
        <Card padded={false}>
          <div className="space-y-3 p-4 sm:p-5">
            <CardHeader title="Products to move" />
            <VariantSearch key={fromId} locationId={fromId} inStockOnly onPick={add} autoFocus />
          </div>
          {lines.length === 0 ? (
            <EmptyState title="No products added" description="Search or scan products that are in stock at the source location." className="py-10" />
          ) : (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {lines.map((l) => (
                <div key={l.uid} className="grid grid-cols-1 gap-3 p-4 sm:px-5 lg:grid-cols-12 lg:items-start">
                  <div className="lg:col-span-4">
                    <div className="font-semibold text-slate-800">{l.v.displayName}</div>
                    <div className="text-xs text-slate-500">{l.v.sku} · available: <b>{qty(l.v.stock, l.v.unitCode)}</b></div>
                  </div>
                  <div className="flex items-center gap-2 lg:col-span-2">
                    <Input aria-label="Quantity" className="w-24" inputMode={l.v.allowDecimal ? "decimal" : "numeric"} value={l.quantity} disabled={l.v.trackSerials} onChange={(e) => up(l.uid, { quantity: e.target.value })} />
                    <span className="text-xs text-slate-500">{l.v.unitCode}</span>
                  </div>
                  <div className="lg:col-span-5">
                    {l.v.trackBatches && <LotSelect variantId={l.v.variantId} locationId={fromId} value={l.lotId} onChange={(id) => up(l.uid, { lotId: id })} />}
                    {l.v.trackSerials && (
                      <div className={l.v.trackBatches ? "mt-2" : ""}>
                        <SerialPicker variantId={l.v.variantId} locationId={fromId} value={l.serials} onChange={(s) => up(l.uid, { serials: s, quantity: String(s.length) })} />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end lg:col-span-1">
                    <Button variant="ghost" icon={Trash2} aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="sticky bottom-0 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Dispatching takes the stock out of the source now; it arrives when the destination marks it received.</p>
          <div className="flex gap-2">
            <Button variant="secondary" icon={Save} loading={busy && mode === "draft"} disabled={!lines.length || busy} onClick={() => submit(false)}>Save draft</Button>
            <Button icon={Send} loading={busy && mode === "dispatch"} disabled={!lines.length || busy} onClick={() => submit(true)}>Dispatch now</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
