"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/**
 * Display-only countdown. The server decides when an auction closes (§8.4); this never gates bidding.
 * Renders the server-provided label first, then ticks once mounted.
 */
export function Countdown({ to, initialLabel }: { to: string; initialLabel: string }) {
  const [label, setLabel] = useState(initialLabel);
  useEffect(() => {
    const target = new Date(to).getTime();
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) return setLabel("Ending — refresh for the result");
      const p = parts(ms);
      setLabel(
        p.d > 0
          ? `${p.d}d ${p.h}h ${p.m}m`
          : `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}:${String(p.s).padStart(2, "0")}`,
      );
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to]);
  return (
    <span className="font-mono tabular-nums" aria-live="off">
      {label}
    </span>
  );
}
