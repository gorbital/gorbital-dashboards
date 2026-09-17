"use client";

import { Moon, Sun } from "lucide-react";
import { toggleTheme, useTheme } from "../lib/theme-store";

/**
 * The light/dark switch in the shell's top bar: a sun on the dark theme, a
 * moon on the light one, each naming the theme a click brings. Stores the
 * choice in localStorage.theme; the layout's script restores it on load.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const mode = useTheme();
  const next = mode === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      className={`grid h-9 w-9 place-items-center rounded-lg text-dim transition-colors hover:bg-elevated hover:text-text ${className}`}
      aria-label={`Switch to the ${next} theme`}
      title={`${next === "light" ? "Light" : "Dark"} theme`}
    >
      {mode === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
