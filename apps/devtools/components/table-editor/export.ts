import { toast } from "@gorbital/dash/components/toast";
import { fetchRows, type Cell, type Filter, type Sort } from "@/lib/api/db";
import { toCSV, toJSONExport } from "@/lib/table-editor/csv";

export type ExportFormat = "csv" | "json";

type Options = { schema: string; table: string; filters: Filter[]; sorts: Sort[]; format: ExportFormat };

/** Pages through `rows/query` a thousand at a time and hands the browser a file. */
export async function exportTable({ schema, table, filters, sorts, format }: Options): Promise<void> {
  const id = toast.loading(`Exporting ${schema}.${table}…`);
  try {
    const rows: Cell[][] = [];
    let columns: string[] = [];
    let offset = 0;
    for (;;) {
      const page = await fetchRows({ schema, table, filters, sorts, limit: 1000, offset });
      columns = page.columns.map((c) => c.name);
      rows.push(...page.rows);
      toast.loading(`Exporting ${schema}.${table}… ${rows.length} rows`, { id });
      if (page.rows.length < page.limit) break;
      offset += page.limit;
    }
    const body = format === "csv" ? toCSV(columns, rows) : toJSONExport(columns, rows);
    download(`${schema}.${table}.${format}`, body, format === "csv" ? "text/csv" : "application/json");
    toast.success(`Exported ${rows.length} rows`, { id, description: `${schema}.${table}.${format}` });
  } catch (err) {
    toast.error("Export failed", { id, description: err instanceof Error ? err.message : String(err) });
  }
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
