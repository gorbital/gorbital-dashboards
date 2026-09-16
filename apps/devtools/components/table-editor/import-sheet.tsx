"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Checkbox, Field, Select, Textarea } from "@gorbital/dash/components/input";
import { Bar } from "@gorbital/dash/components/progress";
import { theme } from "@gorbital/dash/theme";
import { Sheet } from "@gorbital/dash/components/sheet";
import { toast } from "@gorbital/dash/components/toast";
import type { Column } from "@/lib/api/db";
import { importRows } from "@/lib/api/db";
import { guessMapping, importBatchSize, mapRows, runImport, type ColumnMapping, type ImportOutcome, type ImportProgress } from "@/lib/table-editor/csv";
import { ProblemNote, SectionLabel, TypeBadge } from "./common";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: string;
  table: string;
  columns: Column[];
  onImported: () => void;
};

type Parsed = { rows: string[][]; delimiter: string; errors: string[] };

function parse(text: string): Parsed {
  const out = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true, delimiter: "" });
  return { rows: out.data, delimiter: out.meta.delimiter, errors: out.errors.slice(0, 3).map((e) => `row ${e.row ?? "?"}: ${e.message}`) };
}

const delimiterName: Record<string, string> = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };

/** CSV in: a file or pasted text, a header row, a mapping onto the table's columns, then batches of 500 until one fails. */
export function ImportSheet({ open, onOpenChange, schema, table, columns, onImported }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string>();
  const [header, setHeader] = useState(true);
  const [emptyAsNull, setEmptyAsNull] = useState(true);
  const [nullWord, setNullWord] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [progress, setProgress] = useState<ImportProgress>();
  const [outcome, setOutcome] = useState<ImportOutcome>();
  const [running, setRunning] = useState(false);

  const parsed = useMemo(() => (text.trim() ? parse(text) : undefined), [text]);
  const headers = useMemo(() => (parsed ? (header ? parsed.rows[0] ?? [] : (parsed.rows[0] ?? []).map((_, i) => `column ${i + 1}`)) : []), [parsed, header]);
  const dataRows = useMemo(() => (parsed ? (header ? parsed.rows.slice(1) : parsed.rows) : []), [parsed, header]);
  const writable = columns.filter((c) => c.identity !== "a" && c.generated === "");

  useEffect(() => {
    setMapping(header ? guessMapping(headers, writable) : headers.map((_, i) => writable[i]?.name ?? null));
    setOutcome(undefined);
    setProgress(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(headers), header, columns]);

  useEffect(() => {
    if (!open) {
      setText("");
      setFileName(undefined);
      setOutcome(undefined);
      setProgress(undefined);
    }
  }, [open]);

  const mappedRows = useMemo(() => mapRows(dataRows, mapping, { emptyAsNull, nullWord }), [dataRows, mapping, emptyAsNull, nullWord]);
  const mappedCount = mapping.filter(Boolean).length;
  const missingRequired = writable.filter((c) => !c.is_nullable && c.default_expr === null && c.identity === "" && !mapping.includes(c.name));

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    file.text().then(setText).catch((err) => toast.error("Couldn't read the file", { description: String(err) }));
  };

  const run = async () => {
    setRunning(true);
    setOutcome(undefined);
    const out = await runImport(mappedRows, (rows) => importRows({ schema, table, rows }), setProgress, importBatchSize);
    setOutcome(out);
    setRunning(false);
    if (out.inserted > 0) onImported();
    if (!out.failed) toast.success(`Imported ${out.inserted} rows`, { description: `${schema}.${table}` });
  };

  const preview = dataRows.slice(0, 20);
  return (
    <Sheet open={open} onOpenChange={(v) => !running && onOpenChange(v)} title="Import CSV" meta={`${schema}.${table}`} width="lg" description="Rows go in batches of 500, each all or nothing; the import stops at the first batch the database refuses.">
      <div className="grid gap-5">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-elevated px-2.5 text-[11px] font-medium text-text hover:border-border-2">
              <Upload size={11} />
              Choose a file
              <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {fileName && <span className="font-mono text-[11px] text-dim">{fileName}</span>}
            <span className="ml-auto text-[11px] text-dim">or paste below</span>
          </div>
          <Textarea mono rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"id,name,status\n1,Website,active"} aria-label="CSV text" spellCheck={false} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-[11.5px] text-text">
              <Checkbox checked={header} onCheckedChange={(v) => setHeader(v === true)} aria-label="First row is a header" />
              first row is a header
            </label>
            <label className="flex items-center gap-1.5 text-[11.5px] text-text">
              <Checkbox checked={emptyAsNull} onCheckedChange={(v) => setEmptyAsNull(v === true)} aria-label="Empty is NULL" />
              empty → NULL
            </label>
            <label className="flex items-center gap-1.5 text-[11.5px] text-text">
              <Checkbox checked={nullWord} onCheckedChange={(v) => setNullWord(v === true)} aria-label="NULL word is NULL" />
              the word NULL → NULL
            </label>
            {parsed && (
              <span className="ml-auto font-mono text-[11px] text-dim">
                {dataRows.length} rows · {delimiterName[parsed.delimiter] ?? JSON.stringify(parsed.delimiter)} separated
              </span>
            )}
          </div>
          {parsed?.errors.map((e, i) => (
            <div key={i} className="font-mono text-[11px] text-danger">
              {e}
            </div>
          ))}
        </div>

        {parsed && headers.length > 0 && (
          <div className="grid gap-2">
            <SectionLabel>Columns</SectionLabel>
            <div className="grid gap-1.5">
              {headers.map((h, i) => (
                <div key={i} className="grid grid-cols-[1fr_20px_1fr] items-center gap-2">
                  <span className="truncate font-mono text-[11.5px] text-text" title={h}>
                    {h}
                  </span>
                  <span className="text-center text-dim">→</span>
                  <Select value={mapping[i] ?? ""} onChange={(e) => setMapping(mapping.map((m, j) => (j === i ? e.target.value || null : m)))} aria-label={`Map ${h}`}>
                    <option value="">skip</option>
                    {writable.map((c) => (
                      <option key={c.name} value={c.name} disabled={mapping.includes(c.name) && mapping[i] !== c.name}>
                        {c.name} · {c.data_type}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <div className="text-[11.5px] text-warn">
                Not mapped and required (NOT NULL without a default): {missingRequired.map((c) => c.name).join(", ")}. The database will refuse the rows unless they get a value.
              </div>
            )}
          </div>
        )}

        {preview.length > 0 && (
          <div className="grid gap-2">
            <SectionLabel>Preview · first {preview.length}</SectionLabel>
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-max min-w-full text-[11px]">
                <thead>
                  <tr className="bg-bg/60">
                    {headers.map((h, i) => (
                      <th key={i} className="border-b border-r border-hairline px-2 py-1 text-left font-mono font-medium text-dim">
                        {mapping[i] ? (
                          <span className="flex items-center gap-1 text-text">
                            {mapping[i]}
                            {columns.find((c) => c.name === mapping[i]) && <TypeBadge column={columns.find((c) => c.name === mapping[i])!} />}
                          </span>
                        ) : (
                          <span className="line-through">{h}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      {headers.map((_, j) => (
                        <td key={j} className={`max-w-[200px] truncate border-b border-r border-hairline px-2 py-1 font-mono ${mapping[j] ? "text-text" : "text-faint"}`}>
                          {r[j] === "" || r[j] === undefined ? emptyAsNull ? <span className="italic text-faint">NULL</span> : "" : r[j]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(progress || outcome) && (
          <div className="grid gap-2 rounded-lg border border-hairline bg-bg/40 p-3">
            {progress && (
              <>
                <div className="flex items-center gap-2 text-[11.5px] text-muted">
                  <span>
                    batch {progress.batch} of {progress.batches}
                  </span>
                  <span className="ml-auto font-mono tnum">
                    {progress.sent} / {progress.total}
                  </span>
                </div>
                <Bar value={progress.total ? (progress.sent / progress.total) * 100 : 0} color={outcome?.failed ? theme.danger : theme.primary} />
              </>
            )}
            {outcome && !outcome.failed && (
              <div className="flex items-center gap-2 text-[12px] text-ok">
                <Badge tone="ok">done</Badge> {outcome.inserted} rows inserted
              </div>
            )}
            {outcome?.failed && (
              <div className="grid gap-1.5">
                <div className="text-[12px] text-danger">
                  Batch {outcome.failed.batch} was refused and rolled back; {outcome.inserted} rows from the batches before it are in. Row numbers below count from the start of that batch.
                </div>
                <ProblemNote error={outcome.failed.error} />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button size="sm" kind="ghost" onClick={() => onOpenChange(false)} disabled={running}>
            {outcome ? "Close" : "Cancel"}
          </Button>
          <Button size="sm" kind="primary" icon={<Upload size={11} />} onClick={() => void run()} loading={running} disabled={!mappedRows.length || !mappedCount}>
            Import {mappedRows.length ? `${mappedRows.length} rows` : ""}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
