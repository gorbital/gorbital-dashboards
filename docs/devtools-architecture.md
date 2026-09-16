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
│   ├── observability/      Observability, in a Suspense boundary for ?tab= (Phase 8, below)
│   └── routes|requests|logs|modules|audit|jobs|mail|settings|environment|database|auth
├── components/
│   ├── overview/           Overview (with the health panel), OutputConsole, ConnectionProblem
│   ├── routes/             the route list and the request builder
│   ├── requests/           the live-tailed request list; its detail reads the log store
│   ├── logs/               the Logs screen on the log store (Phase 7, below); logs/log-line.tsx is the expandable record both use
│   ├── modules/, audit/, database/
│   ├── mail/               the Mail screen (Phase 9, below): the inbox orb dev caught, the previews, the delivery sections
│   ├── environment/        the Environment screen (Phase 9, below): .env against .env.example
│   ├── settings/           runtime settings, and the Feature flags tab (Phase 9, below)
│   ├── auth/               the Authentication screen (Phase 5, below)
│   ├── jobs/               the Jobs screen (Phase 6, below): the list, the New job sheet, the job detail, the plan diff
│   ├── shared/             Gate, ProblemPanel, ReasonDialog, QueryParam, KeyValueEditor (below)
│   ├── table-editor/       the Table Editor (Phase 2, below)
│   ├── sql-editor/         SqlEditor, SnippetTree, Toolbar, Results, ExplainView, the dialogs
│   ├── schema/             the diagram (Phase 4)
│   ├── db-objects/         the Objects tabs and the plan dialog (Phase 4)
│   ├── migrations/         the Migrations page (Phase 4)
│   ├── observability/      the Observability screen (Phase 8, below)
│   ├── app-chip.tsx        the shell's app chip, live
│   ├── portal-version.tsx  the shell's version, live
│   ├── search.tsx          the ⌘K palette: pages, the app's live routes, app actions
│   └── sidebar-nav.tsx     the nav; live badges for routes, captured mail and pending migrations
└── lib/
    ├── mock.ts             sample data for every page and for mock mode
    ├── auth.ts             the Authentication screen's pure logic: paging merge, grantable roles, code expiry, limiter key examples
    ├── time.ts             clock, when, ago and between, for tables
    ├── use-now.ts          a ticking clock for uptimes and "ago"
    ├── table-editor/       the Table Editor's pure logic: URL state, literals, CSV, plan builders
    ├── jobs/               the Jobs screen's pure logic: schedule → English, the line diff, the New job form
    ├── mail/               the Mail screen's pure logic: addresses, codes, sizes, the stream's merge, preview groups
    ├── environment/        the Environment screen's pure logic: key names, masks, badges, grouping, filters
    ├── flags/              the Flags tab's pure logic: a state in words, the form, what the app would refuse
    ├── sql-editor/         the SQL Editor's pure logic: exports, plan tree, name rules, run requests, drafts
    ├── observability/      the Observability screen's pure logic: formatting, grading, route ranking, share bars, sample series
    └── api/                the data layer (below)
```

The build is a static export (`output: "export"`): every page prerenders as
HTML with skeletons, and the browser fills it in from the API. `orb dev`
serves `out/` at `http://127.0.0.1:3100` and resolves `/routes` to
`routes.html`, so links need no trailing slash.

## The data layer (`lib/api/`)

| File | What it is |
|---|---|
| `types.ts` | Hand-written TypeScript for everything the UI reads: the portal API (`Status`, `AppStatus`, `OutputLine`, `PortalEvent`, generators), the dev console (`DevApp`, `DevRouteList`, `DevRequestList`, `DevLogList`, `DevConfigList`, `DevMigrations`, `DevJobRunList`, `DevMail`, `DevStreamEvent`) and the ops API (`OpsSetting`, `OpsSettingChange`, `JobDefinition`, `JobRun`, `JobsOverview`, `Queue`, `AuditEvent`, `AuditStats`, `SystemInfo`, `MailStatus`, `Suppression`, `CurrentRelease` and the request bodies) and the jobs in code (`JobSource`, `JobMarkerForm`, `JobGeneratorInput`, ADR-0071), matching the Go types, `modules/devconsole/openapi.json` and `examples/full-single/api/openapi.json` field for field. Errors are `Problem` (RFC 9457). |
| `client.ts` | `apiFetch<T>(path, init)`: same-origin fetch with the cookie, the `X-Orb-Portal: 1` header on anything but GET/HEAD, JSON in and out. A problem response becomes `ApiError { status, code, detail, title, unauthorized }`; a request that never gets an answer becomes `NotConnectedError`. `subscribeSSE(path, onMessage, onStatus)`: any `text/event-stream` on the origin, with reconnects (below); `subscribeEvents` wraps it for the portal's own stream, `parseDevStreamEvent` reads the console's. |
| `sse.ts` | `createSSEParser`: an incremental `text/event-stream` parser (any chunking, multi-line `data:`, comments, CRLF). `readSSE`: drives it from a `ReadableStream` until the stream ends or a signal aborts. |
| `live.ts` | `useLiveTail<T>({ path, event, enabled, max })`: follows a console stream and keeps the newest items; `mergeTail` folds the list endpoint's backlog in behind them without duplicates. |
| `errors.ts` | `describeError(err, { scope, console })`: what an error means by where it came from (a 401 from `/ops` while the app serves the console is an orb or app that predates the dev operator; a 404 from `/_dev` is an app without the console; 503 `unavailable` from `/_dev/mail` is Mailpit down…). `errorMessage` for toasts, `needsReason` and `isVersionConflict` for the `*_reason_required` and `*_version_conflict` families. |
| `request-builder.ts` | The Routes page's builder as pure functions: `pathParams`, `fillPath`, `buildQuery`, `buildRequest` (the URL through `/_portal/app` and the `RequestInit`, with the mutation header, a pasted bearer token, the JSON body) and `sendRequest`, which measures the answer and keeps the headers worth showing. |
| `auth.ts` | The Authentication screen's data layer: the types of ADR-0070 (`OpsUser`, `OpsUserDetail` with `AuthSession`, `Passkey`, `Identity`, `OpsMFAStatus`, `OpsCode`, `OpsImpersonation`, `OpsTOTPEnrollment`, `SignInMethod`, `RateLimiter`, the request bodies) matching `internal/modules/auth/delivery/ops_users.go` and `internal/modules/ops/delivery/auth.go`, and one hook per endpoint (`useAuthUsers` pages by `next_cursor`; `useAuthUser`; the mutations toast and invalidate `["ops","auth",…]` and the audit log). |
| `bearer-token.ts` | `storeBearerToken`, `readBearerToken`, `clearBearerToken`: the token "Act as user" hands to the Routes page's request builder, in `sessionStorage` (this tab only), never in the query string. |
| `setting-value.ts` | Typed input for runtime settings: `formatSettingValue` and `parseSettingValue` per kind (`bool`, `int`, `float`, `string`, `enum`, `duration`, `string_list`) against the constraints (`min`, `max`, `one_of`, `max_len`, `max_items`, `format`), Go durations (`durationMs`, `shortDuration`), `describeConstraints` for the hint line. |
| `store.ts` | The console store: the latest `AppStatus` from the stream, the output tail (capped at 2,000 lines like orb's own buffer), the dropped count and the connection state, read with `useConsole()` (`useSyncExternalStore`). `mergeLines` folds `/output` into what the stream delivered without duplicates and in time order. |
| `queries.ts` | React Query hooks. Portal: `useStatus` (every 5 s), `useCapabilities` (what the status says the app can answer: `running`, `console`, `ops`, `database`), `useOutput`, `useReadiness`, `useAppAction`, `useMigrate`. Console: `useDevApp`, `useDevRoutes`, `useDevRequests`, `useDevLogs`, `useDevMigrations`, `useDevMail`. Ops: `useSettings`, `useSettingHistory`, `useSetSetting`, `useResetSetting`, `useJobDefinitions`, `useScheduledJobs`, `useJobsOverview`, `useJobRuns` (infinite, by cursor), `useRunJob`, `useUpdateJobDefinition`, `useResetJobDefinition`, `useRunAction("retry" \| "cancel")`, `useQueues`, `useQueueAction("pause" \| "resume")`, `useJobSources` (`GET /_portal/api/jobs`), `planJob`/`applyJob` (the job generator), `waitForJobDefinition` (polls the definitions after a restart), `useAudit` (infinite), `useAuditStats`, `useSystem`, `useOpsMail`, `useSendTestEmail`, `useSuppressions`, `useRemoveSuppression`, `useCurrentReleases`. Mutations toast on both outcomes and invalidate what they change; the settings and job definition ones leave `*_reason_required` and `*_version_conflict` to the form. Nothing is retried that won't change on its own (not connected, 4xx). |
| `provider.tsx` | `DevtoolsProvider`: the `QueryClient`, the `Toaster`, the `TooltipProvider`, and the one events subscription for the whole app. |
| `sql.ts` | The SQL Editor's types (`RunRequest`, `RunResult`, `StatementResult`, `RunError`, `Warning`, `Template`, `Snippet`, `HistoryEntry`, `MigrationResponse`, the EXPLAIN `PlanNode`) and hooks: `useSqlTemplates`, `useSnippets`, `useSqlHistory`, `useSqlCatalogTables`/`useSqlCatalogColumns` (for completion), `useRunSql`, `useExplainSql`, `useCheckSql`, `useSaveSnippet`, `useDeleteSnippet`, `useClearHistory`, `useSaveMigration`. |
| `mode.ts` | `dataMode()`: `"live"` or `"mock"` (below). |
| `mock/index.ts` | The in-memory `orb dev` for mock mode. |
| `db.ts` | The Table Editor's shapes (`Schema`, `Table`, `Column`, `TableDetail`, `RowPage`, `Change`, `ColumnSpec`, `DDLResponse`…, matching `cli/internal/pgmeta`) and hooks: `useSchemas`, `useTables`, `useTableDetail`, `useTypes`, `useRows`, `useInsertRow`, `useUpdateRow`, `useDeleteRows`, `importRows`, `planDDL`, `applyDDL`, `waitForMigrations`. |
| `mock/db.ts` | The in-memory PostgreSQL behind `/_portal/api/db/*` in mock mode (below). |
| `mock/sql.ts` | The in-memory SQL runner behind `/_portal/api/db/sql/*` in mock mode. |
| `logs.ts` | The log store's shapes (`LogRecord`, `LogPage`, `LogBucket`, `ErrorGroup`, `LogStats`, `SavedFilter`, matching `cli/internal/portal/logstore.go`) and hooks: `useLogs` (infinite, paging backwards by `next_before`), `useLogHistogram`, `useLogErrors`, `useRequestLogs`, `useLogStats`, `useSavedFilters`, `useSaveFilter`, `useDeleteFilter`, `useClearLogs`, `useLogTail` (the live tail on `logs/stream`), `isNoLogStore` (Phase 7, below). |
| `mock/logs.ts` | The in-memory log store behind `/_portal/api/logs*` in mock mode. |
| `mail.ts` | The development inbox (ADR-0074): `MailSummary`, `MailDetail` (`MailAddress`, `MailLink`, `MailAttachment`, `MailEnvelope`), `MailList`, the previews (`MailPreview`, `MailPreviewMessage`, `MailPreviewSent`), matching `cli/internal/devmail/store.go` and the console's OpenAPI; hooks `useInbox(q)`, `useMailMessage`, `useMailHtml`, `useMailSource`, `useDeleteMail`, `useClearMail`, `useMailStream` (the `mail/stream` tail, folded into every cached list), `useMailPreviews`, `useMailPreview(name, to)`, `useSendPreview`, `waitForMessage`; `isNoMailCatcher` for the 404 (Phase 9, below). |
| `mock/mail.ts` | The in-memory catcher and previews behind `/_portal/api/mail*` and `/_dev/mail/preview*` in mock mode. |
| `env.ts` | The env editor (ADR-0074): `EnvEntry`, `EnvList`, `EnvReveal`, `EnvChange`, `EnvChangeResult` matching `cli/internal/portal/env.go`; `useEnv`, `revealEnv` (never cached), `useUpdateEnv` (`PUT env` with `set`/`unset`), `useDevConfig` (`/_dev/config`), `isNoEnvEditor`. |
| `mock/env.ts` | An in-memory `.env` and `.env.example`, parsed and rewritten like orb dev, behind `/_portal/api/env*` in mock mode. |
| `flags.ts` | Feature flags (ADR-0057): `OpsFlag`, `FlagState`, `FlagTargets`, `FlagChange` matching `examples/full-single/api/openapi.json`; `useFlags`, `useFlagHistory`, `useSetFlag`, `useResetFlag` (both leave `flag_reason_required`, `invalid_flag_state` and `flag_version_conflict` to the form). |
| `mock/flags.ts` | The sample flags behind `/ops/flags*` in mock mode, with versions, the required reason and the library's state validation. |
| `../logs/filters.ts` | `LogFilters` and the URL codec (`parseFilters`, `filtersToParams`, `filtersToApi`, `resolveRange`, `bucketFor`), `../logs/tail.ts` the tail reducer, `../logs/fingerprint.ts` the error grouping mirrored from Go. |
| `observability.ts` | The Observability screen's types and hooks (Phase 8, below). |
| `mock/observability.ts` | The health table, the sampler, the pgmeta statistics and `/ops/observability/*` in mock mode. |

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
`Set-Cookie` from `/_portal/auth`, and streams SSE without buffering, because
the development phase also sets `compress: false`: with Next's default gzip
on proxied responses the event streams (`/_portal/api/events`, `logs/stream`,
the console's streams) stay buffered until they end and every tail goes
quiet. Sign
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
with orb lines in the console), the generator `plan`/`apply` endpoints (the
job one in `lib/api/mock/jobs.ts`, below), `/_portal/api/jobs`,
`/_portal/app/readyz`, every `/_dev/*` endpoint and its two streams, and
the `/ops/*` endpoints the pages use, all from `lib/mock.ts`
(`portalStatus`, `outputLines`, `devApp`, `devRoutes`, `devConfig`,
`devRequests`, `devLogs`, `devMigrations`, `devJobRuns`, `devMail`,
`opsSettings`, `opsSettingHistory`, `opsJobDefinitions`, `opsJobRuns`,
`opsQueues`, `opsAuditEvents`, `opsSystem`, `opsMail`, `opsSuppressions`,
`opsReleasesCurrent`, `liveRequests`, `liveLogs`), plus the auth module's
operator APIs from `lib/api/mock/auth.ts` (below). The ops part keeps
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

The log store (`/_portal/api/logs*`) has its own in-memory mock in
`lib/api/mock/logs.ts`, described with the Logs screen below.

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

## Authentication (`/auth`)

Supabase Studio's Authentication section on gorbital's theme: the accounts
of the app with search and keyset paging, one account's sessions, passkeys,
linked providers, second factors and pending codes with every operator
action of ADR-0070, the sign-in methods and the rate limiters. The backend
is the auth module's `/ops/auth/users…` (`internal/modules/auth/delivery/ops_users.go`),
the ops module's `/ops/auth/providers` and `/ops/auth/rate-limits`; the
endpoints are listed in `docs/guides/ops-api.md` ("Accounts").

```
app/auth/page.tsx                 <Suspense> around the client component (the tab and the selected account are in the query string)
components/auth/
├── auth.tsx                      the page: Gate (ops), the three tabs (?tab=users|providers|rate-limits), the selected account (?user=)
├── users.tsx                     search (q, debounced), the accounts table, "Load more" on next_cursor, the "New user" sheet
├── user-sheet.tsx                one account: profile and actions (verify, ban with a reason, unban, act as user, delete typed), roles (grant from the
│                                 catalogs of /_dev/app, revoke chips), sessions (revoke one, revoke all), passkeys, linked providers, second factors
│                                 (enroll shows the secret and recovery codes once; reset), pending codes with a link to Mail; the shown-once dialogs
├── providers.tsx                 cards from /ops/auth/providers: enabled with its detail, or the .env lines that turn it on and the guide section
├── rate-limits.tsx               the limiters (name, what the key is, limits) and the reset form (limiter + key); the toast says reset: true/false
└── common.tsx                    CopyButton, UserBadges, RoleChip, shortUserAgent
lib/auth.ts                       mergeUserPages, grantableRoles / revocableRoles, codeState / codePurpose, limiterKeyExample, lastSeen
lib/api/auth.ts                   the types and hooks (above)
lib/api/bearer-token.ts           the token handed to the Routes page
lib/api/mock/auth.ts              the mock (below)
```

**Data flow.** `useAuthUsers(q)` is an infinite query on `GET /ops/auth/users?q=&limit=&cursor=`; `mergeUserPages` flattens its pages and drops an account a refetched page repeats. A row opens the sheet, whose `useAuthUser(id)` reads everything about the account and refetches every 15 s; every mutation invalidates the lists, the detail and the audit queries. The role select offers the roles of every permission catalog the app declares (`/_dev/app`, so it needs the console), minus the implicit `user` role and those held; without catalogs it is a text field. Codes are listed without the code (they are stored hashed), with attempts and expiry; the link goes to the Mail screen, where the code is.

**Act as user.** `POST …/impersonate` answers a session token once; the dialog shows it with Copy, and "Use in Routes" stores it with `storeBearerToken` and opens `/routes`, where the request builder reads it on mount, switches its auth mode to "Bearer token" and says whom it acts as. The app only impersonates while it runs with the dev console; elsewhere the 403 `impersonation_off` becomes a warning toast.

**Refusals.** The screen renders under `Gate need="ops"`, so a stopped app or the Minimal preset shows the standard explanation; an app without the `auth` feature shows its own. Every write is a mutation with `errorMessage` in its error toast; `email_taken`, `invalid_email` and `weak_password` land under the field of the "New user" form.

**Mock mode.** `lib/api/mock/auth.ts` keeps five accounts (the administrator with TOTP and a passkey, an `ops_viewer` with two sessions, a Google identity and a pending reset code, an unverified account with a verification code, a banned one, and one with GitHub only), answers every endpoint with the app's status and problem codes (`invalid_cursor`, `user_not_found`, `email_taken`, `weak_password`, `unknown_role`, `account_banned` on impersonating a banned account, `rate_limiter_not_found`), the eleven sign-in methods and three limiters with a few keys that answer `reset: true` once. `opsProxy` hands `/ops/auth/*` to it before its own routes; `resetMock` resets it.

## Jobs (`/jobs`)

Phase 6 (roadmap items 51–57, [ADR-0071](../../gorbital/docs/adr/0071-job-kinds-and-ejection.md)):
the definitions with their schedule in plain English, a job made three ways
(form, CLI, code), the visual view of a form-made job read back from its
`//orb:job` marker, ejection, the run history with per-run logs, and the
queues and the scheduled view.

```
components/jobs
├── jobs.tsx            the page: tiles, the definitions (plain-English schedule, active toggle, source badge),
│                       the runs, the queues (depth, throughput), the scheduled list; ?job= opens the detail, ?new=1 the sheet
├── job-detail.tsx      JobDetailSheet: Overview (source, marker fields, files), Runs (history, per-run logs, retry, cancel),
│                       Configure (the Phase 1 edit form, now JobConfigForm); SourceBadge
├── new-job-sheet.tsx   NewJobSheet: tabs Form / CLI / Code; plan → diff → apply → restart → wait for the definition
└── plan-diff.tsx       PlanView and PlanFile (a created file in full, a modified one as hunks), CopyButton
lib/jobs
├── schedule.ts         describeSchedule: cron and descriptors → "every weekday at 09:00"; the raw expression when unsure
├── diff.ts             lineDiff (an LCS on lines), diffHunks, unifiedDiff, diffStat
└── form.ts             JobForm, the presets, validateJobForm, toGeneratorInput, toCommand (orb gen job …),
                        formFromSource (Duplicate as new), jobNames (orb's name derivation), workerTemplate
```

**Two sources, joined by name.** `/ops/jobs/definitions` is what the running
app registered (config, defaults, next and last run); `GET /_portal/api/jobs`
is what is in the app's code: for every job its `ident`, `package`,
`definition` and `worker` files, `generated` (the definition carries an
`//orb:job` marker), `ejected` (the worker no longer hashes to the marker),
`kind` and `form` (the marker's fields). The page joins them on `name` and
shows the definition with a badge: **Made with the form** (generated, not
ejected; the detail shows the marker's fields read-only: method and URL,
the statement, the message, the target), **Ejected: edit in code** (the
worker was edited; the form never offers to overwrite it) or **Custom
(code)** (no marker). A generated job gets **Duplicate as new**, which
pre-fills the New job form from the marker and the definition's defaults;
there is no "edit" for existing jobs, because the generator refuses files
that exist.

**New job.** The sheet has three tabs over one form state (`lib/jobs/form.ts`):

- *Form*: name (with the derived `ident · definition · package`),
  description, trigger (schedule with presets or a raw cron, interval with
  presets or a raw duration, on demand; the plain-English reading under it),
  timeout, attempts, queue, priority, enabled, and the kind: custom, HTTP
  request (method, URL, JSON body), SQL (a statement in the Monaco editor,
  `pgsql`), Email (to, subject, text), Dispatch (a definition from the
  list). *Preview* posts `generators/job/plan`; the answer's `changes` are
  rendered per file (a created file in full, a modified one as a diff of
  `before` against `content`, with `+n −m`), with the plan's `next` steps.
  *Create* posts `generators/job/apply` (with `allow_dirty` from the
  checkbox; a dirty tree is refused with the hint to tick it). The files are
  on disk but the app doesn't know the job until it rebuilds, so the footer
  offers *Restart the app*: it posts `app/restart`, waits 2.5 s, then polls
  `/ops/jobs/definitions` every 2 s (up to 2 min) until the definition is
  there, invalidates the jobs queries and opens the new job's detail. The
  portal's usage errors (422 `generator_failed`, `--url must be an http or
  https URL`…) are shown under the field the flag names and in a banner.
- *CLI*: the equivalent `orb gen job …` (only the flags that differ from
  the defaults, shell-quoted, `--allow-dirty` when the checkbox is on) with
  a copy button.
- *Code*: what the custom kind means, the files the generator will write
  (from the plan once previewed, else derived from the name) with the one to
  open, and the worker in a read-only Monaco editor (`go`): the plan's file
  once previewed, the custom template before that, with a copy button.

**Detail.** *Runs* lists the definition's runs (`/ops/jobs/runs?kind=`,
25 a page) and expands one to its timings, errors per attempt, the
request ID (linked to Logs), and its logs: the dev console's records whose
`job_id` attribute is the run's ID (generated workers log one line per run;
failures carry `job_id` and `job_kind`), with "open in Logs" carrying
`?q=job_id=<id>` (the Logs page pre-fills its text filter from `?q=`).
Arguments are never returned by the ops API, and the page says so. *Configure*
is the Phase 1 form (schedule, timeout, attempts, queue, priority, with a
reason for risky changes).

**Queues and scheduled.** `/ops/queues` only carries `paused`; depth is
`available + scheduled + retryable` from `/ops/jobs/overview`, and
throughput is derived on the client from the last 100 completed runs
(`/ops/jobs/runs?state=completed&limit=100`): completed in the last hour
per queue, scaled up when the loaded runs don't reach back an hour. The
scheduled list shows each job's plain-English schedule, the raw expression,
and the next run as "in 5m · 23:10:02".

**Mock mode.** `lib/api/mock/jobs.ts` answers `/_portal/api/jobs` for the
sample definitions (`audit.rollup` sql, `invites.expire` http,
`projects.reindex` dispatch, `sessions.prune` generated but ejected, the
rest hand-written) and the job generator: `plan` validates like the CLI
(the same usage messages), renders the four files with `before` for
`internal/app/jobs.go` and the marker in the definition, and refuses an
existing name with 409 `plan_conflict`; `apply` refuses without
`allow_dirty` (the sample repository is dirty), then keeps the job aside
until `app/restart` completes, when it appears in `/ops/jobs/definitions`
and `/_portal/api/jobs`, as with the real app.

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
| `gauge.tsx` | `Gauge` | a three-quarter arc with the value in the middle; inline SVG, theme tokens only |
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
and the languages (`monaco-editor/languages/definitions/{pgsql,go}/register`; Go for the Jobs screen's Code tab), then
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

## Phase 7: Logs (`/logs`)

The Logs screen reads orb dev's local log store (ADR-0072 in the gorbital
repository): every line the app writes, orb dev's own messages and the
PostgreSQL container's log, kept as JSON Lines under `.orb/portal/logs`
and served at `/_portal/api/logs`. The Phase 1 screen read the app's
`/_dev/logs` buffer, which restarted empty; this one survives restarts,
filters on the server and pages backwards. The Requests page still tails
`/_dev/requests`; its detail now reads `logs/request/{id}` and falls back
to `/_dev/logs` on an orb dev without a store.

### Files

| File | What it is |
|---|---|
| `lib/api/logs.ts` | The types and hooks (in the data layer table above). |
| `lib/logs/filters.ts` | `LogFilters` and the codec: `parseFilters(URLSearchParams)`, `filtersToParams`, `filtersToApi(filters, now)`, `resolveRange`, `bucketFor`, `describeFilters`, `filtersFromJSON`. |
| `lib/logs/tail.ts` | `reduceTail` and `mergeRecords`: the live tail's state. |
| `lib/logs/fingerprint.ts` | `normalizeShape`, `fingerprint`, `fingerprintID`, `literalOfShape`: the store's grouping, mirrored. |
| `lib/api/mock/logs.ts` | The mock store. |
| `components/logs/logs.tsx` | The page: URL state, the tail, the sheet; `LogsSkeleton` is the prerender. |
| `components/logs/source-chips.tsx`, `filter-bar.tsx`, `histogram.tsx`, `log-list.tsx`, `log-line.tsx`, `errors-view.tsx`, `record-sheet.tsx`, `saved-filters.tsx`, `store-panel.tsx`, `store-gate.tsx` | The pieces, one each. |

### The view is the query string

Every filter lives in the URL with the API's own names, so a view is
shareable and a link from another page is just a query string:
`/logs?range=6h&source=http,auth&status_class=5xx&min_duration_ms=250&q=timeout`.
The time window is `range=15m|1h|6h|24h|7d` (a preset ending now; `1h` is
the default and omitted) or `from`/`to` (RFC 3339, an absolute window from
a zoom or the Custom fields; it wins over `range`). The rest are `level`
(comma list), `min_level`, `source` (comma list), `user`, `method`, `path`
(prefix), `status_class`, `status`, `min_duration_ms`, `request_id`,
`trace_id` and `q`. Two more parameters are UI state, not filters:
`view=errors` for the Errors tab and `id=<record id>` for the open detail
sheet. `parseFilters` drops what it can't read and normalises (levels
upper-case, sources lower-case, the default range absent), so two URLs
that mean the same compare equal (`filtersEqual`), which is how the saved
filters menu knows which one is active.

The page writes the URL with `history.replaceState(null, "", url)` and reads
it back with `useSearchParams` inside the page's `Suspense`. The state
passed is `null` on purpose: Next patches `replaceState` to sync its
router, but skips a call whose state carries its own `__NA` marker, so
passing `window.history.state` (as `setQueryParam` does for pages that
also keep local state) would leave `useSearchParams` stale.

`filtersToApi(filters, now)` turns the filters into the query for
`/_portal/api/logs*`: a preset becomes `from = now - range` (no `to`, so
the tail's window stays open), an absolute window passes `from` and `to`.
The React Query key is the normalised filters, not the resolved times, so
a preset doesn't refetch every second; the times are resolved in each
`queryFn`.

### The list and the tail

`useLogs` is an infinite query over `GET logs?limit=200`; "Load older"
follows `next_before` (the last record's id) into older records. The
store answers `next_before` whenever a page is full, even when nothing
older matches, so the last "Load older" can return an empty page and the
button disappears then.

`useLogTail` follows `GET logs/stream` with the same filters (minus
`from`) and `after=<the newest id in the first page>`: the stream first
replays what was stored after that id, then every new record that
matches, so nothing falls between the page and the subscription. It is on
while the switch is on, the window ends now (a zoom or a custom `to`
disables it), the Records tab is showing and the first page has loaded;
the subscription restarts when the filters or `after` change. `reduceTail`
keeps the records newest first, capped at 1,000, and drops a record it
already has (a reconnect replays). While the reader has scrolled into the
list (an `IntersectionObserver` on a sentinel at the list's top) new
records go to `pending` instead and a sticky "N new records" pill shows;
clicking it, or scrolling back, flushes them in front. Turning the tail
off and on again closes the gap the same way, through `after`.
`mergeRecords` folds the tail's records and the pages' into one list by
id; a refetch of the first page clears the tail, since the page now holds
those records.

The list renders in chunks of 150 rows as the reader scrolls (a sentinel
near the end asks for the next chunk) and each row skips layout while off
screen (`content-visibility: auto`), so a page of 1,000 records paints at
once. `LogLine` (shared with the Requests detail) shows time, level, source,
message or raw line and the key attributes; expanded, every attribute with
a copy button and the actions: "All logs for this request", "Filter by
user", "Filter by trace", "Details" (the sheet) and a link to the request.
The source chips count the loaded records (the pages plus the tail) per
source; when a source is selected only its count is known.

### Histogram

`useLogHistogram` asks `GET logs/histogram` over the same window with the
bucket the window's size asks for (`bucketFor`): 1 m up to 2 h, 5 m up to
12 h, 15 m up to 24 h, 1 h beyond. The bars stack debug, info, warn and
error in the theme's level colours. A click zooms to that bucket, a drag
across bars to their span: the page writes `from`/`to`, the tail pauses,
and Reset zoom returns to the last preset.

### Errors

The Errors tab (`view=errors`) reads `GET logs/errors` for the window:
records at WARN and above grouped by fingerprint (the message's shape
with numbers, IDs, hex and quoted values replaced, plus the first line of
`stack` or `error`), most recent first, with source, level, count, first
and last seen. A group expands to its last record and "See records"
switches to the Records tab filtered by the group's source, `min_level=WARN`
and either the last record's `request_id` (a group of one) or the longest
literal part of the shape as `q` (`literalOfShape`), since the shape's
placeholders aren't searchable text.

### Saved filters, the store and the gate

The Saved filters menu lists `GET logs/filters` (apply one; the active one
is checked) and opens a dialog to name the current filters (`PUT
logs/filters` with `{name, query}`, `query` being the normalised
`LogFilters`; a name that exists is replaced) or delete one (`DELETE
logs/filters/{name}`). orb dev keeps them in `.orb/portal/log-filters.json`.

`LogStorePanel` shows `GET logs/stats` (bytes of the 64 MiB, records,
segments, the oldest record) and Clear behind a `ConfirmDialog` (`DELETE
logs`); `compact` is the one-row footer of the Logs page, the full panel
is for Project Settings later. A 404 `no_log_store` from any log endpoint
(an orb dev from before the store) shows `NoLogStore` with the rebuild
command instead of the page.

### Mock

`lib/api/mock/logs.ts` is a store in memory: about 400 records over the
last hour from a generator that plays the app's moments (a request with
its companions from the auth, storage or postgres loggers, jobs starting
and failing, mail, orb dev rebuilding, raw lines), with a few error groups
(panics with a stack, sign-in failures, rejected bodies, a duplicate key).
It mirrors `LogQuery.Matches`, paging by id, the histogram, the error
groups (through the same `fingerprint` module), `logs/request/{id}`,
stats, clear and the saved filters with the same validation, and a stream
that first replays after the cursor, then adds an event every 2 s while
someone listens; a query after a pause catches the store up first, so a
refresh shows new records as a real one would. `resetMockLogs` puts it
back; `resetMock` calls it.

## Observability (`/observability`)

Phase 8 (ADR-0073): service health, the API's rates and percentiles, the
database's statistics, query performance, advice, the machine and the Go
runtime, jobs and sign-ins. The backend is `cli/internal/portal/observe.go`
(the health table, the `gopsutil` sampler in `sysinfo.go`) and
`cli/internal/pgmeta/stats.go` (`Stats`, `Statements`, `ResetStatements`,
`Advise`), plus what the app already answers: `/ops/observability/*`,
`/ops/system`, `/ops/jobs/overview` and `/ops/audit`. Everything new lives
in new files; the shared code gained one dispatch line in
`lib/api/mock/index.ts`, the nav and palette entries, and `Gauge` in
`packages/ui/components/gauge.tsx`.

```
app/observability/page.tsx        <Suspense> around the client component (the section is in ?tab=)
components/observability/
├── observability.tsx             the tabs; renders a skeleton until mounted (the boundary may hydrate after the status query answered)
├── health.tsx                    item 63: the service table and the app's readiness checks
├── api.tsx                       item 64: rates, percentiles, the minutes chart, top-5 cards, the routes table, the stream badge
├── db.tsx                        item 65: connections, clients, cache gauges, pool, transactions, largest tables, lock waits, long statements
├── queries.tsx                   item 66: pg_stat_statements with share bars, Explain (dialog), Open in SQL editor, Reset; the "unavailable" panel
├── advice.tsx                    the four advice groups, each with Copy and Open in SQL editor
├── system.tsx                    item 67: host gauges, memory and disk bars, the two process cards, the Go runtime, 60-sample sparklines
├── jobs-auth.tsx                 item 68: queues from /ops/jobs/overview, auth.* events by action, sign-ins by method
└── common.tsx                    StatusPill, HitGauge, useOpenInSqlEditor, NoDatabase, Stat
lib/api/observability.ts          types (ServiceHealth, HostSample, DatabaseStats, Statements, Advice, ObservabilityOverview, RouteTraffic…) and hooks
lib/api/mock/observability.ts     the mock: health, the sampler, db/stats, db/statements (+ reset), db/advice, /ops/observability/{overview,routes,stream}
lib/observability/                pure helpers with tests: format (percent, bytes, millis, rate, count), grade (hit, usage, error-rate, load, worst status),
                                  routes (sort, slowest, most failing, fillMinutes), statements (share bars, editor text), samples (the 60-sample series)
```

| Endpoint | Hook | Polling |
|---|---|---|
| `GET /_portal/api/health` | `useServiceHealth` | 10 s |
| `GET /_portal/api/system` (404 `no_system_sampler` on an older orb) | `useHostSample` | 2 s, only while the System tab is mounted |
| `GET /_portal/api/db/stats` | `useDbStats` | 10 s |
| `GET /_portal/api/db/statements?sort=&limit=` | `useDbStatements` | on demand; Refresh refetches (the counters only grow) |
| `POST /_portal/api/db/statements/reset` (204; 409 `statements_unavailable`) | `useResetStatements` | after a `ConfirmDialog` |
| `GET /_portal/api/db/advice` | `useDbAdvice` | on open, 30 s stale |
| `GET /ops/observability/overview?window=` | `useObservabilityOverview` | 15 s |
| `GET /ops/observability/routes?window=&sort=requests&limit=500` | `useObservabilityRoutes` | 15 s; the table sorts client-side |
| `GET /ops/observability/stream?window=` | `useObservabilityStream` | `subscribeSSE`; every `overview` event is written into the overview query, so the tiles and the chart move every 5 s; subscribed only while the API tab is open |
| `GET /ops/system`, `/ops/jobs/overview`, `/ops/audit/stats`, `/ops/audit` | the existing `useSystem` (2 s on the System tab), `useJobsOverview`, `useAuditStats("action", { action_prefix: "auth." })`, `useAudit({ action: "auth.login.succeeded" })` | as before |

Each tab mounts its own hooks (Radix unmounts inactive tab content), so a
tab polls only while it is open. The ranges are `15m`, `1h`, `6h` and `24h`,
passed as the app's `window`; `fillMinutes` pads the overview's minutes
(only minutes with requests come back) so the chart has one point per
minute. The top-5 cards rank the routes list with `slowestRoutes` (by p95,
routes with at least one request) and `mostFailingRoutes` (by error rate
then server errors, routes without a 5xx don't appear), falling back to the
overview's `top_routes` until the list arrives.

Hit ratios are graded by `hitGrade`: ≥ 0.99 good, ≥ 0.95 ok, else poor; CPU,
memory, disk and connections by `usageGrade` (≥ 90 poor, ≥ 70 ok). The
Database tab links every table and every advice row to the Table Editor
(`/database/tables?schema=&table=`). Explain posts the statement's
normalised text to the SQL editor's `db/sql/explain` (a generic plan where
`$n` placeholders remain) and shows it with Phase 3's `ExplainView`; "Open
in SQL editor" writes the text into the editor's draft (`saveDraft`, read-only
mode) and navigates to `/database/sql`. When `db/statements` answers
`available: false` the tab shows the `reason` and the compose line to add
instead of the table. Sign-ins by method group the last 100
`auth.login.succeeded` events by `metadata.method` (a social provider), else
`mfa_method` (password plus a second factor), else password, because
`/ops/audit/stats` groups by action only.

The System tab keeps the last 60 samples of CPU, the app's CPU and RSS,
memory, goroutines and heap client-side (`addSample`, skipping a sample with
the same `sampled_at` when the poll outran the sampler) for the sparklines.

### Mock

`lib/api/mock/observability.ts` answers every portal endpoint and
`/ops/observability/*`: five services (the app follows the supervisor's
state; PostgreSQL degraded by two lock waits; Mailpit, MinIO and a stopped
collector), a system sample that wanders on every call, `db/stats` with two
sessions waiting on locks (with the blocking PIDs), a statement idle in
transaction for a while and another running, twelve tables, 25 statements
with the River fetch at 60% of the total time (sort and limit apply; Reset
scales the counters down and lets them grow back over five minutes), advice
in every category, and an overview per range with an `overview` event every
5 s on the stream.

## Phase 9: Mail, Environment, flags

Roadmap items 69–72, decided in ADR-0074 in the gorbital repository:
orb dev catches the app's email itself (`cli/internal/devmail`, replacing
Mailpit in `compose.yaml`), renders the app's email previews through the
dev console, and edits `.env` in place; feature flags come from `/ops/flags`.

### Mail (`/mail`)

The inbox orb dev caught, the app's email previews, and the Phase 1
delivery sections, as three tabs (`?tab=inbox|previews|delivery`); the
selected message is `?id=`, the selected preview `?preview=`.

```
components/mail
├── mail.tsx             the page: the tabs and the query-string state; the header's counts ("N caught at 127.0.0.1:1025")
├── inbox.tsx            search (q, a beat after the last key), the list (unread bold, from → to, subject, code chips,
│                        attachment count, snippet, time and size), the live stream, Clear all, and the detail beside it
├── message-detail.tsx   one message: From/To/Cc/Reply-To, the codes bar with copy, the tabs HTML (sandboxed, light/dark),
│                        Text, Source, Headers; the links (open, copy, "bench" for loopback hosts), attachments, envelope; Delete
├── previews.tsx         the previews by category, one rendered for a recipient (HTML in a sandboxed srcdoc frame, text),
│                        copy subject/text, Send to inbox
├── delivery.tsx         the Phase 1 sections: /ops/mail, a test email, the suppression list
└── mailpit-inbox.tsx    the Phase 1 list, shown when this orb dev runs no catcher but the app proxies Mailpit
lib/mail/format.ts       displayAddress(es), formatCode ("483 920"), formatSize, subjectOf, matchesQuery, mergeMessage,
                         groupPreviews / categoryLabel / previewTitle, linkHost
```

**The inbox is the portal's, not the app's.** `useInbox(q)` reads
`GET /_portal/api/mail?q=&limit=100` (`messages` newest first, `total`
matching the search, `count` in the store, `smtp_addr`, `max`); it needs
orb dev, not the running app, so the list survives restarts and a stopped
app. `useMailStream` follows `mail/stream` with `subscribeSSE`: every
`message` event (a `MailSummary`) is folded into each cached list whose
search it matches (`matchesQuery` mirrors the store's search, `mergeMessage`
keeps newest first and the cap) and bumps the counts, so a caught email
appears without a refetch; the list also refetches every 15 s as the
fallback. Reading a message (`GET mail/{id}`) marks it read, as the store
does. The detail's HTML tab fetches `mail/{id}/html` as text and renders
it in an `<iframe sandbox srcdoc>` with the portal's CSP repeated as a
`<meta>` (no scripts, an opaque origin, images and inline styles only):
one code path in live and mock mode, and no frame navigation to an API
path, which some browsers refuse. The light/dark toggle sets the frame's
background and `color-scheme`, for messages that don't set their own.
Source is `mail/{id}/source` as text, fetched when the tab opens. Delete
(`DELETE mail/{id}`) and Clear all (`DELETE mail`) go through
`ConfirmDialog` and update every cached list before the refetch.

**No catcher.** A 404 `no_mail_catcher` (the app sends to Mailpit or a
provider) shows the Phase 1 Mailpit list when the app serves the console,
and otherwise a panel explaining `MAIL_DELIVERY=devmail`. The sidebar's
Mail badge is the catcher's `count`, falling back to Mailpit's total.

**Previews.** `GET /_dev/mail/previews` (through the proxy; needs the
console) lists `{name, description, category}`; `groupPreviews` groups them
by category in the app's order with a label (`auth_verification` → "Auth ·
verification"). Selecting one calls `GET /_dev/mail/preview?name=&to=`
(the "to" field re-renders on Enter or blur; `preview@example.com` by
default). *Send to inbox* posts `/_dev/mail/preview/send?name=&to=` with
the portal's mutation header (the console's one POST endpoint), then
`waitForMessage` asks the inbox every 500 ms (up to 8 s) for a message
newer than the send and the page switches to the Inbox tab with it
selected. A 400 `invalid_address` is a warning toast.

### Environment (`/environment`)

`.env` against `.env.example`, edited in place by orb dev
(`cli/internal/portal/env.go`), joined with what the running app read.

```
components/environment/environment.tsx   the page: the filters (All / Missing n / Secrets / Not in example), search (?q=),
                                         Add key, the banner after a change, the table by prefix, the inline editor, delete
lib/environment/env.ts                   keyNameError (^[A-Za-z_][A-Za-z0-9_]*$), valueError, maskValue / isMasked / shownValue,
                                         readByApp, entryBadges, keyPrefix / groupEntries, filterEntries, missingCount
```

`GET /_portal/api/env` answers `{entries, file, example}`: every key of
`.env.example` in its order, then the keys only `.env` has, each with
`value` (masked by orb dev when `secret`), `set`, `example`, `in_example`,
`missing`, `description` (the comment block above the key in the example)
and `line`. The table groups rows by prefix (`APP`, `AUTH`, `GOOGLE`…) and
shows the badges `missing from .env`, `not in .env.example`, `secret`,
`empty` and `not read by the app` (the key isn't among `/_dev/config`'s
variables; only while the console answers). *Reveal* calls
`GET env/{key}` (never cached; the value stays in component state until
*Hide* or the next save), *Copy* copies a shown value. The inline editor
(pencil, or *Set a value* on a missing key, or *Use the example*) saves on
Enter and cancels on Escape; a masked secret's editor starts empty, so the
current value never reaches the field unrevealed. *Add key* validates the
name as you type and refuses one the file already has. Delete asks first
(`ConfirmDialog`) and sends `unset`. Every write is `PUT env` with
`{set, unset}`; the answer's `entries` replace the cache and
`restart_needed` is always true, so the page shows the banner "The app
reads .env when it starts" with *Restart the app* (`POST app/restart`)
and clears it when the status reports a new `started_at`; `app.problem`
(a build or start failure, which names a refused variable) is shown under
it with a link to the Overview. A 400 `invalid_env_change` is the error
toast; a 404 `no_env_editor` (orb dev outside an app directory) is an
empty state.

### Feature flags (Settings → Feature flags)

The Phase 1 Settings screen showed runtime settings only; `/ops/flags`
was read nowhere but the Modules screen's catalog. The Settings page now
has two tabs (`?tab=flags`, the selected flag in `?flag=`), and the Flags
tab (`components/settings/flags.tsx`) follows the settings patterns: the
table (state in words from `describeFlagState`: "off", "on for everyone",
"25% rollout · 3 targets", the declared state under a modified one; the
`modified`, `client` and `invalid` badges; `vN`), a sheet with the whole
state as a form (`lib/flags/state.ts`: enabled, default, the percentage or
empty for no rollout, users and organisations allow/deny one ID per line;
`stateFromForm` refuses what the flags library would, an ID in both lists
of a rule, a percentage outside 0–100, before sending), a required reason,
*Save as vN+1* (`PUT /ops/flags/{key}` with `state`, `version`, `reason`),
*Reset to declared* (`DELETE`, through `ReasonDialog`) and the history
(`GET …/history`, old state → new state with the reason and the actor).
422 `flag_reason_required` and `invalid_flag_state` land in the sheet;
409 `flag_version_conflict` refetches and says so.

### Mock

`lib/api/mock/mail.ts` holds twelve messages the sample app would have
sent (verification and reset codes, an invitation link, a sign-in notice,
recovery codes with a text attachment, an invoice with a PDF and a CSV and
a Cc, a text-only test message…), built the way the parser would build
them (codes, links from `<a>` and the text, a snippet, headers, the
envelope, a reconstructed source), and answers every endpoint with the
store's codes (`message_not_found`); `mail/stream` is a `ReadableStream`
that emits a `message` event when a preview or the test email is sent
(`deliverMockMail`). The eleven previews render for the given recipient
and refuse an unknown name (`preview_not_found`) or a bad address
(`invalid_address`). `lib/api/mock/env.ts` parses and rewrites an
in-memory `.env` and `.env.example` like orb dev (comments and order kept,
a new key after its example comment, quoting, masking by name) and refuses
bad names and multi-line values with `invalid_env_change`.
`lib/api/mock/flags.ts` keeps four flags (one with a 25 % rollout, two
organisations and a history) with versions, the required reason and the
library's state validation. All three are registered with one dispatch
line each in `mock/index.ts`; `resetMock` resets them.

## What Phase 0 leaves for later

## What Phase 1 leaves for later

- Table sizes and slow queries on the Database page, and the SQL spans of a
  request in the builder, wait for the backend pieces of Phase 2 and Phase 8.
- The request builder's "None" auth mode sends no header, but the proxy
  still adds the dev operator on `/ops` and `/_dev`; a pasted bearer token
  is the way to override it until the proxy learns an opt-out.
- `/_dev/config` (the environment as the app read it) has a type and a
  mock but no page yet.
- The generator endpoints have types and a mock; the job one has a UI
  (Jobs, Phase 6), the resource and migration ones don't yet.
- The version in the shell reads `portal.version` (the orb version); the
  fallback before the portal answers is still `v0.1`.
