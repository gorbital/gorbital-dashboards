/** A terminal-coloured block for logs, JSON and SQL. One step down from the panel. */
export function Code({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <pre className={`overflow-x-auto rounded-lg border border-hairline bg-code-bg p-3 font-mono text-[11.5px] leading-[1.6] text-muted ${className}`}>
      {children}
    </pre>
  );
}

export function Key({ children }: { children: React.ReactNode }) {
  return <span className="text-primary">{children}</span>;
}
export function Str({ children }: { children: React.ReactNode }) {
  return <span className="text-text">{children}</span>;
}
export function Num({ children }: { children: React.ReactNode }) {
  return <span className="text-info">{children}</span>;
}
export function Cmt({ children }: { children: React.ReactNode }) {
  return <span className="text-dim">{children}</span>;
}
