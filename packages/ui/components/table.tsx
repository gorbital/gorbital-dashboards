import type { ReactNode } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { Skeleton } from "./spinner";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
  width?: string;
  /** Makes the column sortable: the value rows are compared by. */
  sortValue?: (row: T) => string | number;
};

export type Sort = { key: string; dir: "asc" | "desc" };

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  selected?: string;
  dense?: boolean;
  /** Current sort, applied to `rows`; pair with `onSort` (see `useTableSort`) for clickable headers. */
  sort?: Sort;
  onSort?: (key: string) => void;
  /** Renders shimmer rows instead of `rows`. */
  loading?: boolean;
  /** Rendered in place of the body when there are no rows. */
  empty?: ReactNode;
};

export function sortRows<T>(rows: T[], columns: Column<T>[], sort?: Sort): T[] {
  if (!sort) return rows;
  const value = columns.find((c) => c.key === sort.key)?.sortValue;
  if (!value) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === y) return 0;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    return String(x).localeCompare(String(y)) * dir;
  });
}

export function Table<T>({ columns, rows, rowKey, selected, dense, sort, onSort, onRowClick, loading, empty }: Props<T>) {
  const sorted = sortRows(rows, columns, sort);
  const py = dense ? "py-1.5" : "py-2.5";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-hairline text-left">
            {columns.map((c) => {
              const sortable = Boolean(c.sortValue && onSort);
              const active = sort?.key === c.key;
              const label = (
                <span className={`inline-flex items-center gap-1 ${c.align === "right" ? "flex-row-reverse" : ""}`}>
                  {c.header}
                  {sortable && (active ? sort?.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} /> : <ChevronsUpDown size={11} className="opacity-50" />)}
                </span>
              );
              return (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`px-4 py-2 text-[10px] font-mono font-medium uppercase tracking-[0.1em] text-dim ${c.align === "right" ? "text-right" : ""}`}
                >
                  {sortable ? (
                    <button type="button" onClick={() => onSort?.(c.key)} className={`uppercase tracking-[0.1em] hover:text-text ${active ? "text-text" : ""}`}>
                      {label}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="stagger">
          {loading
            ? Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-hairline last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 ${py} ${c.align === "right" ? "text-right" : ""}`}>
                      <Skeleton className={`h-3 ${i % 2 ? "w-2/3" : "w-1/2"}`} />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((r) => {
                const k = rowKey(r);
                return (
                  <tr
                    key={k}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={`border-b border-hairline last:border-0 transition-colors hover:bg-elevated/50 ${selected === k ? "bg-elevated/70" : ""} ${onRowClick ? "cursor-pointer" : ""}`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 ${py} align-middle ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          {!loading && sorted.length === 0 && empty !== undefined && (
            <tr>
              <td colSpan={columns.length} className="p-2">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
