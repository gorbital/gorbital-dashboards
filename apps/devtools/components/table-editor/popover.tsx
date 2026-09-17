"use client";

import type { ReactNode } from "react";
import { Popover as RadixPopover } from "radix-ui";
import { menuClass } from "@gorbital/dash/components/dropdown";

type Props = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens it; it receives the trigger's props. */
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end" | "center";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
};

/** A small floating panel anchored to its trigger, dressed like a menu; for pickers and filter forms. */
export function Popover({ open, onOpenChange, trigger, children, align = "start", side = "bottom", className = "" }: Props) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content align={align} side={side} sideOffset={6} collisionPadding={8} className={`${menuClass} ${className}`}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
