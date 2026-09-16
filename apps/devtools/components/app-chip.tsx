"use client";

import { AppChip } from "@gorbital/dash/components/shell";
import { NotConnectedError } from "@/lib/api/client";
import { useStatus } from "@/lib/api/queries";

/** The shell's app chip, following the live status: name, the port it listens on, a dot for running. */
export function LiveAppChip() {
  const status = useStatus();
  if (status.data) {
    const { project, app } = status.data;
    const port = app.addr.includes(":") ? `:${app.addr.split(":").pop()}` : app.addr;
    return <AppChip app={{ name: project.name, env: app.state === "running" ? port : app.state, ok: app.state === "running" }} className="w-full py-1.5" />;
  }
  if (status.error instanceof NotConnectedError) return <AppChip app={{ name: "not connected", env: "orb dev", ok: false }} className="w-full py-1.5" />;
  if (status.error) return <AppChip app={{ name: "not signed in", env: "portal", ok: false }} className="w-full py-1.5" />;
  return <AppChip app={{ name: "connecting…", env: "", ok: false }} className="w-full py-1.5 opacity-70" />;
}
