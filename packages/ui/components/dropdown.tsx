"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";

export type DropdownItem =
  | "separator"
  | {
      label: ReactNode;
      onSelect?: () => void;
      icon?: ReactNode;
      /** Mono text at the right edge: a shortcut or a count. */
      shortcut?: ReactNode;
      danger?: boolean;
      disabled?: boolean;
      /** Shows a check mark when true. */
      checked?: boolean;
    };

type Props = {
  /** The element that opens the menu; it receives the trigger's props. */
  trigger: ReactNode;
  items: DropdownItem[];
  label?: ReactNode;
  align?: "start" | "end" | "center";
  side?: "top" | "bottom";
  className?: string;
};

export const menuClass = "z-50 min-w-[180px] rounded-xl border border-border bg-elevated p-1.5 shadow-2xl shadow-umbra/50 outline-none";
export const menuItemClass =
  "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] outline-none data-[highlighted]:bg-raised data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export function Dropdown({ trigger, items, label, align = "end", side = "bottom", className = "" }: Props) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align={align} side={side} sideOffset={6} className={`${menuClass} ${className}`}>
          {label && <Menu.Label className="px-2.5 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{label}</Menu.Label>}
          {items.map((it, i) =>
            it === "separator" ? (
              <Menu.Separator key={i} className="my-1.5 h-px bg-hairline" />
            ) : (
              <Menu.Item key={i} disabled={it.disabled} onSelect={it.onSelect} className={`${menuItemClass} ${it.danger ? "text-danger" : "text-text"}`}>
                {it.icon && <span className={`grid w-4 place-items-center ${it.danger ? "text-danger" : "text-dim"}`}>{it.icon}</span>}
                <span className="flex-1 truncate">{it.label}</span>
                {it.checked && <Check size={12} className="text-primary" />}
                {it.shortcut && <span className="ml-3 font-mono text-[10.5px] text-dim">{it.shortcut}</span>}
              </Menu.Item>
            ),
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
