import type { ReactNode } from "react";

type Props = {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Remove the inner padding, for tables and lists that run edge to edge. */
  flush?: boolean;
};

export function Panel({ title, meta, actions, children, className = "", flush }: Props) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      {(title || actions) && (
        <header className={`flex items-center gap-2 ${flush ? "px-4 pt-3.5 pb-2.5" : "px-4 pt-3.5"}`}>
          {title && <h2 className="text-[13px] font-semibold">{title}</h2>}
          {meta && <span className="font-mono text-[11px] text-dim">{meta}</span>}
          {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4 pt-3"}>{children}</div>
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-muted">
          <i className="h-2 w-2 rounded-[2px]" style={{ background: it.color }} />
          {it.label}
          {it.value && <span className="font-mono text-dim tnum">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function KeyList({ rows }: { rows: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[12px]">
      {rows.map((r, i) => (
        <div key={i} className="contents">
          <dt className="text-dim">{r.k}</dt>
          <dd className="min-w-0 truncate font-mono text-text">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="dotgrid flex flex-col items-center justify-center gap-1 rounded-lg py-14 text-center">
      <div className="text-[13px] font-medium">{title}</div>
      {hint && <div className="text-[12px] text-dim">{hint}</div>}
    </div>
  );
}
