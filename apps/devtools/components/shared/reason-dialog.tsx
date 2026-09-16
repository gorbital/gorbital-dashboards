"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@gorbital/dash/components/button";
import { Dialog } from "@gorbital/dash/components/dialog";
import { Field, Textarea } from "@gorbital/dash/components/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  /** Red confirm button, for pauses, disables and resets. */
  danger?: boolean;
  /** The app answers 422 without one; the confirm button waits for it. */
  required?: boolean;
  loading?: boolean;
  /** An error from the last attempt, shown under the field. */
  error?: ReactNode;
  onConfirm: (reason: string) => unknown;
};

/** A confirmation that records why: the reason lands in history and the audit log. */
export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", danger, required = true, loading, error, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);
  const ready = !required || reason.trim() !== "";
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
            Cancel
          </Button>
          <Button kind={danger ? "danger" : "primary"} size="sm" onClick={() => void onConfirm(reason.trim())} disabled={!ready} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={required ? "Reason · required" : "Reason · optional"} htmlFor="reason" hint={error ? undefined : "Recorded with the change, in history and the audit log."} error={error}>
        <Textarea id="reason" rows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this change" />
      </Field>
    </Dialog>
  );
}
