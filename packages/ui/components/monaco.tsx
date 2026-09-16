"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "./spinner";

/**
 * The themed Monaco editor. Monaco ships with the app (no CDN): the inner
 * module imports the editor from the `monaco-editor` package and hands it to
 * `@monaco-editor/react`'s loader, so the embedded portal works offline. It
 * loads on the client only (`ssr: false`), with a skeleton in the static
 * export until the chunk arrives.
 */

export type SqlCatalogTable = { schema: string; name: string; kind?: string };
export type SqlCatalogColumn = { name: string; type: string; nullable?: boolean; primary?: boolean };

/** What the pgsql completion provider suggests: tables, and the columns of the tables it knows (keyed `schema.table`). */
export type SqlCatalog = {
  tables: SqlCatalogTable[];
  columns: Record<string, SqlCatalogColumn[]>;
};

export type EditorMarker = {
  line: number;
  column?: number;
  message: string;
  severity: "error" | "warning" | "info";
};

/** What a page can do to the editor after it mounted. */
export type EditorHandle = {
  focus(): void;
  /** Scrolls to the line, puts the cursor there. */
  revealLine(line: number, column?: number): void;
  getValue(): string;
  /** Replaces the whole buffer, keeping undo history. */
  setValue(text: string): void;
  getSelectedText(): string;
  /** Replaces the selection (or inserts at the cursor). */
  replaceSelection(text: string): void;
};

export type MonacoEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** Monaco language id; the SQL editor uses `pgsql`. */
  language?: string;
  readOnly?: boolean;
  placeholder?: string;
  /** Feeds the pgsql completion provider. */
  catalog?: SqlCatalog;
  /** Squiggles in the gutter and the overview ruler, e.g. the server's error line. */
  markers?: EditorMarker[];
  /** ⌘⏎ / Ctrl+⏎ */
  onRun?: () => void;
  /** ⌘S / Ctrl+S */
  onSave?: () => void;
  /** ⇧⌥F */
  onFormat?: () => void;
  onSelectionChange?: (selectedText: string) => void;
  onReady?: (handle: EditorHandle) => void;
  className?: string;
};

export function EditorSkeleton({ className = "" }: { className?: string }) {
  const widths = ["w-1/3", "w-2/3", "w-1/2", "w-1/4", "w-3/5"];
  return (
    <div className={`flex h-full min-h-[160px] flex-col gap-2.5 bg-bg px-4 py-3 ${className}`} aria-busy="true">
      {widths.map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-4 shrink-0" />
          <Skeleton className={`h-3 ${w}`} />
        </div>
      ))}
    </div>
  );
}

const Inner = dynamic(() => import("./monaco-inner").then((m) => m.MonacoInner), { ssr: false, loading: () => <EditorSkeleton /> });

export function MonacoEditor(props: MonacoEditorProps) {
  return <Inner {...props} />;
}
