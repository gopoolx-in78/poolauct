"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";
const STORAGE_KEY = "theme-preference";
const order: Mode[] = ["system", "light", "dark"];
const listeners = new Set<() => void>();

const isMode = (v: string | null): v is Mode => v === "system" || v === "light" || v === "dark";

/** The viewer's saved choice, else the site default chosen in the theme manager. */
function read(): Mode {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — fall through to the site default.
  }
  if (isMode(saved)) return saved;
  const fallback = document.documentElement.getAttribute("data-default-scheme");
  return isMode(fallback) ? fallback : "system";
}

function write(mode: Mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode); // "system" is stored too, so it overrides a non-system site default
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

/**
 * Inline script applied before paint to avoid a theme flash. Contains no user input: the site default is read from the
 * enum-validated data-default-scheme attribute.
 */
export const themeInitScript = `try{var d=document.documentElement,t=null;try{t=localStorage.getItem("${STORAGE_KEY}")}catch(e){}if(t!=="system"&&t!=="light"&&t!=="dark")t=d.getAttribute("data-default-scheme");if(t==="light"||t==="dark")d.setAttribute("data-theme",t)}catch(e){}`;
