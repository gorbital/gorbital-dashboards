import type { ReactNode } from "react";
import { Bell, ChevronDown, ChevronsUpDown, Search } from "lucide-react";
import { Mark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { products, type ProductId } from "../lib/products";

export type ShellVariant = "boxed" | "docked" | "rail";

type Props = {
  product: ProductId;
  /** Shown next to the product name; a string, or a client component that knows the live version. */
  version: ReactNode;
  /**
   * boxed: the whole dashboard inside one framed card, top bar across the top.
   * docked: sidebar and top bar as separate floating cards.
   * rail: an icon-only rail and a pill-shaped top bar.
   */
  variant: ShellVariant;
  /** The rendered <Nav>, from a client module in the app. */
  nav: ReactNode;
  /** The app under inspection. */
  app: AppInfo;
  /** Replaces the static app chip, e.g. with a client component that follows the live status. */
  appChip?: ReactNode;
  user: { name: string; initials: string };
  searchHint: string;
  /** Replaces the static search box, e.g. with a client component that opens the command palette. */
  search?: ReactNode;
  children: ReactNode;
};

export type AppInfo = { name: string; env: string; ok?: boolean };

export function Shell(props: Props) {
  if (props.variant === "boxed") return <Boxed {...props} />;
  if (props.variant === "rail") return <Rail {...props} />;
  return <Docked {...props} />;
}

/* Pieces shared by the variants. */

function Switcher({ product, version, compact }: { product: ProductId; version?: ReactNode; compact?: boolean }) {
  const p = products[product];
  return (
    <div className="flex items-center gap-2.5">
      <Mark className="h-[17px]" />
      {!compact && (
        <>
          <span className="font-brand whitespace-nowrap text-[15px] font-bold leading-none tracking-[-0.03em]">{p.name}</span>
          {version && <span className="font-mono text-[11px] text-dim">{version}</span>}
        </>
      )}
    </div>
  );
}

/** The app under inspection: name, where it listens, and a dot that says whether it is up. */
export function AppChip({ app, className = "" }: { app: AppInfo; className?: string }) {
  return (
    <button type="button" className={`flex items-center gap-2.5 rounded-[10px] border border-border bg-elevated px-3 py-2 font-mono text-[12px] text-text hover:border-border-2 ${className}`}>
      <i className={app.ok === false ? "h-2 w-2 rounded-full bg-danger" : "live-dot"} />
      <span className="truncate">{app.name}</span>
      <span className="ml-auto text-dim">{app.env}</span>
      <ChevronsUpDown size={12} className="text-dim" />
    </button>
  );
}

/** The static search box; `SearchButton` is the same look for a client component to wire up. */
export function SearchButton({ hint, className = "", onClick }: { hint: string; className?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-9 items-center gap-2 rounded-lg border border-border bg-bg/60 px-3 text-[12px] text-dim hover:border-border-2 ${className}`}>
      <Search size={13} />
      <span className="truncate">{hint}</span>
      <kbd className="ml-auto">⌘K</kbd>
    </button>
  );
}

function Avatar({ user, withName }: { user: Props["user"]; withName?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-muted">
      <span className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full bg-primary font-mono text-[10px] font-semibold leading-none text-bg">{user.initials}</span>
      {withName && <span className="truncate">{user.name}</span>}
    </div>
  );
}

function BellButton() {
  return (
    <button className="relative grid h-9 w-9 place-items-center rounded-lg text-dim hover:bg-elevated hover:text-text" aria-label="Notifications">
      <Bell size={15} />
      <i className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
    </button>
  );
}

/* boxed: one framed card, the way a tool on the bench should feel. */
function Boxed({ product, version, nav, app, appChip, user, searchHint, search, children }: Props) {
  const p = products[product];
  return (
    <div className="dotgrid min-h-screen bg-bg p-4">
      <div className="flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-umbra/50">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-hairline px-4">
          <Switcher product={product} version={version} />
          <span className="h-5 w-px bg-hairline" />
          <div className="flex min-w-[220px] items-stretch">{appChip ?? <AppChip app={app} className="w-full py-1.5" />}</div>
          <div className="mx-auto flex w-[360px] items-stretch">{search ?? <SearchButton hint={searchHint} className="w-full" />}</div>
          <ThemeToggle />
          <BellButton />
          <Avatar user={user} withName />
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[228px] shrink-0 flex-col overflow-y-auto border-r border-hairline bg-bg/40 px-3 py-4">
            {nav}
            <div className="mt-auto px-3 pt-4 font-mono text-[10px] text-faint">
              {p.kind} · {version}
            </div>
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}

/* docked: sidebar and top bar as two floating cards with a gap between. */
function Docked({ product, version, nav, app, appChip, user, searchHint, search, children }: Props) {
  const p = products[product];
  return (
    <div className="flex min-h-screen gap-4 bg-bg p-4">
      <aside className="sticky top-4 flex h-[calc(100vh-2rem)] w-[252px] shrink-0 flex-col gap-5 rounded-2xl border border-hairline bg-surface p-4">
        <div className="px-1">
          <Switcher product={product} version={version} />
        </div>
        {appChip ?? <AppChip app={app} />}
        <div className="-mx-1 flex-1 overflow-y-auto px-1">{nav}</div>
        <div className="flex items-center gap-2.5 border-t border-hairline px-1 pt-4">
          <Avatar user={user} withName />
          <ChevronDown size={12} className="ml-auto text-dim" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="sticky top-4 z-20 flex h-14 shrink-0 items-center gap-3 rounded-2xl border border-hairline bg-surface/90 px-5 backdrop-blur">
          <nav className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-dim">
            <span className="text-muted">{p.short}</span>
            <span className="text-faint">›</span>
            <span className="text-text">{app.name}</span>
          </nav>
          <div className="ml-6 flex w-[380px] items-stretch">{search ?? <SearchButton hint={searchHint} className="w-full" />}</div>
          <span className="ml-auto" />
          <ThemeToggle />
          <BellButton />
          <Avatar user={user} />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/* rail: icons only on the left, a pill of a top bar. */
function Rail({ product, version, nav, app, appChip, user, searchHint, search, children }: Props) {
  const p = products[product];
  return (
    <div className="flex min-h-screen gap-4 bg-bg p-4">
      <aside className="sticky top-4 flex h-[calc(100vh-2rem)] w-[68px] shrink-0 flex-col items-center gap-4 rounded-2xl border border-hairline bg-surface py-4">
        <Switcher product={product} compact />
        <div className="w-full flex-1 overflow-y-auto px-3 pt-2">{nav}</div>
        <Avatar user={user} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="sticky top-4 z-20 flex h-14 shrink-0 items-center gap-3 rounded-full border border-hairline bg-surface/90 pl-5 pr-3 backdrop-blur">
          <span className="font-brand text-[15px] font-bold tracking-[-0.03em]">{p.name}</span>
          <span className="font-mono text-[11px] text-dim">{version}</span>
          {appChip ?? <AppChip app={app} className="ml-3 rounded-full py-1.5" />}
          <div className="ml-auto flex w-[360px] items-stretch">{search ?? <SearchButton hint={searchHint} className="w-full rounded-full" />}</div>
          <ThemeToggle />
          <BellButton />
          <Avatar user={user} withName />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
