"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Circle, Database } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { MonacoEditor, type EditorHandle, type EditorMarker } from "@gorbital/dash/components/monaco";
import { PageHeader } from "@gorbital/dash/components/page";
import { Empty } from "@gorbital/dash/components/panel";
import { Tabs } from "@gorbital/dash/components/tabs";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError } from "@/lib/api/client";
import { useStatus } from "@/lib/api/queries";
import { useCheckSql, useClearHistory, useDeleteSnippet, useExplainSql, useRunSql, useSaveMigration, useSaveSnippet, useSnippets, useSqlHistory, useSqlTemplates, type HistoryEntry, type MigrationResponse, type PlanRoot, type RunRequest, type RunResult, type Snippet, type Template, type Warning } from "@/lib/api/sql";
import { loadDraft, saveDraft } from "@/lib/sql-editor/draft";
import { buildRunRequest, gateRun, scriptControlsTransaction, type RunSettings } from "@/lib/sql-editor/run";
import { suggestSnippetName } from "@/lib/sql-editor/snippets";
import { SchemaNotice } from "@/components/database/schema-notice";
import { ConnectionProblem } from "@/components/overview/connection";
import { MigrationDialog, SaveSnippetDialog, WarningsConfirm } from "./dialogs";
import { ExplainView } from "./explain-view";
import { Results } from "./results";
import { SnippetTree, type TreeSelection } from "./snippet-tree";
import { Toolbar } from "./toolbar";
import { useHydrated } from "./use-hydrated";
import { useSqlCatalog } from "./use-sql-catalog";

const defaultSettings: RunSettings = { mode: "rollback", rowLimit: 500, timeoutSeconds: 30 };
const PAGE = "/database/sql";



/** The three panes: snippets and history, the editor with its toolbar, and the results or the plan. */
export function SqlEditor() {
  const params = useSearchParams();
  const snippetParam = params.get("snippet");
  const status = useStatus();
  const hydrated = useHydrated();
  // Not read until hydration is over: the layout may have fetched it already, and the prerender had nothing.
  const statusData = hydrated ? status.data : undefined;
  const appName = statusData?.project.name ?? "";
  const hasDatabase = statusData ? statusData.project.database : undefined;
  const ready = hasDatabase === true;

  const snippets = useSnippets(ready);
  const templates = useSqlTemplates(ready);
  const history = useSqlHistory(ready);
  const run = useRunSql();
  const check = useCheckSql();
  const explain = useExplainSql();
  const saveSnippet = useSaveSnippet();
  const deleteSnippet = useDeleteSnippet();
  const clearHistory = useClearHistory();
  const migration = useSaveMigration();

  const [buffer, setBuffer] = useState("");
  const [selection, setSelection] = useState("");
  const [source, setSource] = useState<TreeSelection>({ kind: "scratch" });
  /** What the buffer is compared with for the unsaved indicator: the snippet's or template's text. */
  const [savedSql, setSavedSql] = useState<string>();
  const [settings, setSettings] = useState<RunSettings>(defaultSettings);
  const [result, setResult] = useState<RunResult>();
  const [requestError, setRequestError] = useState<Error>();
  const [lastRun, setLastRun] = useState<{ sql: string; lineOffset: number }>();
  const [plan, setPlan] = useState<{ plan: PlanRoot[]; analyzed: boolean }>();
  const [bottom, setBottom] = useState<"results" | "explain">("results");
  const [pending, setPending] = useState<{ req: RunRequest; warnings: Warning[]; lineOffset: number }>();
  const [saveOpen, setSaveOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Snippet>();
  const [deleteTarget, setDeleteTarget] = useState<Snippet>();
  const [clearOpen, setClearOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<MigrationResponse>();
  const [migrationError, setMigrationError] = useState<Error>();
  const [discard, setDiscard] = useState<{ what: string; go: () => void }>();
  const editor = useRef<EditorHandle>(null);
  const restored = useRef(false);
  /** The `?snippet=` value the page last acted on, so our own URL writes don't reopen the snippet. */
  const urlSnippet = useRef<string | null | undefined>(undefined);
  const catalog = useSqlCatalog(buffer, ready);
  const mod = useMemo(() => (hydrated && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"), [hydrated]);

  const dirty = savedSql !== undefined ? buffer !== savedSql : buffer.trim().length > 0;
  const title = source.kind === "snippet" || source.kind === "template" ? source.name : source.kind === "history" ? "from history" : "scratch";

  /* ----- Restore the draft, or the snippet the URL names ----- */

  useEffect(() => {
    if (restored.current || !statusData) return;
    restored.current = true;
    if (snippetParam) return;
    const draft = loadDraft(appName);
    if (!draft) return;
    setBuffer(draft.sql);
    if (draft.mode) setSettings((s) => ({ ...s, mode: draft.mode! }));
    if (draft.snippet) setSource({ kind: "snippet", name: draft.snippet });
  }, [statusData, appName, snippetParam]);

  /** `?snippet=<name>` in the address bar without a navigation: `useSearchParams` picks it up, and the document title stays ours. */
  const setUrl = useCallback((snippet: string | undefined) => {
    urlSnippet.current = snippet ?? null;
    window.history.replaceState(null, "", snippet ? `${PAGE}?snippet=${encodeURIComponent(snippet)}` : PAGE);
  }, []);

  // A snippet named in the URL (on load, or a link) opens; the draft wins when it came from that snippet.
  useEffect(() => {
    if (!snippets.data || snippetParam === urlSnippet.current) return;
    urlSnippet.current = snippetParam;
    if (!snippetParam) return;
    const s = snippets.data.snippets.find((x) => x.name === snippetParam);
    if (!s) {
      toast.error(`No snippet named ${snippetParam}`);
      return;
    }
    if (source.kind === "snippet" && source.name === s.name) return;
    const draft = loadDraft(appName);
    setBuffer(draft?.snippet === s.name ? draft.sql : s.sql);
    setSource({ kind: "snippet", name: s.name });
  }, [snippetParam, snippets.data, source, appName]);

  // The saved copy the buffer is compared with follows the server's.
  useEffect(() => {
    if (source.kind !== "snippet" || !snippets.data) return;
    const s = snippets.data.snippets.find((x) => x.name === source.name);
    if (s) setSavedSql(s.sql);
  }, [snippets.data, source]);

  useEffect(() => {
    if (!restored.current) return;
    const t = setTimeout(() => saveDraft(appName, { sql: buffer, snippet: source.kind === "snippet" ? source.name : undefined, mode: settings.mode }), 400);
    return () => clearTimeout(t);
  }, [buffer, source, settings.mode, appName]);

  // The tab title: the buffer's name with a mark when unsaved. Next writes the
  // page's metadata title after this boundary mounts, so ours is re-applied
  // whenever <head> changes; the next navigation sets its own again.
  useEffect(() => {
    const wanted = `${dirty ? "● " : ""}${title} · SQL Editor · Dev Portal`;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [dirty, title]);

  /* ----- Opening things ----- */

  const guard = useCallback(
    (what: string, go: () => void) => {
      if (dirty && buffer.trim()) setDiscard({ what, go });
      else go();
    },
    [dirty, buffer],
  );

  const load = useCallback(
    (sql: string, next: TreeSelection, saved: string | undefined) => {
      setBuffer(sql);
      setSavedSql(saved);
      setSource(next);
      setResult(undefined);
      setRequestError(undefined);
      setPlan(undefined);
      setUrl(next.kind === "snippet" ? next.name : undefined);
      setTimeout(() => editor.current?.focus(), 0);
    },
    [setUrl],
  );

  const openSnippet = (s: Snippet) => guard(s.name, () => load(s.sql, { kind: "snippet", name: s.name }, s.sql));
  const openTemplate = (t: Template) => guard(t.name, () => load(t.sql, { kind: "template", name: t.name }, t.sql));
  const openHistory = (h: HistoryEntry) =>
    guard("this run", () => {
      load(h.sql, { kind: "history" }, undefined);
      setSettings((s) => ({ ...s, mode: h.mode }));
    });
  const newQuery = () => guard("a new query", () => load("", { kind: "scratch" }, undefined));

  /* ----- Running ----- */

  const selectionOffset = useCallback(
    (sql: string) => {
      if (sql === buffer) return 0;
      const at = buffer.indexOf(sql);
      return at < 0 ? 0 : (buffer.slice(0, at).match(/\n/g)?.length ?? 0);
    },
    [buffer],
  );

  const execute = useCallback(
    (req: RunRequest, lineOffset: number) => {
      setRequestError(undefined);
      setBottom("results");
      setLastRun({ sql: buffer, lineOffset });
      run.mutate(req, {
        onSuccess: (r) => {
          setResult(r);
          if (r.error) toast.error("The script failed", { description: r.error.message });
          else if (r.committed) toast.success("Committed", { description: `${r.statements.length} statement${r.statements.length === 1 ? "" : "s"} in ${r.duration_ms.toFixed(1)} ms` });
        },
        onError: (err) => {
          setResult(undefined);
          setRequestError(err);
        },
      });
    },
    [buffer, run],
  );

  const doRun = useCallback(
    async (selectionOnly: boolean) => {
      if (!buffer.trim() || run.isPending) return;
      const req = buildRunRequest(buffer, selection, settings, selectionOnly);
      const lineOffset = selectionOffset(req.sql);
      if (settings.mode !== "commit" && scriptControlsTransaction(req.sql)) {
        setResult(undefined);
        setRequestError(new ApiError({ status: 422, code: "invalid_input", detail: "the script controls its own transaction (BEGIN, COMMIT, ROLLBACK, END); run it in commit mode" }));
        setBottom("results");
        return;
      }
      if (settings.mode === "commit") {
        try {
          const { warnings } = await check.mutateAsync(req.sql);
          if (gateRun("commit", warnings) === "confirm") {
            setPending({ req, warnings, lineOffset });
            return;
          }
        } catch (err) {
          toast.error("Couldn't check the script", { description: err instanceof Error ? err.message : String(err) });
          return;
        }
      }
      execute(req, lineOffset);
    },
    [buffer, selection, settings, run.isPending, check, execute, selectionOffset],
  );

  const doExplain = (analyze: boolean) => {
    const sql = selection.trim() ? selection : buffer;
    if (!sql.trim() || explain.isPending) return;
    setBottom("explain");
    explain.mutate(
      { sql, analyze },
      {
        onSuccess: (r) => setPlan({ plan: r.plan, analyzed: analyze }),
        onError: (err) => toast.error("Couldn't explain", { description: err instanceof Error ? err.message : String(err) }),
      },
    );
  };

  const doFormat = async () => {
    const { format } = await import("sql-formatter");
    const target = selection.trim() ? selection : buffer;
    try {
      const formatted = format(target, { language: "postgresql", keywordCase: "upper", tabWidth: 2, linesBetweenQueries: 2 });
      if (selection.trim()) editor.current?.replaceSelection(formatted);
      else editor.current?.setValue(formatted.endsWith("\n") ? formatted : `${formatted}\n`);
    } catch (err) {
      toast.error("Couldn't format", { description: err instanceof Error ? err.message.split("\n")[0] : String(err) });
    }
  };

  /* ----- Snippets ----- */

  const existing = useMemo(() => snippets.data?.snippets.map((s) => s.name) ?? [], [snippets.data]);
  const currentSnippet = source.kind === "snippet" ? snippets.data?.snippets.find((s) => s.name === source.name) : undefined;

  const doSave = (name: string, favorite: boolean) => {
    saveSnippet.mutate(
      { name, sql: buffer, favorite },
      {
        onSuccess: (s) => {
          setSaveOpen(false);
          setSavedSql(s.sql);
          setSource({ kind: "snippet", name: s.name });
          setUrl(s.name);
          toast.success(`Saved ${s.path}`);
        },
      },
    );
  };

  const doRename = (target: Snippet, name: string) => {
    if (name === target.name) return setRenameTarget(undefined);
    saveSnippet.mutate(
      { name, sql: target.sql, favorite: target.favorite },
      {
        onSuccess: (s) => {
          deleteSnippet.mutate(target.name, {
            onSuccess: () => {
              setRenameTarget(undefined);
              if (source.kind === "snippet" && source.name === target.name) {
                setSource({ kind: "snippet", name: s.name });
                setUrl(s.name);
              }
              toast.success(`Renamed to ${s.path}`);
            },
          });
        },
      },
    );
  };

  const toggleFavorite = (s: Snippet) => saveSnippet.mutate({ name: s.name, sql: s.sql, favorite: !s.favorite });

  const doDelete = (s: Snippet) => {
    deleteSnippet.mutate(s.name, {
      onSuccess: () => {
        setDeleteTarget(undefined);
        toast.success(`Deleted ${s.path}`);
        if (source.kind === "snippet" && source.name === s.name) {
          setSource({ kind: "scratch" });
          setSavedSql(undefined);
          setUrl(undefined);
        }
      },
    });
  };

  /* ----- Migration ----- */

  const openMigration = () => {
    setMigrationPreview(undefined);
    setMigrationError(undefined);
    setMigrationOpen(true);
  };
  const previewMigration = (name: string) => {
    setMigrationError(undefined);
    migration.mutate({ name, sql: buffer }, { onSuccess: setMigrationPreview, onError: setMigrationError });
  };
  const applyMigration = (name: string, allowDirty: boolean) => {
    setMigrationError(undefined);
    migration.mutate(
      { name, sql: buffer, apply: true, allow_dirty: allowDirty },
      {
        onSuccess: (r) => {
          setMigrationPreview(r);
          toast.success(`Wrote ${r.file.path}`, { description: r.applied ? "orb dev is applying it" : undefined });
          setMigrationOpen(false);
        },
        onError: setMigrationError,
      },
    );
  };

  /* ----- Markers ----- */

  const markers = useMemo<EditorMarker[]>(() => {
    if (!result?.error?.line || !lastRun || lastRun.sql !== buffer) return [];
    return [{ line: result.error.line + lastRun.lineOffset, message: `${result.error.message}${result.error.code ? ` (SQLSTATE ${result.error.code})` : ""}`, severity: "error" }];
  }, [result, lastRun, buffer]);

  const jumpToLine = (line: number) => editor.current?.revealLine(line);

  /* ----- Render ----- */

  const canRun = ready && buffer.trim().length > 0;
  const blockingError = status.error && !statusData ? status.error : snippets.error && !snippets.data && !(snippets.error instanceof ApiError && snippets.error.code === "no_database") ? snippets.error : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader product="devtools" title="SQL Editor" crumb="Database" description={statusData ? `${statusData.project.name} · every run is one transaction, rolled back unless you commit` : "one transaction per run, rolled back unless you commit"}>
        {result && (result.committed ? <Badge tone="warn">last run committed</Badge> : <Badge tone="ok">last run rolled back</Badge>)}
        {hasDatabase !== undefined && <Badge tone={hasDatabase ? "muted" : "danger"}>{hasDatabase ? "PostgreSQL" : "no database"}</Badge>}
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-5 pt-4">
        {blockingError ? (
          <ConnectionProblem error={blockingError} retrying={status.isFetching || snippets.isFetching} onRetry={() => void Promise.all([status.refetch(), snippets.refetch()])} />
        ) : hasDatabase === false ? (
          <Empty title="No database" hint="This app uses the Minimal preset; the SQL Editor needs PostgreSQL (the Full preset)." />
        ) : (
          <>
            <SchemaNotice className="mb-3" />
            <div className="grid min-h-0 flex-1 grid-cols-[236px_minmax(0,1fr)] gap-3">
              <aside className="panel min-h-0 overflow-hidden px-2 py-1">
                <SnippetTree
                  snippets={snippets.data?.snippets}
                  snippetsLoading={snippets.isPending}
                  snippetsError={snippets.error ? snippets.error.message : undefined}
                  templates={templates.data?.templates}
                  history={history.data?.history}
                  historyMax={history.data?.max}
                  selected={source}
                  onOpenSnippet={openSnippet}
                  onOpenTemplate={openTemplate}
                  onOpenHistory={openHistory}
                  onToggleFavorite={toggleFavorite}
                  onRename={setRenameTarget}
                  onDelete={setDeleteTarget}
                  onClearHistory={() => setClearOpen(true)}
                  onNew={newQuery}
                />
              </aside>
              <div className="flex min-h-0 flex-col gap-3">
                <section className="panel flex min-h-[220px] flex-[3] flex-col overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
                    <Database size={12} className="text-dim" />
                    <span className="font-mono text-[11.5px] text-text">{source.kind === "snippet" ? `${source.name}.sql` : title}</span>
                    {dirty && (
                      <span className="flex items-center gap-1 font-mono text-[10.5px] text-warn" title="Unsaved changes">
                        <Circle size={7} fill="currentColor" /> unsaved
                      </span>
                    )}
                    {currentSnippet && <span className="ml-1 truncate font-mono text-[10.5px] text-faint">{currentSnippet.path}</span>}
                    <span className="ml-auto font-mono text-[10.5px] text-faint tnum">
                      {buffer.split("\n").length} lines{selection ? ` · ${selection.length} selected` : ""}
                    </span>
                  </div>
                  <Toolbar
                    settings={settings}
                    onSettings={setSettings}
                    hasSelection={selection.trim().length > 0}
                    canRun={canRun}
                    running={run.isPending || check.isPending}
                    explaining={explain.isPending}
                    onRun={(sel) => void doRun(sel)}
                    onExplain={doExplain}
                    onFormat={() => void doFormat()}
                    onSave={() => setSaveOpen(true)}
                    onMigration={openMigration}
                    mod={mod}
                  />
                  <div className="min-h-0 flex-1">
                    <MonacoEditor
                      value={buffer}
                      onChange={setBuffer}
                      language="pgsql"
                      placeholder="SELECT * FROM … ;  — ⌘⏎ runs, ^Space completes tables and columns"
                      catalog={catalog}
                      markers={markers}
                      onRun={() => void doRun(true)}
                      onSave={() => canRun && setSaveOpen(true)}
                      onFormat={() => void doFormat()}
                      onSelectionChange={setSelection}
                      onReady={(h) => {
                        editor.current = h;
                      }}
                    />
                  </div>
                </section>
                <section className="panel flex min-h-[200px] flex-[2] flex-col overflow-hidden">
                  <Tabs
                    className="flex min-h-0 flex-1 flex-col [&>div:first-child]:px-3"
                    value={bottom}
                    onChange={setBottom}
                    tabs={[
                      { value: "results", label: "Results", badge: result ? result.statements.length : undefined },
                      { value: "explain", label: "Explain", badge: plan ? (plan.analyzed ? "analyze" : undefined) : undefined },
                    ]}
                  >
                    <div className="min-h-0 flex-1">
                      {bottom === "results" ? (
                        <Results result={result} requestError={requestError} running={run.isPending} lineOffset={lastRun?.lineOffset ?? 0} onJumpToLine={jumpToLine} />
                      ) : (
                        <ExplainView plan={plan?.plan} analyzed={plan?.analyzed} explaining={explain.isPending} />
                      )}
                    </div>
                  </Tabs>
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      <WarningsConfirm
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(undefined)}
        warnings={pending?.warnings ?? []}
        lineOffset={pending?.lineOffset ?? 0}
        loading={run.isPending}
        onConfirm={() => {
          if (!pending) return;
          const { req, lineOffset } = pending;
          setPending(undefined);
          execute(req, lineOffset);
        }}
      />
      <SaveSnippetDialog open={saveOpen} onOpenChange={setSaveOpen} initialName={currentSnippet?.name ?? suggestSnippetName(buffer)} initialFavorite={currentSnippet?.favorite ?? false} existing={existing} saving={saveSnippet.isPending} onSave={doSave} />
      <SaveSnippetDialog
        open={Boolean(renameTarget)}
        onOpenChange={(o) => !o && setRenameTarget(undefined)}
        rename={renameTarget}
        initialName={renameTarget?.name ?? ""}
        initialFavorite={renameTarget?.favorite ?? false}
        existing={existing}
        saving={saveSnippet.isPending || deleteSnippet.isPending}
        onSave={(name) => renameTarget && doRename(renameTarget, name)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(undefined)}
        title={`Delete ${deleteTarget?.name}?`}
        description={`Removes ${deleteTarget?.path} from the app. If it's committed, git still has it.`}
        confirmLabel="Delete"
        danger
        loading={deleteSnippet.isPending}
        onConfirm={() => deleteTarget && doDelete(deleteTarget)}
      />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear the history?"
        description="Forgets every run recorded on this machine (.orb/portal/sql-history.jsonl). Snippets stay."
        confirmLabel="Clear"
        danger
        loading={clearHistory.isPending}
        onConfirm={() => clearHistory.mutate(undefined, { onSettled: () => setClearOpen(false) })}
      />
      <ConfirmDialog
        open={Boolean(discard)}
        onOpenChange={(o) => !o && setDiscard(undefined)}
        title="Discard unsaved changes?"
        description={`The buffer has changes that aren't saved as a snippet. Opening ${discard?.what} replaces it (the draft in this browser is replaced too).`}
        confirmLabel="Discard and open"
        danger
        onConfirm={() => {
          discard?.go();
          setDiscard(undefined);
        }}
      />
      <MigrationDialog open={migrationOpen} onOpenChange={setMigrationOpen} sql={buffer} previewing={migration.isPending && !migration.variables?.apply} applying={migration.isPending && Boolean(migration.variables?.apply)} preview={migrationPreview} error={migrationError} onPreview={previewMigration} onApply={applyMigration} />
    </div>
  );
}
