"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Banknote, CheckCircle2, ChevronUp, CreditCard, Loader2, Minus, Package, Plus, Printer, ScanBarcode, ShoppingCart, Smartphone, Trash2, UserRound, X } from "lucide-react";
import { PartySelect } from "@/components/pickers";
import { LotSelect, SerialPicker } from "@/components/stock-pickers";
import { PaymentRows, paymentBody, type PaymentRow } from "@/components/doc";
import { Receipt, printReceipt, type ReceiptSale } from "@/components/receipt";
import { Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Button, EmptyState, SummaryRow } from "@/components/ui/primitives";
import { ApiError, errorMessage, get, post } from "@/lib/client/api";
import { useApi, useDebounced } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";
import type { Lot, SearchVariant } from "@/lib/client/types";
import { calculateTotals, type DocTotals } from "@/lib/totals";

interface CartLine {
  uid: number;
  v: SearchVariant;
  quantity: string;
  unitPrice: string;
  discount: string;
  lotId: string;
  serials: string[];
  open: boolean;
}

type Level = "RETAIL" | "WHOLESALE";
const priceFor = (v: SearchVariant, level: Level) => (level === "WHOLESALE" && v.wholesalePrice !== null ? v.wholesalePrice : v.sellingPrice);

export default function PosPage() {
  const { session, settings, can, readOnly, base } = useSession();
  const { money, qty } = useFmt();
  const locationName = session.locations.find((l) => l.id === session.activeLocationId)?.name;
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 200);
  const results = useApi<{ items: SearchVariant[] }>("/api/products/search", { q: dq, limit: 30, inStockOnly: settings.allowNegativeStock ? undefined : true });
  const [lines, setLines] = useState<CartLine[]>([]);
  const [level, setLevel] = useState<Level>("RETAIL");
  const [partyId, setPartyId] = useState("");
  const [walkIn, setWalkIn] = useState({ name: "", phone: "" });
  const [showCustomer, setShowCustomer] = useState(false);
  const [billDiscount, setBillDiscount] = useState("");
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [done, setDone] = useState<ReceiptSale & { id: string } | null>(null);
  const uid = useRef(1);
  const search = useRef<HTMLInputElement>(null);
  const cartRef = useRef<HTMLElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  // phone layout: the cart sits under the product grid, so a bar pinned to the bottom
  // shows the total and charge button until the cart's own footer scrolls into view
  const [footVisible, setFootVisible] = useState(true);
  useEffect(() => {
    const el = footRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setFootVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  });

  const add = (v: SearchVariant, serial?: string | null) => {
    setScanMsg(null);
    setLines((ls) => {
      const ex = ls.find((l) => l.v.variantId === v.variantId);
      if (ex) {
        if (v.trackSerials) {
          if (!serial || ex.serials.includes(serial)) return ls.map((l) => (l === ex ? { ...l, open: true } : l));
          return ls.map((l) => (l === ex ? { ...l, serials: [...l.serials, serial], quantity: String(l.serials.length + 1) } : l));
        }
        return ls.map((l) => (l === ex ? { ...l, quantity: String(Math.round((Number(l.quantity || 0) + 1) * 1000) / 1000) } : l));
      }
      return [
        { uid: uid.current++, v, quantity: v.trackSerials ? (serial ? "1" : "0") : "1", unitPrice: String(priceFor(v, level)), discount: "", lotId: "", serials: serial ? [serial] : [], open: v.trackSerials && !serial },
        ...ls,
      ];
    });
  };

  const onEnter = async () => {
    const code = q.trim();
    if (!code) return;
    setScanning(true);
    try {
      const r = await get<{ variant: SearchVariant; serial: { serialNumber: string } | null }>("/api/products/lookup", { code });
      add(r.variant, r.serial?.serialNumber ?? null);
      setQ("");
    } catch (err) {
      const only = results.data?.items;
      if (only && only.length === 1 && dq === code) {
        add(only[0]);
        setQ("");
      } else setScanMsg(err instanceof ApiError && err.status === 404 ? `Nothing matches “${code}”` : errorMessage(err));
    } finally {
      setScanning(false);
      search.current?.focus();
    }
  };

  const up = (u: number, p: Partial<CartLine>) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...p } : l)));
  const step = (l: CartLine, d: number) => {
    const n = Math.max(0, Math.round((Number(l.quantity || 0) + d) * 1000) / 1000);
    if (n === 0) setLines((ls) => ls.filter((x) => x.uid !== l.uid));
    else up(l.uid, { quantity: String(n) });
  };
  const changeLevel = (lv: Level) => {
    setLevel(lv);
    setLines((ls) => ls.map((l) => ({ ...l, unitPrice: String(priceFor(l.v, lv)) })));
  };

  const taxMode = settings.taxRegistered ? (settings.pricesIncludeTax ? "INCLUSIVE" : "EXCLUSIVE") : "EXEMPT";
  const { totals, totalsError } = useMemo((): { totals: DocTotals | null; totalsError: string | null } => {
    try {
      return {
        totals: calculateTotals(
          lines.map((l) => ({ quantity: Number(l.quantity || 0), unitPrice: Number(l.unitPrice || 0), discount: Number(l.discount || 0), taxRate: l.v.taxRate })),
          { taxMode, discount: Number(billDiscount || 0), otherCharges: 0, roundOff: 0 },
        ),
        totalsError: null,
      };
    } catch (e) {
      return { totals: null, totalsError: e instanceof Error ? e.message : "Invalid amounts" };
    }
  }, [lines, billDiscount, taxMode]);

  const problems = lines.flatMap((l) => {
    const n = Number(l.quantity || 0);
    const out: string[] = [];
    if (!(n > 0)) out.push(`${l.v.displayName}: enter a quantity${l.v.trackSerials ? " (choose serial numbers)" : ""}`);
    if (!l.v.allowDecimal && n % 1 !== 0) out.push(`${l.v.displayName} is sold in whole ${l.v.unitCode}`);
    if (!settings.allowNegativeStock && n > l.v.stock) out.push(`${l.v.displayName}: only ${qty(l.v.stock, l.v.unitCode)} in stock`);
    return out;
  });
  const itemCount = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const blocked = !lines.length || !!totalsError || problems.length > 0;
  const showBar = lines.length > 0 && !footVisible && !checkout && !done;
  const toCart = () => cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const reset = () => {
    setLines([]);
    setBillDiscount("");
    setPartyId("");
    setWalkIn({ name: "", phone: "" });
    setShowCustomer(false);
    setLevel("RETAIL");
    setDone(null);
    setTimeout(() => search.current?.focus(), 50);
  };

  if (!can("sales.manage") || readOnly) {
    return <Alert tone="amber">{readOnly ? "Your account is read-only right now, so new sales can’t be recorded." : "You don’t have permission to make sales."}</Alert>;
  }

  return (
    <div className={`grid grid-cols-1 gap-4 lg:h-[calc(100vh-3rem)] lg:grid-cols-[1fr_420px] ${lines.length ? "pb-20 lg:pb-0" : ""}`}>
      {/* products */}
      <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-2 border-b border-slate-100 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Point of sale</h1>
            <span className="text-xs text-slate-500">{locationName}</span>
          </div>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={search}
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setScanMsg(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEnter();
                }
              }}
              placeholder="Scan barcode / serial or search products…"
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-10 text-base focus:border-[#044d73] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#044d73]/10"
            />
            {(scanning || results.loading) && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
          </div>
          {scanMsg && <p className="text-xs font-semibold text-rose-600">{scanMsg}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {results.error ? (
            <Alert>{results.error}</Alert>
          ) : results.data && results.data.items.length === 0 ? (
            <EmptyState icon={Package} title={dq ? "No products found" : "No products in stock"} description={dq ? "Try another name, SKU or barcode." : "Add products and record a purchase first."} />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {(results.data?.items ?? []).map((v) => {
                const inCart = lines.find((l) => l.v.variantId === v.variantId);
                return (
                  <button
                    key={v.variantId}
                    type="button"
                    onClick={() => add(v)}
                    className={`flex flex-col rounded-xl border p-2.5 text-left transition hover:border-[#044d73] hover:shadow-sm ${inCart ? "border-[#044d73] bg-[#044d73]/5" : "border-slate-200 bg-white"}`}
                  >
                    <div className="mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                      {v.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-slate-300">{v.displayName.charAt(0)}</span>
                      )}
                    </div>
                    <span className="line-clamp-2 text-xs font-semibold text-slate-800">{v.displayName}</span>
                    <span className="mt-auto flex items-end justify-between gap-1 pt-1">
                      <span className="text-sm font-bold text-[#044d73]">{money(priceFor(v, level))}</span>
                      <span className={`text-[10px] font-semibold ${v.stock <= 0 ? "text-rose-500" : "text-slate-400"}`}>{qty(v.stock, v.unitCode)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* cart */}
      <section ref={cartRef} className="flex min-h-[70vh] scroll-mt-16 flex-col rounded-xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
        <div className="space-y-2 border-b border-slate-100 p-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-[#044d73]" />
            <span className="text-sm font-semibold text-slate-800">Cart</span>
            {lines.length > 0 && <Badge tone="blue">{qty(itemCount)} {itemCount === 1 ? "item" : "items"}</Badge>}
            <div className="ml-auto flex items-center gap-1">
              {settings.enableWholesalePricing && (
                <select aria-label="Price level" value={level} onChange={(e) => changeLevel(e.target.value as Level)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                  <option value="RETAIL">Retail</option>
                  <option value="WHOLESALE">Wholesale</option>
                </select>
              )}
              {lines.length > 0 && (
                <Button size="sm" variant="ghost" icon={X} onClick={reset}>Clear</Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="flex-1">
              <PartySelect type="CUSTOMER" value={partyId} onChange={(id) => setPartyId(id)} allowEmpty emptyLabel="Walk-in customer" />
            </div>
            {!partyId && (
              <Button size="sm" variant="ghost" onClick={() => setShowCustomer((s) => !s)}>{showCustomer ? "Hide" : "Name"}</Button>
            )}
          </div>
          {showCustomer && !partyId && (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Customer name" value={walkIn.name} onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })} />
              <Input placeholder="Phone" value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {lines.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Cart is empty" description="Scan a barcode or tap a product to add it." className="py-16" />
          ) : (
            lines.map((l) => {
              const n = Number(l.quantity || 0);
              const lineTotal = n * Number(l.unitPrice || 0) - Number(l.discount || 0);
              const short = !settings.allowNegativeStock && n > l.v.stock;
              return (
                <div key={l.uid} className="p-3">
                  <div className="flex items-start gap-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => up(l.uid, { open: !l.open })}>
                      <div className="truncate text-sm font-semibold text-slate-800">{l.v.displayName}</div>
                      <div className="text-xs text-slate-500">
                        {money(l.unitPrice)} / {l.v.unitCode}
                        {Number(l.discount) > 0 && <span className="text-emerald-600"> · −{money(l.discount)}</span>}
                        {short && <span className="font-semibold text-rose-600"> · only {qty(l.v.stock)} left</span>}
                      </div>
                    </button>
                    <span className="text-sm font-bold tabular-nums text-slate-800">{money(lineTotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    {!l.v.trackSerials ? (
                      <>
                        <button type="button" aria-label="Decrease" onClick={() => step(l, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"><Minus className="h-3.5 w-3.5" /></button>
                        <input aria-label="Quantity" inputMode={l.v.allowDecimal ? "decimal" : "numeric"} value={l.quantity} onChange={(e) => up(l.uid, { quantity: e.target.value })} className="h-8 w-16 rounded-lg border border-slate-200 text-center text-sm font-semibold focus:border-[#044d73] focus:outline-none" />
                        <button type="button" aria-label="Increase" onClick={() => step(l, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <button type="button" onClick={() => up(l.uid, { open: !l.open })} className="h-8 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700">
                        {l.serials.length} serial{l.serials.length === 1 ? "" : "s"} ▾
                      </button>
                    )}
                    <span className="text-xs text-slate-400">{l.v.unitCode}</span>
                    <button type="button" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {l.open && (
                    <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[11px] font-semibold text-slate-500">
                          Price
                          <Input inputMode="decimal" value={l.unitPrice} onChange={(e) => up(l.uid, { unitPrice: e.target.value })} />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-500">
                          Line discount
                          <Input inputMode="decimal" value={l.discount} placeholder="0" onChange={(e) => up(l.uid, { discount: e.target.value })} />
                        </label>
                      </div>
                      {l.v.trackBatches && (
                        <LotSelect variantId={l.v.variantId} value={l.lotId} onChange={(id: string, _lot: Lot | null) => up(l.uid, { lotId: id })} />
                      )}
                      {l.v.trackSerials && (
                        <SerialPicker variantId={l.v.variantId} value={l.serials} onChange={(s) => up(l.uid, { serials: s, quantity: String(s.length) })} />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div ref={footRef} className="space-y-1 border-t border-slate-200 p-3">
          <SummaryRow label="Subtotal" value={money(totals?.subtotal ?? 0)} />
          <div className="flex items-center justify-between py-1 text-sm text-slate-600">
            <span>Discount</span>
            <input aria-label="Bill discount" inputMode="decimal" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} placeholder="0" className="h-8 w-24 rounded-lg border border-slate-200 px-2 text-right text-sm focus:border-[#044d73] focus:outline-none" />
          </div>
          {(totals?.taxAmount ?? 0) > 0 && <SummaryRow label={`${settings.taxLabel}${taxMode === "INCLUSIVE" ? " (incl.)" : ""}`} value={money(totals?.taxAmount ?? 0)} muted={taxMode === "INCLUSIVE"} />}
          <div className="flex items-center justify-between pt-1">
            <span className="text-base font-bold text-slate-900">Total</span>
            <span className="text-2xl font-bold tabular-nums text-[#044d73]">{money(totals?.grandTotal ?? 0)}</span>
          </div>
          {(totalsError || problems[0]) && <p className="text-xs font-semibold text-rose-600">{totalsError ?? problems[0]}</p>}
          <Button className="mt-2 h-12 w-full text-base" disabled={blocked} onClick={() => setCheckout(true)}>
            Charge {money(totals?.grandTotal ?? 0)}
          </Button>
        </div>
      </section>

      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden print:hidden">
          <div className="flex items-center gap-2">
            <button type="button" onClick={toCart} aria-label="View cart" className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#044d73]/10">
                <ShoppingCart className="h-5 w-5 text-[#044d73]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-slate-500">{qty(itemCount)} {itemCount === 1 ? "item" : "items"} · View cart <ChevronUp className="inline h-3 w-3" /></span>
                <span className="block truncate text-lg font-bold tabular-nums text-slate-900">{money(totals?.grandTotal ?? 0)}</span>
              </span>
            </button>
            {blocked ? (
              <Button variant="secondary" className="h-11" onClick={toCart}>Review</Button>
            ) : (
              <Button className="h-11 px-5" onClick={() => setCheckout(true)}>Charge</Button>
            )}
          </div>
          {blocked && (totalsError || problems[0]) && <p className="mt-1 truncate text-xs font-semibold text-rose-600">{totalsError ?? problems[0]}</p>}
        </div>
      )}

      {checkout && totals && (
        <CheckoutModal
          total={totals.grandTotal}
          canCredit={!!partyId}
          onClose={() => setCheckout(false)}
          submit={async (payments) => {
            const r = await post<{ sale: ReceiptSale & { id: string } }>("/api/sales", {
              channel: "POS",
              partyId: partyId || undefined,
              customerName: !partyId && walkIn.name ? walkIn.name : null,
              customerPhone: !partyId && walkIn.phone ? walkIn.phone : null,
              priceLevel: level,
              discount: Number(billDiscount || 0),
              items: lines.map((l) => ({
                variantId: l.v.variantId,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                discount: Number(l.discount || 0),
                lotId: l.lotId || null,
                serials: l.v.trackSerials ? l.serials : [],
              })),
              payments,
            });
            setCheckout(false);
            setDone(r.sale);
          }}
        />
      )}

      {done && (
        <Modal
          open
          onClose={reset}
          title="Sale complete"
          size="sm"
          footer={
            <>
              <Link href={`${base}/sales/${done.id}`} className="mr-auto self-center text-xs font-semibold text-[#044d73] hover:underline">View invoice</Link>
              <Button variant="secondary" icon={Printer} onClick={printReceipt}>Print receipt</Button>
              <Button onClick={reset} autoFocus>New sale</Button>
            </>
          }
        >
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <div className="text-sm text-slate-500">{done.invoiceNumber}</div>
            <div className="text-3xl font-bold text-slate-900">{money(done.grandTotal)}</div>
            {done.changeGiven > 0 && (
              <div className="rounded-xl bg-emerald-50 px-4 py-2 text-emerald-700">
                Change to give: <b className="text-lg">{money(done.changeGiven)}</b>
              </div>
            )}
            {done.grandTotal - done.paidAmount > 0.004 && <Badge tone="amber">On credit: {money(done.grandTotal - done.paidAmount)}</Badge>}
          </div>
          <Receipt sale={done} />
        </Modal>
      )}
    </div>
  );
}

const METHODS = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "CARD", label: "Card", icon: CreditCard },
  { value: "MOBILE_WALLET", label: "Wallet", icon: Smartphone },
  { value: "SPLIT", label: "Split", icon: Plus },
] as const;

function CheckoutModal({ total, canCredit, onClose, submit }: { total: number; canCredit: boolean; onClose: () => void; submit: (payments: ReturnType<typeof paymentBody>) => Promise<void> }) {
  const { money, f } = useFmt();
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"] | "CREDIT">("CASH");
  const [tendered, setTendered] = useState(String(total));
  const [reference, setReference] = useState("");
  const [split, setSplit] = useState<PaymentRow[]>([{ amount: "", method: "CASH", referenceNumber: "" }]);
  const [paidNow, setPaidNow] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = 10 ** Math.max(0, 2 - f.currencyDecimals) * 100;
  const quick = [...new Set([total, Math.ceil(total / step) * step, Math.ceil(total / (step * 5)) * step * 5, Math.ceil(total / (step * 10)) * step * 10])].filter((x) => x >= total).slice(0, 4);
  const cash = Number(tendered || 0);

  const go = async () => {
    setError(null);
    let payments: ReturnType<typeof paymentBody>;
    if (method === "CASH") payments = cash > 0 ? [{ amount: cash, method: "CASH", referenceNumber: null }] : [];
    else if (method === "SPLIT") payments = paymentBody(split);
    else if (method === "CREDIT") payments = Number(paidNow) > 0 ? [{ amount: Number(paidNow), method: "CASH", referenceNumber: null }] : [];
    else payments = [{ amount: total, method, referenceNumber: reference || null }];
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    if (paid + 0.004 < total && !canCredit) return setError("Walk-in sales must be paid in full. Pick a customer to sell on credit.");
    setBusy(true);
    try {
      await submit(payments);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Take payment"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Back</Button>
          <Button loading={busy} onClick={go} className="min-w-40">Complete sale</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-[#044d73] p-4 text-center text-white">
          <div className="text-xs uppercase tracking-wide text-white/70">Amount due</div>
          <div className="text-3xl font-bold tabular-nums">{money(total)}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {METHODS.map((m) => (
            <button key={m.value} type="button" onClick={() => setMethod(m.value)} className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold ${method === m.value ? "border-[#044d73] bg-[#044d73]/10 text-[#044d73]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <m.icon className="h-5 w-5" />
              {m.label}
            </button>
          ))}
        </div>
        {canCredit && (
          <button type="button" onClick={() => setMethod("CREDIT")} className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold ${method === "CREDIT" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            Pay later / on account
          </button>
        )}

        {method === "CASH" && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500">Cash received</label>
            <Input autoFocus inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => e.key === "Enter" && go()} className="h-12 text-lg font-semibold" />
            <div className="flex flex-wrap gap-2">
              {quick.map((x) => (
                <button key={x} type="button" onClick={() => setTendered(String(x))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  {money(x)}
                </button>
              ))}
            </div>
            <div className={`flex justify-between rounded-xl px-3 py-2 text-sm font-semibold ${cash >= total ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              <span>{cash >= total ? "Change" : "Still due"}</span>
              <span className="tabular-nums">{money(Math.abs(cash - total))}</span>
            </div>
          </div>
        )}
        {(method === "CARD" || method === "MOBILE_WALLET") && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Reference (optional)</label>
            <Input autoFocus value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Approval code / transaction id" onKeyDown={(e) => e.key === "Enter" && go()} />
          </div>
        )}
        {method === "SPLIT" && <PaymentRows value={split} onChange={setSplit} total={total} />}
        {method === "CREDIT" && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Paid now in cash (optional)</label>
            <Input autoFocus inputMode="decimal" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="0" />
            <p className="text-xs text-slate-500">The rest is added to the customer’s balance.</p>
          </div>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
