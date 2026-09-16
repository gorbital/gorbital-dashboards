# Dev Portal architecture

How `apps/devtools` is put together after Phase 1 (every screen connected):
the data layer, what the UI knows about authentication, mock mode, the
primitives it builds on, and how to add a page. The phase plan lives in the gorbital
repository at `docs/dev-portal-roadmap.md`; the backend it talks to is
`cli/internal/portal` (the portal API) and `modules/devconsole` (the app's
dev console, ADR-0065).

## The shape of the app

```
apps/devtools
├── app/                    App Router pages; server components that render one client component each
│   ├── layout.tsx          fonts, the Shell, the DevtoolsProvider around everything
│   ├── page.tsx            Overview
│   ├── database/sql/       SQL Editor, in a Suspense boundary for ?snippet=
│   └── routes|requests|logs|modules|audit|jobs|mail|settings|database
├── components/
│   ├── overview/           Overview (with the health panel), OutputConsole, ConnectionProblem
│   ├── routes/             the route list and the request builder
│   ├── requests/, logs/    the two live-tailed pages; logs/log-line.tsx is the expandable record both use
│   ├── modules/, audit/, jobs/, settings/, database/, mail/
│   ├── shared/             Gate, ProblemPanel, ReasonDialog, QueryParam, KeyValueEditor (below)
│   ├── table-editor/       the Table Editor (Phase 2, below)
│   ├── sql-editor/         SqlEditor, SnippetTree, Toolbar, Results, ExplainView, the dialogs
│   ├── schema/             the diagram (Phase 4)
│   ├── db-objects/         the Objects tabs and the plan dialog (Phase 4)
│   ├── migrations/         the Migrations page (Phase 4)
│   ├── app-chip.tsx        the shell's app chip, live
│   ├── portal-version.tsx  the shell's version, live
│   ├── search.tsx          the ⌘K palette: pages, the app's live routes, app actions
│   └── sidebar-nav.tsx     the nav; live badges for routes, captured mail and pending migrations
└── lib/
    ├── mock.ts             sample data for every page and for mock mode
    ├── time.ts             clock, when, ago and between, for tables
    ├── use-now.ts          a ticking clock for uptimes and "ago"
    ├── table-editor/       the Table Editor's pure logic: URL state, literals, CSV, plan builders
    ├── sql-editor/         the SQL Editor's pure logic: exports, plan tree, name rules, run requests, drafts
    └── api/                the data layer (below)
```

The build is a static export (`output: "export"`): every page prerenders as
HTML with skeletons, and the browser fills it in from the API. `orb dev`
serves `out/` at `http://127.0.0.1:3100` and resolves `/routes` to
`routes.html`, so links need no trailing slash.

## The data layer (`lib/api/`)

| File | What it is |
|---|---|
| `types.ts` | Hand-written TypeScript for everything the UI reads: the portal API (`Status`, `AppStatus`, `OutputLine`, `PortalEvent`, generators), the dev console (`DevApp`, `DevRouteList`, `DevRequestList`, `DevLogList`, `DevConfigList`, `DevMigrations`, `DevJobRunList`, `DevMail`, `DevStreamEvent`) and the ops API (`OpsSetting`, `OpsSettingChange`, `JobDefinition`, `JobRun`, `JobsOverview`, `Queue`, `AuditEvent`, `AuditStats`, `SystemInfo`, `MailStatus`, `Suppression`, `CurrentRelease` and the request bodies), matching the Go types, `modules/devconsole/openapi.json` and `examples/full-single/api/openapi.json` field for field. Errors are `Problem` (RFC 9457). |
| `client.ts` | `apiFetch<T>(path, init)`: same-origin fetch with the cookie, the `X-Orb-Portal: 1` header on anything but GET/HEAD, JSON in and out. A problem response becomes `ApiError { status, code, detail, title, unauthorized }`; a request that never gets an answer becomes `NotConnectedError`. `subscribeSSE(path, onMessage, onStatus)`: any `text/event-stream` on the origin, with reconnects (below); `subscribeEvents` wraps it for the portal's own stream, `parseDevStreamEvent` reads the console's. |
| `sse.ts` | `createSSEParser`: an incremental `text/event-stream` parser (any chunking, multi-line `data:`, comments, CRLF). `readSSE`: drives it from a `ReadableStream` until the stream ends or a signal aborts. |
| `live.ts` | `useLiveTail<T>({ path, event, enabled, max })`: follows a console stream and keeps the newest items; `mergeTail` folds the list endpoint's backlog in behind them without duplicates. |
| `errors.ts` | `describeError(err, { scope, console })`: what an error means by where it came from (a 401 from `/ops` while the app serves the console is an orb or app that predates the dev operator; a 404 from `/_dev` is an app without the console; 503 `unavailable` from `/_dev/mail` is Mailpit down…). `errorMessage` for toasts, `needsReason` and `isVersionConflict` for the `*_reason_required` and `*_version_conflict` families. |
| `request-builder.ts` | The Routes page's builder as pure functions: `pathParams`, `fillPath`, `buildQuery`, `buildRequest` (the URL through `/_portal/app` and the `RequestInit`, with the mutation header, a pasted bearer token, the JSON body) and `sendRequest`, which measures the answer and keeps the headers worth showing. |
| `setting-value.ts` | Typed input for runtime settings: `formatSettingValue` and `parseSettingValue` per kind (`bool`, `int`, `float`, `string`, `enum`, `duration`, `string_list`) against the constraints (`min`, `max`, `one_of`, `max_len`, `max_items`, `format`), Go durations (`durationMs`, `shortDuration`), `describeConstraints` for the hint line. |
| `store.ts` | The console store: the latest `AppStatus` from the stream, the output tail (capped at 2,000 lines like orb's own buffer), the dropped count and the connection state, read with `useConsole()` (`useSyncExternalStore`). `mergeLines` folds `/output` into what the stream delivered without duplicates and in time order. |
| `queries.ts` | React Query hooks. Portal: `useStatus` (every 5 s), `useCapabilities` (what the status says the app can answer: `running`, `console`, `ops`, `database`), `useOutput`, `useReadiness`, `useAppAction`, `useMigrate`. Console: `useDevApp`, `useDevRoutes`, `useDevRequests`, `useDevLogs`, `useDevMigrations`, `useDevMail`. Ops: `useSettings`, `useSettingHistory`, `useSetSetting`, `useResetSetting`, `useJobDefinitions`, `useScheduledJobs`, `useJobsOverview`, `useJobRuns` (infinite, by cursor), `useRunJob`, `useUpdateJobDefinition`, `useResetJobDefinition`, `useRunAction("retry" \| "cancel")`, `useQueues`, `useQueueAction("pause" \| "resume")`, `useAudit` (infinite), `useAuditStats`, `useSystem`, `useOpsMail`, `useSendTestEmail`, `useSuppressions`, `useRemoveSuppression`, `useCurrentReleases`. Mutations toast on both outcomes and invalidate what they change; the settings and job definition ones leave `*_reason_required` and `*_version_conflict` to the form. Nothing is retried that won't change on its own (not connected, 4xx). |
| `provider.tsx` | `DevtoolsProvider`: the `QueryClient`, the `Toaster`, the `TooltipProvider`, and the one events subscription for the whole app. |
| `sql.ts` | The SQL Editor's types (`RunRequest`, `RunResult`, `StatementResult`, `RunError`, `Warning`, `Template`, `Snippet`, `HistoryEntry`, `MigrationResponse`, the EXPLAIN `PlanNode`) and hooks: `useSqlTemplates`, `useSnippets`, `useSqlHistory`, `useSqlCatalogTables`/`useSqlCatalogColumns` (for completion), `useRunSql`, `useExplainSql`, `useCheckSql`, `useSaveSnippet`, `useDeleteSnippet`, `useClearHistory`, `useSaveMigration`. |
| `mode.ts` | `dataMode()`: `"live"` or `"mock"` (below). |
| `mock/index.ts` | The in-memory `orb dev` for mock mode. |
| `db.ts` | The Table Editor's shapes (`Schema`, `Table`, `Column`, `TableDetail`, `RowPage`, `Change`, `ColumnSpec`, `DDLResponse`…, matching `cli/internal/pgmeta`) and hooks: `useSchemas`, `useTables`, `useTableDetail`, `useTypes`, `useRows`, `useInsertRow`, `useUpdateRow`, `useDeleteRows`, `importRows`, `planDDL`, `applyDDL`, `waitForMigrations`. |
| `mock/db.ts` | The in-memory PostgreSQL behind `/_portal/api/db/*` in mock mode (below). |
| `mock/sql.ts` | The in-memory SQL runner behind `/_portal/api/db/sql/*` in mock mode. |

### Live state: how a change reaches the page

1. `DevtoolsProvider` calls `subscribeEvents` once. It is `subscribeSSE`
   on `/_portal/api/events`: a `fetch` (not `EventSource`: the cookie's
   protections and reconnect policy stay under our control) whose body
   `readSSE` reads.
2. The first event is a bare `AppStatus`; `parseEvent` wraps it as a
   `state` event. After that come `output`, `state` and `dropped` events,
   keep-alive comments every 15 s, and a final `end` after 30 minutes or when
   `orb dev` shuts down.
3. Every event goes to the console store. A `state` event also patches the
   `status` query's `app` in place and, when the state actually changes,
   invalidates `status`, `readiness` and the `dev/*` queries (the console
   restarts empty after every app restart).
4. When the stream opens, the provider fetches `/_portal/api/output?limit=200`
   and merges it into the store: subscribe first, then backfill, so nothing
   falls between. "Load more" on the console does the same with a bigger
   limit.
5. After `end` or any failure the subscription reconnects with a backoff
   from 1 s to 10 s, doubling; a successful connection resets it. `stop()`
   (the provider's cleanup) aborts the request, and a response that arrives
   after that is cancelled unread.

`useStatus` still polls every 5 s so a page that loads before the stream
opens, or a stream that quietly dies, never shows stale state for long.

### The console's streams, through the proxy

The Requests and Logs pages follow `/_portal/app/_dev/requests/stream` and
`/_portal/app/_dev/logs/stream` with the same `subscribeSSE`: orb dev
proxies the stream unbuffered (`FlushInterval: -1`) and adds the console
token, so the UI reads it like any other same-origin stream. `useLiveTail`
keeps each `request` or `log` event at the front of its list and counts
`dropped`; the page fetches the list endpoint too and `mergeTail` puts the
backlog behind what the stream delivered, keyed so an item seen both ways
shows once. `end` (30 minutes, or the app restarting) reconnects with the
same backoff as the portal's stream; the list refetch on the next `running`
state fills the gap.

### Authentication, from the UI's side

The UI never sees a token. `orb dev` prints a link
(`/_portal/auth?t=<token>`) that sets an HttpOnly, `SameSite=Strict`
`orb_portal` cookie; the browser sends it with every same-origin request
(`credentials: "same-origin"`), and every request that isn't GET or HEAD
also carries `X-Orb-Portal: 1`, a header a cross-origin page can't send
without a preflight the portal never answers. Two outcomes matter to the
UI:

| What the client sees | What it means | What the page shows |
|---|---|---|
| `NotConnectedError` (no response at all) | `orb dev` isn't running, or the dev server can't reach it | "orb dev isn't running": the command to run, the link to open, a Retry button |
| `ApiError` with status 401 | no cookie, or one from an earlier `orb dev` run | "Not signed in": open the link `orb dev` printed, a Retry button |

Any other problem (403 from a wrong `Host`, 429 too many streams, 502 when
the app doesn't answer) shows its `code` and `detail`.

The dev console (`/_dev/*`) has its own bearer token; the portal adds it
when proxying `/_portal/app/_dev/*`, so the UI calls the proxy like any
other endpoint. `app.console` in the status says whether the app serves the
console at all; hooks that need it take an `enabled` flag.

### The ops API, as the development operator

The app's admin API (`/ops/*`, Full preset; `docs/guides/ops-api.md` in the
gorbital repository) normally wants a signed-in session with a platform
role. In development orb dev sends its console token to `/_portal/app/ops/*`
as well, and the app treats that bearer as a **development operator** with
every `/ops` permission (ADR-0066). The UI therefore calls `/ops` plainly:
no token, no session of its own. What comes back is attributed to the
operator (`actor_kind: system`, label `dev console (orb dev)` in the audit
log and in history).

Two answers need explaining rather than a generic error, and
`describeError` does it:

| What the client sees | What it means | What the page shows |
|---|---|---|
| 401 `unauthenticated` from `/ops` while `app.console` is true | the running orb or app predates the operator | "The app doesn't accept the dev operator yet": rebuild with the current orb and restart |
| 404 from `/_dev/*` | the app has no console (created before v1.1, or `DEV_CONSOLE_TOKEN` unset) | "This app has no dev console" |

`useCapabilities` reads the status once for every page: `running`,
`console` (running and `app.console`), `ops` (running and the project lists
the `ops` feature or is the Full preset) and `database`. The `Gate`
component renders a page's body only when what it needs is there, and the
right explanation otherwise (not connected, not signed in, app stopped, no
console, Minimal preset); `ProblemPanel` shows a request's error with
`describeError`'s title and hint.

Changes on `/ops` carry the `version` the page last read and, where the app
insists, a `reason`: settings marked `reason_required`, disabling or
rescheduling a job, changing its timeout, attempts or queue (and undoing
those), pausing a queue, removing a suppression. The forms ask up front
where the answer says so and otherwise on the 422 `*_reason_required`; a
409 `*_version_conflict` refetches and tells the user to look again.
`POST …/run` answers 429 `job_run_limited` within a minute of the last run,
`POST /ops/mail/test` 429 `rate_limited` after five an hour; both become
warnings, not errors. `POST /_portal/api/app/migrate` asks orb dev to run
the app's migrator without a restart (202; 409 for an app without a
database).

### Development proxy

`next dev` runs on 3101 and rewrites `/_portal/:path*` to
`${ORB_PORTAL_URL ?? "http://127.0.0.1:3100"}/_portal/:path*`. The rewrite
exists only in the development phase (`PHASE_DEVELOPMENT_SERVER` in
`next.config.ts`), because a static export can't carry rewrites. Verified
end to end: the rewrite sends `Host: 127.0.0.1:3100` (the portal's loopback
check passes), forwards the cookie and the mutation header, returns the
`Set-Cookie` from `/_portal/auth`, and streams SSE without buffering. Sign
in on the dev server's origin (`http://localhost:3101/_portal/auth?t=…`), since a
cookie set on `127.0.0.1` doesn't reach `localhost`.

## Mock mode

`dataMode()` returns `"mock"` when `localStorage.devtoolsData` is `"mock"`,
otherwise when the build set `NEXT_PUBLIC_DEVTOOLS_DATA=mock`, otherwise
`"live"`. `transportFetch` then routes every request to `mockFetch` in
`lib/api/mock/index.ts` instead of the browser's `fetch`.

The mock is an `orb dev` in memory: it answers `/_portal/api/status`,
`/output`, `/events`, the app actions (with the same 409 refusals and the
same `X-Orb-Portal` check), `app/migrate` (pending goes to 0 after 1.5 s,
with orb lines in the console), the generator `plan`/`apply` endpoints,
`/_portal/app/readyz`, every `/_dev/*` endpoint and its two streams, and
the `/ops/*` endpoints the pages use, all from `lib/mock.ts`
(`portalStatus`, `outputLines`, `devApp`, `devRoutes`, `devConfig`,
`devRequests`, `devLogs`, `devMigrations`, `devJobRuns`, `devMail`,
`opsSettings`, `opsSettingHistory`, `opsJobDefinitions`, `opsJobRuns`,
`opsQueues`, `opsAuditEvents`, `opsSystem`, `opsMail`, `opsSuppressions`,
`opsReleasesCurrent`, `liveRequests`, `liveLogs`). The ops part keeps
state the way the app does: versions bump, reasons are required where the
app requires them (422), a stale version is a 409, Run now is refused for a
minute (429), a test email lands in the mock inbox, the audit log filters
and pages by cursor. Its stream endpoints return real `ReadableStream`s in
SSE format (a state event then an output line every 4 s; a request every
3.5 s and a log record every 2.8 s), so the parser, the stores and the
reconnect logic run the same code in both modes. Restart takes 1.8 s and
goes through `building`; Stop and Start change the state at once. Responses
are `Response` objects with the right content types, so `apiFetch`'s error
handling is exercised too.

The public demo builds with `NEXT_PUBLIC_DEVTOOLS_DATA=mock`
(`apps/devtools/vercel.json`).

## The Table Editor (`/database/tables`)

Supabase Studio's table editor, on gorbital's theme: every relation of the
app's database in a sidebar, one table's rows in an editable grid, schema
changes as migrations. The backend is `cli/internal/portal/db.go` over
`cli/internal/pgmeta` (ADR-0067); the endpoints are listed in
`docs/guides/dev-portal.md` ("db/" rows).

```
app/database/tables/page.tsx      <Suspense> around the client component (the selection is in the query string)
components/table-editor/
├── table-editor.tsx              the page: URL state, the queries, and every sheet and dialog wired together
├── sidebar.tsx                   schema dropdown (system schemas behind a switch), search, relations with kind icon and ownership badge
├── grid.tsx                      the grid: sticky header (type badge, pk/fk/unique icons, column menu), selection, inline editing, arrows/Enter/Esc
├── value-input.tsx               one typed control per column kind: bool, enum, json (validated), date/time, arrays, NULL and "default" as states
├── filter-bar.tsx                filter and sort chips with their popovers
├── footer.tsx                    Data/Definition toggle, pages, page size, "N rows" (~ when estimated)
├── definition.tsx                columns, constraints, indexes, triggers, and a reconstructed CREATE TABLE
├── row-sheet.tsx                 insert, duplicate, edit a whole row
├── column-form.tsx, type-picker.tsx, fk-picker.tsx   the column fields shared by the sheets
├── table-sheet.tsx               new table: columns, unique constraints, foreign keys → create_table (+ comment)
├── column-sheet.tsx              add a column, or edit one → alter_column (+ add_check, + rename_column)
├── ddl-dialog.tsx                one-off changes from a menu: drop column, add foreign key, unique, primary key, rename/drop table
├── plan-preview.tsx              usePlanFlow / PlanBody / PlanActions: the Preview → Apply flow every schema change goes through
├── import-sheet.tsx              CSV import (papaparse): header row, mapping, empty→NULL, batches of 500, stops at the first refusal
├── export.ts                     CSV/JSON export of the current filters, paging rows/query by 1000
└── common.tsx, popover.tsx       icons, badges, banners, ProblemNote; a Radix popover dressed like the menus
lib/table-editor/
├── url.ts                        filters, sorts, page, limit and view ↔ the query string (`filter=col:op:value`, `sort=col:desc`)
├── literals.ts                   cell literal ↔ editor value: booleans, arrays, JSON, timestamps
├── csv.ts                        mapping, batching, the import runner, CSV/JSON writers
├── plan.ts                       ColumnForm/TableForm → ColumnSpec and Change (only what changed for an edit)
└── definition.ts                 CREATE TABLE from a TableDetail
```

**Data flow.** The selection lives in the URL (`?schema=&table=&filter=…&sort=…&page=&limit=&view=`), so `useSearchParams` under `Suspense` is the only state the page owns; the sidebar and the header menus navigate, everything else derives from `useTableDetail` (the catalog: ownership, kind, primary key, constraints) and `useRows` (`POST rows/query`, one page at a time, the previous page kept on screen while the next loads). A cell edit calls `rows/update` with the row's primary key and one value, then writes the returned row into the page's query data; inserts, deletes and imports invalidate the table's queries. Tables without a primary key, views, foreign tables and `system` tables are read-only (a banner says why); `managed` tables show the framework's warning and need the "allow edits" checkbox before a row can change.

**Literal as text.** Every cell is the PostgreSQL text literal, in and out (`t`/`f`, `{a,"b c"}`, `2026-09-16 18:00:56.718279+00`, `{"a": 1}`, `\x00ff`), or `null`. The UI never parses a value it doesn't have to: `literals.ts` turns a literal into what a typed editor holds (a boolean, a list, a datetime-local string in UTC, pretty JSON) and back, and anything else stays text for PostgreSQL to parse. Invalid input comes back as a 422 `invalid_input` with the server's own message, shown where the edit happened.

**Migration-plan flow.** A schema change never runs directly. The form builds a `Change` (`lib/table-editor/plan.ts`); Preview posts it to `ddl/plan` and shows the Up and Down SQL, the notes, an "irreversible" badge and the migration file's path; Apply posts the same body to `ddl/apply` (with `allow_dirty` when the checkbox is on), which writes `db/migrations/<version>_<name>.sql` and queues `migrate`. The client then polls `/_portal/app/_dev/migrations` until `current` moved past what it read before the apply and `pending` is 0 (up to 15 s), drops every `db` query, and the sheet closes or selects the new table. Editing a column may need several migrations (alter, add_check, rename); they are planned and applied in order, and a failure keeps what was applied. Managed and system tables are refused by the portal (403 `system_table`); a dirty git tree is refused unless allowed, and the error is shown with a hint to tick the checkbox.

**Mock mode.** `lib/api/mock/db.ts` is a small PostgreSQL in memory: schemas `public` and `auth`, tables `projects` (an enum, a `text[]`, a `jsonb`, a numeric), `tasks` (an identity key, a boolean, a date, a foreign key to projects), `auth_users` and `audit_events` (managed), `auth.sessions`, `notes` (no primary key), `river_job` (system), the view `active_projects`, and `pg_catalog.pg_class` behind the system switch. It answers every `db/*` endpoint: filters with all ten operators, sorts with nulls first/last, pages and counts, inserts with defaults and identity values, updates, deletes, all-or-nothing imports, and `ddl/plan` with SQL rendered like pgmeta's; `ddl/apply` refuses without `allow_dirty` (the sample repository has an uncommitted migration), then changes the catalog in memory so the demo shows the new column or table.

## Primitives (`packages/ui/components`)

Everything is styled with the theme's tokens only: 12–13 px text, mono
labels, `border-border`/`bg-elevated`/`text-dim`, `rounded-lg`, lime
`primary` as the one accent.

| File | Exports | Notes |
|---|---|---|
| `button.tsx` | `Button` | spreads `ButtonHTMLAttributes`; `kind`, `size`, `icon`, `loading` (spinner, disabled) |
| `pill.tsx` | `Pill`, `Segmented` | `Pill` takes `onClick`; `Segmented` takes `onChange` |
| `table.tsx`, `table-sort.ts` | `Table`, `sortRows`, `useTableSort` | columns with `sortValue` sort when `sort`/`onSort` are given (`useTableSort` holds the state); `onRowClick`, `loading` (skeleton rows), `empty` |
| `tile.tsx` | `Tile`, `TileGrid` | `loading` shimmers the value |
| `input.tsx` | `Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `Label`, `Field` | `Field` stacks label, control and a hint or an error; `inline` for switches |
| `dialog.tsx` | `Dialog`, `ConfirmDialog` | `ConfirmDialog` has `danger` and `confirmText` (typed confirmation) |
| `sheet.tsx` | `Sheet` | right-side panel, 420/480/560 px |
| `dropdown.tsx` | `Dropdown` | items with icon, shortcut, `danger`, `checked`, separators |
| `tabs.tsx` | `Tabs`, `TabPanel` | underlined tabs with badges and right-side actions |
| `tooltip.tsx` | `Tooltip`, `TooltipProvider` | mount the provider once (the devtools provider does) |
| `toast.tsx` | `Toaster`, `toast` | sonner, themed; `toast.success/error/…` from anywhere |
| `command.tsx` | `CommandPalette`, `CommandItem` | cmdk on ⌘K; items navigate (`href`) or run (`onSelect`); renders the search box that opens it |
| `spinner.tsx` | `Spinner`, `Skeleton`, `SkeletonLines` | |
| (devtools) `table-editor/popover.tsx` | `Popover` | Radix popover with the menu's look; lives in the app until another page needs it |
| `shell.tsx` | `Shell`, `AppChip`, `SearchButton` | `appChip` and `search` props take client components; `version` is a `ReactNode` |
| `nav.tsx` | `Nav` | `tone: "live"` renders a pulsing dot |
| `monaco.tsx`, `monaco-inner.tsx`, `monaco-theme.ts`, `monaco-sql.ts` | `MonacoEditor`, `EditorSkeleton`, `EditorHandle`, `SqlCatalog`, `EditorMarker` | the themed Monaco editor, client-only (below) |

Files that hold state or handlers start with `"use client"`; the hookless
ones (`Table`, `Pill`, `Segmented`, `Input`…) work in server components too
and only attach handlers when a client caller passes them.

## Adding a page that reads the portal

1. **Types.** If the endpoint isn't in `lib/api/types.ts`, add it there,
   matching the Go type or the OpenAPI schema exactly (optional fields for
   `omitempty` and for anything not in `required`).
2. **Mock.** Add the sample data to `lib/mock.ts` (derive it from what's
   there when you can) and answer the path in `lib/api/mock/index.ts`.
3. **Hook.** Add a `useX` to `lib/api/queries.ts`: a `queryKey` under `keys`,
   `apiFetch<T>` in `queryFn`, `enabled` when it depends on the app running
   or serving the console, the shared `retry`. Mutations use `useMutation`
   with toasts on both outcomes and invalidate what they change.
4. **Page.** `app/<name>/page.tsx` stays a server component that renders a
   client component from `components/<name>/`. Wrap the body in `Gate`
   with what it needs (`console`, `ops` or `database`), render skeletons
   (`Tile loading`, `Table loading`, `SkeletonLines`) while `isPending`,
   `Empty` for no data, and `ProblemPanel` (with the request's `scope`)
   when `error` is set and there's no data, so the prerender and the first
   client render agree. Entity selection lives in a query parameter
   (`?id=`, `?key=`, `?route=`) read by `QueryParam` inside a `Suspense`
   and written with `setQueryParam`; never a dynamic segment, which the
   static export can't carry. Changes that need a reason go through
   `ReasonDialog`.
5. **Nav and palette.** Add the entry to `components/sidebar-nav.tsx` and the
   page to `components/search.tsx`.
6. **Tests.** Pure logic (parsers, merges, transports) gets a `*.test.ts` next
   to it; `pnpm --filter devtools test` runs vitest in the node environment.

## The SQL Editor (`/database/sql`)

Phase 3 (ADR-0068): scripts against the app's database, one transaction
per run. The backend is `cli/internal/portal/sql.go` (the endpoints under
`/_portal/api/db/sql/`), `cli/internal/pgmeta/sql.go` (running, EXPLAIN, the
warnings, the templates) and `cli/internal/portal/sqlstore.go` (snippets and
history).

### Files

| File | What it is |
|---|---|
| `app/database/sql/page.tsx` | The server page: `<Suspense>` around `SqlEditor`, because `useSearchParams` (`?snippet=<name>` opens a saved query) needs a boundary in a static export. |
| `components/sql-editor/sql-editor.tsx` | The page's state: the buffer and the selection, what the buffer came from (snippet, template, history, scratch) and whether it's dirty, the run settings, the last result and plan, and every dialog. Three panes: the tree, the editor with its toolbar, the results/explain tabs. |
| `components/sql-editor/snippet-tree.tsx` | Favorites, Project (`db/queries`), Templates, History (collapsible, newest first, click to load, clear). Star, rename and delete per snippet. |
| `components/sql-editor/toolbar.tsx` | Run / Run selection, the mode (rollback, commit, read-only, each with a tooltip), row limit, timeout, Explain / Analyze, Format, Save, Save as migration, and the shortcut list. |
| `components/sql-editor/results.tsx` | A tab per statement (command tag, rows affected, "truncated" note), the grid (text cells, `NULL` in italic faint, the first 1,000 rows rendered), copy and download as CSV / JSON / Markdown, the warnings banner, and the error panel (message, SQLSTATE, detail, hint, "line N" jump). |
| `components/sql-editor/explain-view.tsx` | The plan as a collapsible tree (node type, relation, index, costs, plan rows; actual rows/time/loops when analyzed; index/filter/hash conditions), the three costliest nodes lit up, raw JSON toggle. |
| `components/sql-editor/dialogs.tsx` | Save / rename (name checked as you type), the warnings confirmation before a commit, Save as migration (preview → Apply with allow-dirty). |
| `components/sql-editor/use-sql-catalog.ts` | What the completion knows: every table from `db/tables`, and the columns of the tables the buffer mentions (or of all of them when there are ≤ 12), each `db/tables/{schema}/{table}` fetched once. |
| `components/sql-editor/use-hydrated.ts` | The page reads the layout's status query only after hydration: the Suspense boundary hydrates after the layout, which may already have the data the prerender didn't. |
| `lib/sql-editor/export.ts` | Result set → CSV (RFC 4180, NULL empty), JSON (objects, NULL as null), Markdown. |
| `lib/sql-editor/plan.ts` | `flattenPlan` (depth, parent, own cost = total minus children's, own time × loops when analyzed), `costliest`, `costShare`, `nodeTitle`, `nodeConditions`. |
| `lib/sql-editor/run.ts` | `buildRunRequest` (selection vs whole buffer, mode, limit, timeout), `gateRun` (warnings block a commit, are a banner otherwise), `scriptControlsTransaction` (BEGIN/COMMIT/ROLLBACK/END need commit mode), the mode descriptions, `statementLabel`. |
| `lib/sql-editor/snippets.ts` | `snippetNameError` (the portal's `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`), `suggestSnippetName`, `migrationSlug`. |
| `lib/sql-editor/draft.ts` | The buffer in `localStorage` under `devtools.sql.draft.<app>`, every access in try/catch. |

### Monaco: self-hosted, themed

`packages/ui/components/monaco.tsx` exports `MonacoEditor`, a
`next/dynamic` import with `ssr: false` of `monaco-inner.tsx` and an
`EditorSkeleton` until the chunk arrives, so the static export prerenders
the page with a skeleton and never runs Monaco on the server.

`monaco-inner.tsx` imports the editor **from the npm package**, not a CDN:
`monaco-editor/editor/editor.api` plus the contributions the editor needs
(`monaco-editor/features/{bracketMatching,find,suggest,hover,comment,…}/register`)
and the language (`monaco-editor/languages/definitions/pgsql/register`), then
`loader.config({ monaco })` hands that instance to `@monaco-editor/react`, whose
loader otherwise fetches `monaco-editor@x/min/vs` from jsdelivr (the URL is
still in the bundle as the loader's default; it's never requested). The
editor worker is `new Worker(new URL("monaco-editor/editor/editor.worker.js",
import.meta.url), { type: "module" })`, which Turbopack emits as its own
chunk, so the embedded portal works offline. Importing `editor.api` instead of
`monaco-editor` keeps the other 80 languages and the TypeScript/CSS/JSON
workers out of the bundle.

The theme (`monaco-theme.ts`) is built from `theme.ts`: background `bg`,
keywords in the lime `primary` (bold), strings `warn`, numbers `info`,
functions `violet`, comments `dim` italic, the cursor lime, selections and
bracket matches lime washes, the suggest and hover widgets on `elevated`
with `border`. It is the one place besides `theme.ts` that spells a colour,
because Monaco wants hex strings. `monacoDefaults` sets 12.5 px Geist Mono
(`var(--font-geist-mono)`), no minimap, line numbers, bracket matching and
pair colours, `automaticLayout`, no word-based suggestions.

### Completion

`monaco-inner.tsx` registers one `pgsql` completion provider (once per page
load) that reads a module-level catalog the `MonacoEditor` prop `catalog`
updates. It offers: after `alias.` or `table.`, that table's columns
(`monaco-sql.ts` resolves the alias from `FROM x AS a`, `JOIN`, `UPDATE`,
`INTO`); after `schema.`, the schema's tables; otherwise every table (bare
for `public`, `schema.table` otherwise), the columns of the tables the
script mentions (or of every table when the catalog has ≤ 12), the keyword
list and common functions as snippets. `monaco-sql.ts` is Monaco-free and
tested from `lib/sql-editor/completion.test.ts`.

### Running

`⌘⏎` (or Run) sends the selection when there is one, else the whole buffer,
with the mode, the row limit (100 / 500 / 1,000 / 10,000) and the timeout
(10 s … 5 min). In **commit** mode the page calls `check` first and, when it
returns warnings (drops, truncates, deletes and updates without WHERE,
dropped columns, type changes), a `ConfirmDialog` lists them by kind and
line before "Run anyway". In **rollback** and **read-only** mode the
warnings the run returns are a dismissable banner saying nothing was
committed. A script with `BEGIN`/`COMMIT`/`ROLLBACK`/`END` outside commit
mode is refused (the page says so before sending; the server would answer
422). The server's SQL error is data in a 200 response: the error panel
shows it and a Monaco marker sits on `error.line` (offset by the
selection's first line when a selection ran) until the buffer changes.
After every run a "Committed" / "Rolled back" badge and the duration.
Explain and Analyze call `explain` with the selection or the buffer.

### Snippets, history, drafts

Snippets are files under `db/queries/<name>.sql` in the app (committed with
it); favourites are the developer's own under `.orb/portal/`. Save is `PUT
snippets/{name}` with the buffer; the star toggles `favorite` with the same
SQL; rename saves under the new name then deletes the old; delete asks
first. Opening a snippet puts `?snippet=<name>` in the URL. The editor's tab
title shows `<name>.sql` with an "unsaved" mark when the buffer differs from
the saved copy (and the document title gets a "●"), and switching away from
a dirty buffer asks first. History is `GET history` (the last 500 runs on
this machine, `.orb/portal/sql-history.jsonl`, recorded by the server on
every run), invalidated after each run; Clear is `DELETE history`. The
buffer itself survives a reload through `localStorage`
(`devtools.sql.draft.<app>`, with the snippet it came from and the mode).
"Save as migration" previews `POST migration` without `apply` (the file's
path and content), then applies with `allow_dirty` when the working tree
isn't clean.

### Mock mode

`lib/api/mock/sql.ts` answers every endpoint from memory: six templates, two
snippets (one favourite), a starting history, a small catalog for
completion. `run` splits the script on semicolons outside strings and
comments, answers SELECTs on known tables with sample rows (NULLs included,
truncated at the row limit), UPDATE/DELETE/INSERT with command tags, and a
SQLSTATE error with its line for a script that says `boom` (or has a typo
like `SELEC`); a write in read-only mode fails as PostgreSQL would.
`check` is a port of `pgmeta.Check`. `explain` returns a Limit → Sort →
Seq Scan plan, with actual figures when analyzed. `migration` previews the
file and refuses to apply without `allow_dirty`.

## Phase 4: Schema, Objects and Migrations

Three pages under `/database/` read the catalog and change it through
migrations. Everything new lives in new files; the shared code gained one
dispatch line in `lib/api/mock/index.ts`, a "Database" nav section, and
`portal.database` on `PortalInfo`.

```
lib/api/schema.ts                types (pgmeta catalog, Change, DdlPlan, Migration) and hooks
lib/api/mock/schema.ts           the mock's catalog, DDL planner and migrate commands
components/schema/               graph.ts (ids, buildGraph, layoutGraph, toMermaid), positions.ts,
                                 export.ts (PNG/SVG/clipboard), table-node.tsx, flow.css, schema-page.tsx
components/db-objects/           objects-page.tsx, one *-tab.tsx per kind, plan-dialog.tsx,
                                 changes.ts (Change builders and templates), table-picker.tsx, common.tsx
components/migrations/           migrations-page.tsx, migrations.ts (ordering, summary, badges), new-migration-dialog.tsx
app/database/{schema,objects,migrations}/page.tsx
```

| Endpoint | Hook |
|---|---|
| `GET db/schemas`, `db/tables?schema=`, `db/tables/{schema}/{table}`, `db/foreign-keys`, `db/enums`, `db/functions`, `db/views`, `db/extensions` | `useSchemas`, `useTables`, `useTableDetail`, `useTableDetails` (one query per drawn table), `useForeignKeys`, `useEnums`, `useFunctions`, `useViews`, `useExtensions`; keys under `["db", …]` |
| `GET db/migrations`, `GET /_portal/app/_dev/migrations` | `useMigrations` (oldest first, as sent), `useDevMigrations` (the app's own count, while it runs) |
| `POST db/ddl/plan`, `db/ddl/apply` | `useDdlPlan`, `useDdlApply` |
| `POST app/migrate`, `app/migrate-down`, `app/migrate-redo` | `useMigrateAction(action)` |
| `POST generators/migration/plan`, `apply` | `useMigrationGenerator(apply)` |

Every page starts with `DbGate`: the connection problem, or "no database"
when `portal.database` is false, or the page. The pages hydrate inside a
Suspense boundary (they read the search params), which React may hydrate
after the status query has answered, so `useMounted` keeps the prerender
and the first client render identical (`DbPageSkeleton`) and the real
page follows on mount.

### The diagram (`@xyflow/react`, `@dagrejs/dagre`, `html-to-image`)

`buildGraph` turns the tables, their details and the foreign keys into
nodes (one per table, sized from the column count so dagre can lay them out
before the DOM exists) and edges (one per foreign-key column pair, from the
referencing column's right handle to the referenced column's left handle;
ids `schema.table`, `column:in|out`, `fk:schema.table.name`). `layoutGraph`
runs dagre left to right on the tables that foreign keys join and puts the
rest in a grid beside them. `neighbourhood` is what lights up on hover.

Managed and system tables are hidden by default (a Full app has ~30 of
them); the two toggles persist in `localStorage.devtools.schema.show`.
Dragged positions persist per set of schemas
(`devtools.schema.positions:<schemas>`, `positions.ts`, every access in
try/catch); Auto layout clears them. ⌘F focuses the find box: matches stay
lit while the rest fade, Enter centres the first match at zoom 1. Export
renders the viewport with `html-to-image` at 1:1 (PNG at 2× when the
diagram is small enough) or copies the `erDiagram` from `toMermaid`
(downloaded as `.mmd` when the clipboard isn't available, as on a
non-secure origin). React Flow's stylesheet is imported once in
`schema-page.tsx`; `flow.css` overrides its `--xy-*-default` variables with
theme tokens under `.schema-flow` and styles the node, the handles and the
hot/cold edge states.

### The plan dialog

Every create and drop on the Objects page builds a `Change` with
`components/db-objects/changes.ts` and hands it to `PlanDialog`, which
posts it to `db/ddl/plan`, shows the summary, the Up and Down SQL, the
notes, the irreversible and no-transaction flags and the file path, and
lets the developer rename the migration and allow a dirty working tree.
Apply posts the same change to `db/ddl/apply`; `useDdlApply` then polls
`db/migrations` (`waitForMigrations`, every second for up to 12 s, until
the applied state differs or the status reports a problem) and invalidates
every `db` query, so the tab refetches. Drops pass the catalog's
definition (`definition`, and `signature` for functions) so the Down
recreates the object; the backend marks a drop without it irreversible.
403 `system_table`, 409 `plan_conflict` and 422 `invalid_input` show the
backend's detail in the dialog.

The Migrations page's three actions answer 202; `useMigrateAction` polls
the same way and shows `app.problem` (the supervisor's report of a failed
migrate) in a panel with a link to the output console. New migration goes
through the `migration` generator's plan and apply.

### Mock

`lib/api/mock/schema.ts` holds a small catalog (nine relations across
`public` and `billing` with foreign keys, two enums, four functions, three
triggers, indexes, two views, nine extensions) and twelve migration files,
one pending. `planChange` mirrors `pgmeta.Plan` for the object kinds and
`renderPlan` the file; apply refuses a dirty tree without `allow_dirty`,
writes the migration as pending, and the migrate commands take 1.5 s to
apply, roll back or redo, changing the catalog as they go.

## What Phase 0 leaves for later

## What Phase 1 leaves for later

- Table sizes and slow queries on the Database page, and the SQL spans of a
  request in the builder, wait for the backend pieces of Phase 2 and Phase 8.
- The request builder's "None" auth mode sends no header, but the proxy
  still adds the dev operator on `/ops` and `/_dev`; a pasted bearer token
  is the way to override it until the proxy learns an opt-out.
- `/_dev/config` (the environment as the app read it) has a type and a
  mock but no page yet.
- The generator endpoints have types and a mock but no UI.
- The version in the shell reads `portal.version` (the orb version); the
  fallback before the portal answers is still `v0.1`.
