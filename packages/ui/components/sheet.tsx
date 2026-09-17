"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { overlayClass } from "./dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Mono text next to the title, like a panel's meta. */
  meta?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 420, 480, 560 or 820 px; `xl` is for editors with a row of controls per item. */
  width?: "sm" | "md" | "lg" | "xl";
  /** Remove the body padding, for tables and lists. */
  flush?: boolean;
};

const widths = { sm: "w-[420px]", md: "w-[480px]", lg: "w-[560px]", xl: "w-[820px]" };

/** A panel that slides in from the right edge, for details and forms that keep the page behind in view. */
export function Sheet({ open, onOpenChange, title, meta, description, children, footer, width = "md", flush }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlayClass} />
        <RadixDialog.Content
          className={`fixed bottom-4 right-4 top-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-surface shadow-2xl shadow-umbra/60 outline-none ${widths[width]}`}
        >
          <header className="flex items-start gap-3 border-b border-hairline px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <RadixDialog.Title className="text-[14px] font-semibold">{title}</RadixDialog.Title>
                {meta && <span className="font-mono text-[11px] text-dim">{meta}</span>}
              </div>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[12px] text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{typeof title === "string" ? title : "Panel"}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="-mr-1.5 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-dim hover:bg-elevated hover:text-text" aria-label="Close">
              <X size={14} />
            </RadixDialog.Close>
          </header>
          <div className={`min-h-0 flex-1 overflow-y-auto text-[12px] ${flush ? "" : "p-5"}`}>{children}</div>
          {footer && <footer className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</footer>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
