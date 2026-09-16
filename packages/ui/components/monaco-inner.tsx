"use client";

/**
 * The client-only half of `monaco.tsx`. Imports Monaco from the package
 * (the editor API, the contributions the SQL editor needs, the pgsql
 * language) instead of letting `@monaco-editor/react` fetch it from a CDN,
 * gives it the theme built from the design tokens, and registers the pgsql
 * completion provider fed by the catalog the page passes in.
 */
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/features/codeEditor/register";
import "monaco-editor/features/bracketMatching/register";
import "monaco-editor/features/find/register";
import "monaco-editor/features/suggest/register";
import "monaco-editor/features/snippet/register";
import "monaco-editor/features/hover/register";
import "monaco-editor/features/comment/register";
import "monaco-editor/features/clipboard/register";
import "monaco-editor/features/linesOperations/register";
import "monaco-editor/features/lineSelection/register";
import "monaco-editor/features/multicursor/register";
import "monaco-editor/features/wordOperations/register";
import "monaco-editor/features/wordHighlighter/register";
import "monaco-editor/features/cursorUndo/register";
import "monaco-editor/features/indentation/register";
import "monaco-editor/features/gotoError/register";
import "monaco-editor/features/gotoLine/register";
import "monaco-editor/features/smartSelect/register";
import "monaco-editor/features/caretOperations/register";
import "monaco-editor/features/placeholderText/register";
import "monaco-editor/languages/definitions/pgsql/register";
import "monaco-editor/languages/definitions/go/register";
import { Editor, loader, type Monaco } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { EditorSkeleton, type EditorHandle, type MonacoEditorProps, type SqlCatalog } from "./monaco";
import { SQL_FUNCTIONS, SQL_KEYWORDS, mentionedTables, resolveQualifier, tableInsertText, tableKey } from "./monaco-sql";
import { MONACO_THEME, monacoDefaults, monacoTheme } from "./monaco-theme";

type Env = { MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker } };

if (typeof self !== "undefined") {
  // The editor worker (diffs, links, word lists) comes from the package too.
  (self as unknown as Env).MonacoEnvironment = {
    getWorker: () => new Worker(new URL("monaco-editor/editor/editor.worker.js", import.meta.url), { type: "module" }),
  };
  loader.config({ monaco: monaco as unknown as Monaco });
}

/* ---------- The completion provider ---------- */

let catalog: SqlCatalog = { tables: [], columns: {} };
let providerRegistered = false;

/** Columns of every table are offered when the catalog is this small; above it, only tables the script mentions. */
const SMALL_CATALOG = 12;

function registerProvider() {
  if (providerRegistered) return;
  providerRegistered = true;
  monaco.languages.registerCompletionItemProvider("pgsql", {
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const sql = model.getValue();
      const K = monaco.languages.CompletionItemKind;
      const suggestions: monaco.languages.CompletionItem[] = [];

      const qualifier = /("?[A-Za-z_][\w$]*"?)\.$/.exec(before);
      if (qualifier) {
        const target = resolveQualifier(sql, qualifier[1].replace(/"/g, ""), catalog);
        if (target?.kind === "table") {
          for (const c of catalog.columns[tableKey(target.table)] ?? []) {
            suggestions.push({ label: c.name, kind: K.Field, detail: c.type, insertText: c.name, range, sortText: `0${c.name}` });
          }
        } else if (target?.kind === "schema") {
          for (const t of catalog.tables.filter((t) => t.schema === target.schema)) {
            suggestions.push({ label: t.name, kind: K.Class, detail: t.kind ?? "table", insertText: t.name, range, sortText: `0${t.name}` });
          }
        }
        return { suggestions };
      }

      for (const t of catalog.tables) {
        suggestions.push({ label: t.schema === "public" ? t.name : `${t.schema}.${t.name}`, kind: K.Class, detail: `${t.kind ?? "table"} · ${t.schema}`, insertText: tableInsertText(t), range, sortText: `1${t.name}` });
      }
      const scope = catalog.tables.length <= SMALL_CATALOG ? catalog.tables : mentionedTables(sql, catalog.tables);
      const seen = new Set<string>();
      for (const t of scope) {
        for (const c of catalog.columns[tableKey(t)] ?? []) {
          const key = `${c.name}\0${t.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          suggestions.push({ label: c.name, kind: K.Field, detail: `${t.name} · ${c.type}`, insertText: c.name, range, sortText: `2${c.name}` });
        }
      }
      for (const k of SQL_KEYWORDS) suggestions.push({ label: k, kind: K.Keyword, insertText: k, range, sortText: `3${k}` });
      for (const f of SQL_FUNCTIONS) suggestions.push({ label: f, kind: K.Function, insertText: `${f}($0)`, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: `4${f}` });
      return { suggestions };
    },
  });
}

/* ---------- The component ---------- */

const severity = { error: monaco.MarkerSeverity.Error, warning: monaco.MarkerSeverity.Warning, info: monaco.MarkerSeverity.Info } as const;

export function MonacoInner({ value, onChange, language = "pgsql", readOnly, placeholder, catalog: catalogProp, markers, onRun, onSave, onFormat, onSelectionChange, onReady, className = "" }: MonacoEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // The latest callbacks, so the commands registered at mount stay current.
  const callbacks = useRef({ onRun, onSave, onFormat, onSelectionChange });
  callbacks.current = { onRun, onSave, onFormat, onSelectionChange };

  useEffect(() => {
    if (catalogProp) catalog = catalogProp;
  }, [catalogProp]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "sql",
      (markers ?? []).map((m) => {
        const line = Math.min(Math.max(1, m.line), model.getLineCount());
        const column = m.column ?? Math.max(1, model.getLineFirstNonWhitespaceColumn(line));
        return { severity: severity[m.severity], message: m.message, startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: model.getLineMaxColumn(line) };
      }),
    );
  }, [markers, value]);

  return (
    <div className={`h-full min-h-0 w-full overflow-hidden ${className}`}>
      <Editor
        value={value}
        language={language}
        theme={MONACO_THEME}
        loading={<EditorSkeleton />}
        options={{ ...monacoDefaults, readOnly, placeholder }}
        beforeMount={(m) => {
          m.editor.defineTheme(MONACO_THEME, monacoTheme);
          registerProvider();
        }}
        onMount={(editor) => {
          editorRef.current = editor;
          editor.addAction({ id: "sql.run", label: "Run", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => callbacks.current.onRun?.() });
          editor.addAction({ id: "sql.save", label: "Save snippet", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => callbacks.current.onSave?.() });
          editor.addAction({ id: "sql.format", label: "Format", keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF], run: () => callbacks.current.onFormat?.() });
          editor.onDidChangeCursorSelection((e) => {
            const model = editor.getModel();
            callbacks.current.onSelectionChange?.(model ? model.getValueInRange(e.selection) : "");
          });
          const handle: EditorHandle = {
            focus: () => editor.focus(),
            revealLine(line, column = 1) {
              editor.revealLineInCenter(line);
              editor.setPosition({ lineNumber: line, column });
              editor.focus();
            },
            getValue: () => editor.getValue(),
            setValue(text) {
              const model = editor.getModel();
              if (!model) return;
              editor.pushUndoStop();
              editor.executeEdits("sql", [{ range: model.getFullModelRange(), text, forceMoveMarkers: true }]);
              editor.pushUndoStop();
            },
            getSelectedText() {
              const sel = editor.getSelection();
              const model = editor.getModel();
              return sel && model ? model.getValueInRange(sel) : "";
            },
            replaceSelection(text) {
              const sel = editor.getSelection();
              if (!sel) return;
              editor.pushUndoStop();
              editor.executeEdits("sql", [{ range: sel, text, forceMoveMarkers: true }]);
              editor.pushUndoStop();
            },
          };
          onReady?.(handle);
        }}
        onChange={(v) => onChange(v ?? "")}
      />
    </div>
  );
}
