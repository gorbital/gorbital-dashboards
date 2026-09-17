"use client";

import { Toaster as Sonner, toast } from "sonner";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useTheme } from "../lib/theme-store";
import { Spinner } from "./spinner";

export { toast };

/** Mount once, in the app's provider. Toasts stack bottom-right and read like the badges: mono, 12px, one tone each. */
export function Toaster() {
  const mode = useTheme();
  return (
    <Sonner
      theme={mode}
      position="bottom-right"
      gap={8}
      offset={16}
      visibleToasts={4}
      icons={{
        success: <CheckCircle2 size={14} className="text-ok" />,
        error: <AlertOctagon size={14} className="text-danger" />,
        warning: <AlertTriangle size={14} className="text-warn" />,
        info: <Info size={14} className="text-info" />,
        loading: <Spinner size={14} className="text-dim" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "flex w-[340px] items-start gap-2.5 rounded-xl border border-border bg-elevated px-3.5 py-3 text-[12px] text-text shadow-2xl shadow-umbra/50",
          icon: "mt-px shrink-0",
          content: "min-w-0 flex-1",
          title: "font-medium leading-snug",
          description: "mt-0.5 font-mono text-[11px] leading-snug text-muted",
          actionButton: "ml-auto h-7 shrink-0 rounded-lg bg-primary px-2.5 text-[11px] font-medium text-bg hover:bg-primary-soft",
          cancelButton: "ml-auto h-7 shrink-0 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted hover:text-text",
          closeButton: "text-dim hover:text-text",
          error: "border-danger/30",
          success: "border-ok/25",
          warning: "border-warn/25",
        },
      }}
    />
  );
}
