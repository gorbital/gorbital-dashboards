import type { ReactNode } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { Mark } from "./brand";
import { products, type ProductId } from "../lib/products";

type Props = {
  product: ProductId;
  version: string;
  /** The rendered <Nav>, from a client module in the app. */
  nav: ReactNode;
  /** The app under inspection, shown under the brand. */
  app: { name: string; env: string; ok?: boolean };
  user: { name: string; initials: string };
  searchHint: string;
  children: ReactNode;
};

/** Sidebar + main column. Every dashboard page renders inside this. */
export function Shell({ product, version, nav, app, user, searchHint, children }: Props) {
  const p = products[product];
  const others = (Object.keys(products) as ProductId[]).filter((id) => id !== product);
  return (
    <div className="grid min-h-full grid-cols-[236px_minmax(0,1fr)]">
      <aside className="sticky top-0 flex h-screen flex-col gap-5 border-r border-hairline bg-surface px-3.5 py-5">
        <div className="group relative flex items-center gap-2.5 px-2">
          <Mark className="h-[17px]" />
          <span className="font-bold tracking-[-0.04em] text-[16px] leading-none">{p.name}</span>
          <span className="ml-auto font-mono text-[11px] text-dim">{version}</span>
          <details className="absolute inset-0">
            <summary className="block h-full w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden" aria-label="Switch tool" />
            <div className="absolute left-0 top-full z-20 mt-2 w-[220px] rounded-xl border border-border bg-elevated p-1.5 shadow-2xl shadow-black/50">
              {[p, ...others.map((id) => products[id])].map((q) => (
                <a
                  key={q.id}
                  href={q.id === product ? "#" : q.url}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[12px] ${q.id === product ? "bg-raised text-text" : "text-muted hover:bg-raised hover:text-text"}`}
                >
                  <span className="font-semibold tracking-tight">{q.name}</span>
                  <span className="font-mono text-[10px] text-dim">{q.kind}</span>
                </a>
              ))}
            </div>
          </details>
        </div>

        <button className="flex items-center gap-2.5 rounded-[10px] border border-border bg-elevated px-3 py-2 font-mono text-[12px] text-text hover:border-border-2">
          <i className={app.ok === false ? "h-2 w-2 rounded-full bg-danger" : "live-dot"} />
          <span className="truncate">{app.name}</span>
          <span className="ml-auto text-dim">{app.env}</span>
          <ChevronsUpDown size={12} className="text-dim" />
        </button>

        {nav}

        <div className="mt-auto flex items-center gap-2.5 px-2 text-[12px] text-muted">
          <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-primary font-mono text-[10px] font-semibold leading-none text-bg">
            {user.initials}
          </span>
          <span className="truncate">{user.name}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <SearchBar hint={searchHint} />
        {children}
      </div>
    </div>
  );
}

function SearchBar({ hint }: { hint: string }) {
  return (
    <div className="sr-only" aria-hidden="true">
      <Search size={12} /> {hint}
    </div>
  );
}
