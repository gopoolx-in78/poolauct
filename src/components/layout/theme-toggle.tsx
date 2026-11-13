"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";
const STORAGE_KEY = "theme-preference";
const order: Mode[] = ["system", "light", "dark"];
const listeners = new Set<() => void>();

function read(): Mode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function write(mode: Mode) {
  try {
    if (mode === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage unavailable (private mode etc.) — preference applies to this page view only.
  }
  if (mode === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", mode);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Per-viewer convenience only; the server never depends on it. */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);
  const next: Mode = order[(order.indexOf(mode) + 1) % order.length] ?? "system";
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => write(next)}
      className="text-ink hover:bg-ink/5 inline-flex size-11 items-center justify-center rounded"
      aria-label={`Colour theme: ${mode}. Switch to ${next}.`}
      title={`Theme: ${mode}`}
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}

/** Inline script applied before paint to avoid a theme flash. Contains no user input. */
export const themeInitScript = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
