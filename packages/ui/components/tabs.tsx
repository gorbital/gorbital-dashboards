"use client";

import type { ReactNode } from "react";
import { Tabs as RadixTabs } from "radix-ui";

export type Tab<T extends string> = { value: T; label: ReactNode; badge?: ReactNode; disabled?: boolean };

type Props<T extends string> = {
  tabs: Tab<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** Actions at the right end of the tab list. */
  actions?: ReactNode;
  /** `TabPanel`s, or anything that reads `value` itself. */
  children?: ReactNode;
  className?: string;
};

/** Underlined tabs across a panel or a page; put the content in `TabPanel`s. */
export function Tabs<T extends string>({ tabs, value, defaultValue, onChange, actions, children, className = "" }: Props<T>) {
  return (
    <RadixTabs.Root value={value} defaultValue={defaultValue ?? tabs[0]?.value} onValueChange={onChange ? (v) => onChange(v as T) : undefined} className={className}>
      <div className="flex items-end gap-2 border-b border-hairline">
        <RadixTabs.List className="-mb-px flex items-center gap-1">
          {tabs.map((t) => (
            <RadixTabs.Trigger
              key={t.value}
              value={t.value}
              disabled={t.disabled}
              className="flex h-9 items-center gap-1.5 border-b-2 border-transparent px-3 text-[12px] font-medium text-muted outline-none transition-colors hover:text-text data-[state=active]:border-primary data-[state=active]:text-text data-[disabled]:opacity-50 focus-visible:bg-elevated/60"
            >
              {t.label}
              {t.badge !== undefined && <span className="font-mono text-[11px] text-dim tnum">{t.badge}</span>}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>
        {actions && <div className="ml-auto flex items-center gap-1.5 pb-1.5">{actions}</div>}
      </div>
      {children}
    </RadixTabs.Root>
  );
}

export function TabPanel({ value, children, className = "" }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RadixTabs.Content value={value} className={`pt-3 outline-none ${className}`}>
      {children}
    </RadixTabs.Content>
  );
}
