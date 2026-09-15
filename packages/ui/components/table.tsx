import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
  width?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowHref?: (row: T) => string | undefined;
  selected?: string;
  dense?: boolean;
};

export function Table<T>({ columns, rows, rowKey, selected, dense }: Props<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-hairline text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={`px-4 py-2 text-[10px] font-mono font-medium uppercase tracking-[0.1em] text-dim ${c.align === "right" ? "text-right" : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="stagger">
          {rows.map((r) => {
            const k = rowKey(r);
            return (
              <tr key={k} className={`border-b border-hairline last:border-0 transition-colors hover:bg-elevated/50 ${selected === k ? "bg-elevated/70" : ""}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 ${dense ? "py-1.5" : "py-2.5"} align-middle ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
