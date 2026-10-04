"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "theme";
const CHANGE = "theme-change";
const OPTIONS: Theme[] = ["system", "light", "dark"];

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  return () => window.removeEventListener(CHANGE, cb);
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

export function ThemeControl() {
  // Server snapshot is "system"; the inline script in the layout has already
  // set the real attribute before paint, so only this label can lag.
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return (
    <div role="radiogroup" aria-label="Theme" className="flex border border-border">
      {OPTIONS.map((o) => (
        <button
          key={o}
          role="radio"
          aria-checked={theme === o}
          onClick={() => apply(o)}
          className={`px-1.5 py-0.5 text-[11px] ${
            theme === o ? "bg-accent text-background" : "text-muted hover:text-foreground"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
