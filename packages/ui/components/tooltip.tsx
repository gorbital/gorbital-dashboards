"use client";

import type { ReactNode } from "react";
import { Tooltip as RadixTooltip } from "radix-ui";

/** Wrap the app once; tooltips share its delay. */
export function TooltipProvider({ children, delayDuration = 300 }: { children: ReactNode; delayDuration?: number }) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  );
}

type Props = {
  content: ReactNode;
  /** The element the tooltip hangs off; it receives the trigger's props. */
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Mono text after the content, e.g. a shortcut. */
  shortcut?: string;
};

export function Tooltip({ content, children, side = "top", align = "center", shortcut }: Props) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          className="z-50 max-w-[280px] rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[11.5px] leading-snug text-text shadow-xl shadow-black/40"
        >
          {content}
          {shortcut && <kbd className="ml-2">{shortcut}</kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
