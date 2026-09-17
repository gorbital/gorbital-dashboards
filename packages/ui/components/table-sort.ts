"use client";

import { useCallback, useState } from "react";
import type { Sort } from "./table";

/** Sort state for a `Table`: clicking a header sorts ascending, again descending, again clears. */
export function useTableSort(initial?: Sort) {
  const [sort, setSort] = useState<Sort | undefined>(initial);
  const onSort = useCallback((key: string) => {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : undefined));
  }, []);
  return { sort, onSort, setSort };
}
