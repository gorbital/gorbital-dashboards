import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { products, type ProductId } from "../lib/products";

type HeaderProps = {
  product: ProductId;
  title: string;
  /** Breadcrumb before the title, e.g. a trace ID's parent screen. */
  crumb?: string;
  children?: ReactNode;
  searchHint?: string;
};

export function PageHeader({ product, title, crumb, children, searchHint = "Search" }: HeaderProps) {
  const p = products[product];
  return (
    <header className="sticky top-0 z-10 flex h-[58px] items-center gap-3.5 border-b border-hairline bg-bg/85 px-7 backdrop-blur">
      <h1 className="text-[15px] font-semibold leading-none">
        <span className="text-dim font-medium">{crumb ?? p.name} /</span> {title}
      </h1>
      {children}
      <button className="ml-auto flex h-8 w-[300px] items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[12px] text-dim hover:border-border-2">
        <Search size={13} />
        <span className="truncate">{searchHint}</span>
        <kbd className="ml-auto">⌘K</kbd>
      </button>
    </header>
  );
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-1 flex-col gap-4 p-7 ${className}`}>{children}</div>;
}
