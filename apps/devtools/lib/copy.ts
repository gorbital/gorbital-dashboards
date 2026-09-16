import { toast } from "@gorbital/dash/components/toast";

/** Copies `text` to the clipboard and says so; a blocked clipboard gets a warning instead of a silent failure. */
export async function copyText(text: string, what = "Copied"): Promise<void> {
  try {
    if (!navigator.clipboard) throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
    toast.success(what, { description: text.length > 60 ? `${text.slice(0, 60)}…` : text });
  } catch {
    toast.warning("Couldn't copy", { description: "the browser blocked the clipboard on this origin" });
  }
}
