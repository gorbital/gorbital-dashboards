"use client";

import { useSyncExternalStore } from "react";

/**
 * The theme as one attribute on <html>: data-theme="dark" | "light". The
 * layout's inline script sets it before the first paint (localStorage.theme,
 * else the system preference, dark as the fallback); `setTheme` changes it
 * and remembers the choice per browser. Components that draw outside CSS
 * (Monaco, toasts, exports) follow it through `useTheme`, which watches the
 * attribute with a MutationObserver.
 */
export type ThemeMode = "dark" | "light";

export const THEME_KEY = "theme";

/** The inline script for the layout's <head>: the same rule the store applies, before React runs. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export function readTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function setTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Private mode or storage off: the theme still applies for this page.
  }
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = readTheme() === "light" ? "dark" : "light";
  setTheme(next);
  return next;
}

/** Calls back whenever data-theme changes, here or in another tab of the same portal. */
export function subscribeTheme(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    if (e.newValue === "light" || e.newValue === "dark") document.documentElement.setAttribute("data-theme", e.newValue);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = (): ThemeMode => "dark";

/** The current theme; re-renders when it changes. Dark during prerendering and hydration. */
export function useTheme(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, readTheme, serverSnapshot);
}
