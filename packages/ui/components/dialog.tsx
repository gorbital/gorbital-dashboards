"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { Button } from "./button";
import { Field, Input } from "./input";

export const overlayClass = "fixed inset-0 z-40 bg-bg/70 backdrop-blur-[2px]";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned under the body. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

const widths = { sm: "w-[400px]", md: "w-[480px]", lg: "w-[640px]" };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md" }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlayClass} />
        <RadixDialog.Content
          className={`fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface shadow-2xl shadow-umbra/60 outline-none ${widths[size]}`}
        >
          <header className="flex items-start gap-3 px-5 pt-4">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="text-[14px] font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[12px] leading-relaxed text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="-mr-1.5 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-dim hover:bg-elevated hover:text-text" aria-label="Close">
              <X size={14} />
            </RadixDialog.Close>
          </header>
          {children && <div className="min-h-0 overflow-y-auto px-5 pt-3 text-[12px]">{children}</div>}
          {footer && <footer className="flex items-center justify-end gap-2 px-5 pb-4 pt-4">{footer}</footer>}
          {!footer && <div className="pb-4" />}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for stops, deletes and resets. */
  danger?: boolean;
  /** Asks the user to type this text before the confirm button enables. */
  confirmText?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, confirmText, loading, onConfirm }: ConfirmProps) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const ready = !confirmText || typed === confirmText;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button kind={danger ? "danger" : "primary"} size="sm" onClick={() => void onConfirm()} disabled={!ready} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {confirmText && (
        <Field
          label={
            <>
              Type <span className="text-text normal-case tracking-normal">{confirmText}</span> to confirm
            </>
          }
          htmlFor="confirm-text"
        >
          <Input id="confirm-text" mono autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmText} autoComplete="off" />
        </Field>
      )}
    </Dialog>
  );
}
