"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Plus, Trash2, X } from "lucide-react";
import { api, apiError } from "@/lib/client/http";
import { useSession } from "@/lib/client/session";

interface TransferItem {
  id: string;
  name: string;
  unit: string;
  variants: { id: string; name: string; isDefault: boolean; stock: number }[];
}

interface Line {
  variantId: string;
  quantity: number | "";
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:border-[#044d73] focus:outline-none focus:ring-1 focus:ring-[#044d73]";
const labelCls = "mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide";

// Moves stock from the active store to another one in a single step.
export function StockTransferModal({
  items,
  onClose,
  onDone,
}: {
  items: TransferItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { session } = useSession();
  const from = session.locations.find((l) => l.id === session.activeLocationId);
  const destinations = session.locations.filter((l) => l.id !== session.activeLocationId);

  const [toLocationId, setToLocationId] = useState(destinations[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ variantId: "", quantity: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everything in stock here, one option per size / colour.
  const options = useMemo(
    () =>
      items.flatMap((i) =>
        i.variants
          .filter((v) => v.stock > 0)
          .map((v) => ({
            id: v.id,
            label: v.isDefault ? i.name : `${i.name} (${v.name})`,
            stock: v.stock,
            unit: i.unit,
          })),
      ),
    [items],
  );
  const byId = new Map(options.map((o) => [o.id, o]));

  function setLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = lines.filter((l) => l.variantId && Number(l.quantity) > 0);
    if (!toLocationId) return setError("Choose where the stock is going.");
    if (valid.length === 0) return setError("Add at least one item and quantity.");
    for (const l of valid) {
      const o = byId.get(l.variantId);
      if (o && Number(l.quantity) > o.stock) return setError(`Only ${o.stock} ${o.unit} of ${o.label} in stock here.`);
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/inventory/transfers", {
        toLocationId,
        note: note.trim() || null,
        receive: true,
        items: valid.map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity) })),
      });
      onDone();
    } catch (err) {
      setError(apiError(err, "Could not transfer the stock."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden">
        <div className="relative flex shrink-0 flex-col items-center gap-1 p-8 bg-[#044d73] text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 mb-2">
            <ArrowRightLeft className="h-7 w-7" />
          </div>
          <h3 className="text-2xl font-semibold">Transfer Stock</h3>
          <p className="text-sm text-white/70">Move stock from {from?.name ?? "this store"} to another store.</p>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-6 rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto p-8">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>From</label>
                <input value={from?.name ?? ""} disabled className={`${inputCls} bg-slate-50 text-slate-500`} />
              </div>
              <div>
                <label className={labelCls}>To</label>
                <select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} className={inputCls}>
                  {destinations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Items</label>
              <div className="space-y-2">
                {lines.map((l, idx) => {
                  const o = byId.get(l.variantId);
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_110px_auto] gap-2">
                      <select
                        value={l.variantId}
                        onChange={(e) => setLine(idx, { variantId: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">Select item…</option>
                        {options.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.label} — {op.stock} {op.unit}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={l.quantity}
                        placeholder={o ? `Max ${o.stock}` : "Qty"}
                        onChange={(e) => setLine(idx, { quantity: e.target.value === "" ? "" : Number(e.target.value) })}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        title="Remove"
                        disabled={lines.length === 1}
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="shrink-0 rounded-lg border border-slate-200 px-3 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, { variantId: "", quantity: "" }])}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#044d73] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add another item
              </button>
              {options.length === 0 && (
                <p className="mt-2 text-xs text-slate-400">There is no stock at this store to transfer.</p>
              )}
            </div>

            <div>
              <label className={labelCls}>Note</label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputCls}
                placeholder="Optional"
              />
            </div>
          </div>

          {error && (
            <div className="mx-8 mb-4 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-600 font-medium">
              {error}
            </div>
          )}

          <div className="flex shrink-0 gap-3 border-t border-slate-100 bg-white p-5 px-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-[#044d73] hover:bg-[#033f60] py-3 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50"
            >
              {saving ? "Transferring..." : "Transfer Stock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
