import type { ReactNode } from "react";
import { products, type ProductId } from "../lib/products";

type HeaderProps = {
  product: ProductId;
  title: string;
  /** Breadcrumb above the title, e.g. the list a detail page belongs to. */
  crumb?: string;
  /** One line under the title. */
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  /** Kept for callers; the search box lives in the shell now. */
  searchHint?: string;
};

export function PageHeader({ product, title, crumb, description, icon, children }: HeaderProps) {
  const p = products[product];
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3 px-6 pt-5">
      {icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-hairline bg-surface text-primary">{icon}</span>}
      <div className="min-w-0">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-dim">{crumb ?? p.name}</div>
        <h1 className="mt-0.5 text-[22px] font-semibold leading-none tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1.5 font-mono text-[12px] text-muted">{description}</p>}
      </div>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2 self-center">{children}</div>}
    </header>
  );
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-1 flex-col gap-4 px-6 pb-6 pt-5 ${className}`}>{children}</div>;
}
