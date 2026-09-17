"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";
import { SearchButton } from "./shell";

export type CommandItem = {
  id: string;
  label: string;
  /** Mono text at the right edge: a path, a count, a kind. */
  hint?: string;
  group?: string;
  icon?: ReactNode;
  /** Extra words the item matches on. */
  keywords?: string[];
  /** Navigates with the router when selected. */
  href?: string;
  onSelect?: () => void;
};

type Props = {
  items: CommandItem[];
  /** The search box's text. */
  hint: string;
  placeholder?: string;
  className?: string;
};

/** The ⌘K palette and the search box that opens it. Pass it as the shell's `search`. */
export function CommandPalette({ items, hint, placeholder = "Type a page, a route, a command…", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const select = useCallback(
    (it: CommandItem) => {
      setOpen(false);
      if (it.href) router.push(it.href);
      it.onSelect?.();
    },
    [router],
  );

  const groups = new Map<string, CommandItem[]>();
  for (const it of items) {
    const g = it.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }

  return (
    <>
      <SearchButton hint={hint} className={`w-full ${className}`} onClick={() => setOpen(true)} />
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command palette"
        loop
        overlayClassName="fixed inset-0 z-40 bg-bg/70 backdrop-blur-[2px]"
        contentClassName="fixed left-1/2 top-[18vh] z-50 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/60 outline-none"
      >
        <div className="flex items-center gap-2 border-b border-hairline px-4">
          <Search size={14} className="shrink-0 text-dim" />
          <Command.Input placeholder={placeholder} className="h-11 w-full bg-transparent text-[13px] text-text outline-none placeholder:text-faint" />
          <kbd>esc</kbd>
        </div>
        <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-8 text-center text-[12px] text-dim">Nothing matches.</Command.Empty>
          {[...groups.entries()].map(([g, list]) => (
            <Command.Group key={g || "_"} heading={g || undefined} className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-dim">
              {list.map((it) => (
                <Command.Item
                  key={it.id}
                  value={it.id}
                  keywords={[it.label, ...(it.keywords ?? []), it.hint ?? ""]}
                  onSelect={() => select(it)}
                  className="group flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-muted data-[selected=true]:bg-elevated data-[selected=true]:text-text"
                >
                  {it.icon && <span className="grid w-4 place-items-center text-dim group-data-[selected=true]:text-primary">{it.icon}</span>}
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="font-mono text-[11px] text-dim">{it.hint}</span>}
                  <CornerDownLeft size={11} className="text-faint opacity-0 group-data-[selected=true]:opacity-100" />
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
