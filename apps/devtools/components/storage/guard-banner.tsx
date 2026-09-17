"use client";

import { useState } from "react";
import { Lock, LockOpen, ShieldAlert } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import type { StorageStatus } from "@/lib/api/storage";
import { guardMessage } from "@/lib/storage/guard";

type Props = {
  status: StorageStatus;
  unlocked: boolean;
  onUnlock: () => void;
  onLock: () => void;
};

/**
 * The red banner for a store that isn't on this machine (roadmap item 76):
 * read-only until "Unlock for this session", confirmed; "Lock" re-arms it.
 */
export function GuardBanner({ status, unlocked, onUnlock, onLock }: Props) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div role="alert" className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-2.5 text-[12px] ${unlocked ? "border-danger/40 bg-danger/10" : "border-danger/50 bg-danger/15"}`}>
        <ShieldAlert size={15} className="shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <b className="text-text">{guardMessage(status)}</b>{" "}
          <span className="text-muted">
            {unlocked
              ? "Unlocked for this session: uploads, deletes, moves, new folders and signed PUT URLs change that bucket."
              : "Read-only: uploads, deletes, moves, new folders and signed PUT URLs are off until you unlock it for this session."}
          </span>
        </div>
        {unlocked ? (
          <Button size="sm" kind="secondary" icon={<Lock size={11} />} onClick={onLock}>
            Lock
          </Button>
        ) : (
          <Button size="sm" kind="danger" icon={<LockOpen size={11} />} onClick={() => setConfirm(true)}>
            Unlock for this session
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        danger
        title={`Unlock ${status.bucket} for this session?`}
        description={`Uploads, deletes, moves and new folders will change the ${status.driver} bucket ${status.bucket}${status.endpoint ? ` at ${status.endpoint}` : ""}. The unlock lasts until this tab closes, or until you lock it again.`}
        confirmLabel="Unlock"
        onConfirm={() => {
          onUnlock();
          setConfirm(false);
        }}
      />
    </>
  );
}
