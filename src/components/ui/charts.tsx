"use client";

import { useState } from "react";

/** Minimal responsive bar chart (no chart library). */
export function BarChart({
  data,
  format,
  height = 220,
  color = "#044d73",
}: {
  data: { label: string; value: number; sub?: string }[];
  format: (v: number) => string;
  height?: number;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const W = 600;
  const H = height;
  const pad = { t: 10, b: 22, l: 4, r: 4 };
  const bw = (W - pad.l - pad.r) / n;
  const labelEvery = Math.ceil(n / 8);
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Bar chart">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * (1 - g)} y2={pad.t + (H - pad.t - pad.b) * (1 - g)} stroke="#e2e8f0" strokeDasharray="3 3" />
        ))}
        {data.map((d, i) => {
          const h = ((H - pad.t - pad.b) * d.value) / max;
          const x = pad.l + i * bw + bw * 0.15;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <rect x={x} y={H - pad.b - h} width={bw * 0.7} height={Math.max(h, d.value > 0 ? 2 : 0)} rx={3} fill={color} opacity={hover === null || hover === i ? 0.9 : 0.45} />
              {i % labelEvery === 0 && (
                <text x={x + bw * 0.35} y={H - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-md">
          <span className="font-semibold text-slate-800">{format(data[hover].value)}</span>
          <span className="ml-2 text-slate-400">{data[hover].sub ?? data[hover].label}</span>
        </div>
      )}
    </div>
  );
}

/** Horizontal share bars — for breakdowns like payment methods. */
export function ShareBars({ items, format }: { items: { label: string; value: number }[]; format: (v: number) => string }) {
  const total = items.reduce((a, b) => a + Math.max(0, b.value), 0) || 1;
  const colors = ["#044d73", "#10b981", "#f59e0b", "#6366f1", "#f43f5e", "#64748b"];
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-slate-600">{it.label}</span>
            <span className="font-semibold text-slate-800">
              {format(it.value)} <span className="font-normal text-slate-400">· {Math.round((Math.max(0, it.value) / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(Math.max(0, it.value) / total) * 100}%`, backgroundColor: colors[i % colors.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}
