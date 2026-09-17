"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Segmented } from "@gorbital/dash/components/pill";
import { Select } from "@gorbital/dash/components/input";
import { Spinner } from "@gorbital/dash/components/spinner";
import { fmtInt } from "@gorbital/dash/lib/format";
import type { RowPage } from "@/lib/api/db";
import { pageSizes, type ViewMode } from "@/lib/table-editor/url";

type Props = {
  page: RowPage | undefined;
  fetching: boolean;
  limit: number;
  pageNo: number;
  view: ViewMode;
  onLimit: (n: number) => void;
  onPage: (n: number) => void;
  onView: (v: ViewMode) => void;
};

const nav = "grid h-6 w-6 place-items-center rounded text-dim hover:bg-elevated hover:text-text disabled:opacity-30 disabled:hover:bg-transparent";

export function Footer({ page, fetching, limit, pageNo, view, onLimit, onPage, onView }: Props) {
  const count = page?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / limit));
  const from = page && page.rows.length ? page.offset + 1 : 0;
  const to = page ? page.offset + page.rows.length : 0;
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-t border-hairline px-3 text-[11.5px] text-muted">
      <Segmented<ViewMode> value={view} onChange={onView} options={[{ value: "data", label: "Data" }, { value: "definition", label: "Definition" }]} className="h-7" />
      {view === "data" && (
        <>
          <span className="flex items-center gap-1">
            <button type="button" className={nav} onClick={() => onPage(1)} disabled={pageNo <= 1} aria-label="first page">
              <ChevronsLeft size={13} />
            </button>
            <button type="button" className={nav} onClick={() => onPage(pageNo - 1)} disabled={pageNo <= 1} aria-label="previous page">
              <ChevronLeft size={13} />
            </button>
            <span className="min-w-[84px] text-center font-mono tnum">
              page {pageNo} / {pages}
            </span>
            <button type="button" className={nav} onClick={() => onPage(pageNo + 1)} disabled={pageNo >= pages} aria-label="next page">
              <ChevronRight size={13} />
            </button>
            <button type="button" className={nav} onClick={() => onPage(pages)} disabled={pageNo >= pages} aria-label="last page">
              <ChevronsRight size={13} />
            </button>
          </span>
          <div className="w-[112px] shrink-0">
            <Select value={String(limit)} onChange={(e) => onLimit(Number(e.target.value))} aria-label="Rows per page">
              {pageSizes.map((n) => (
                <option key={n} value={n}>
                  {n} rows
                </option>
              ))}
            </Select>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap font-mono tnum">
            {fetching && <Spinner size={11} className="text-dim" />}
            {page ? (
              <>
                {from}–{to} of {page.estimated ? "~" : ""}
                {fmtInt(count)} {count === 1 ? "row" : "rows"}
              </>
            ) : (
              "—"
            )}
          </span>
        </>
      )}
    </div>
  );
}
