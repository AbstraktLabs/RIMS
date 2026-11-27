"use client";

import { useEffect, useRef, useState } from "react";

/** Counts from the previous value to the new one, scoreboard-style. */
function useAnimatedCounter(target: number, durationMs = 600): number {
  const [display, setDisplay] = useState(target);
  const startRef = useRef(target);
  useEffect(() => {
    const start = startRef.current;
    const diff = target - start;
    if (diff === 0) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / durationMs, 1);
      setDisplay(Math.round(start + diff * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else startRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return display;
}

export function AnimatedStatValue({ value, format, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const n = useAnimatedCounter(value);
  return <span className={className}>{format ? format(n) : n}</span>;
}
