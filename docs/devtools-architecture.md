# Dev Portal architecture

How `apps/devtools` is put together after Phase 0 (foundations): the data
layer, what the UI knows about authentication, mock mode, the primitives it
builds on, and how to add a page. The phase plan lives in the gorbital
repository at `docs/dev-portal-roadmap.md`; the backend it talks to is
`cli/internal/portal` (the portal API) and `modules/devconsole` (the app's
dev console, ADR-0065).

## The shape of the app

```
apps/devtools
├── app/                    App Router pages; server components that render one client component each
│   ├── layout.tsx          fonts, the Shell, the DevtoolsProvider around everything
│   ├── page.tsx            Overview (live)
│   └── routes|modules|…    the other screens (mock, for now)
├── components/
│   ├── overview/           Overview, OutputConsole, ConnectionProblem
│   ├── app-chip.tsx        the shell's app chip, live
│   ├── portal-version.tsx  the shell's version, live
│   ├── search.tsx          the ⌘K palette's items (pages, routes, app actions)
│   └── sidebar-nav.tsx     the nav; Overview gets a live dot while the app runs
└── lib/
    ├── mock.ts             sample data for every page and for mock mode
    ├── use-now.ts          a ticking clock for uptimes
    └── api/                the data layer (below)
```

The build is a static export (`output: "export"`): every page prerenders as
HTML with skeletons, and the browser fills it in from the API. `orb dev`
serves `out/` at `http://127.0.0.1:3100` and resolves `/routes` to
`routes.html`, so links need no trailing slash.

## The data layer (`lib/api/`)

| File | What it is |
|---|---|
| `types.ts` | Hand-written TypeScript for everything the UI reads: the portal API (`Status`, `AppStatus`, `OutputLine`, `PortalEvent`, generators) and the dev console (`DevApp`, `DevRouteList`, `DevRequestList`, `DevLogList`, `DevConfigList`, `DevMigrations`, `DevJobRunList`, `DevMail`), matching the Go types and `modules/devconsole/openapi.json` field for field. Errors are `Problem` (RFC 9457). |
| `client.ts` | `apiFetch<T>(path, init)`: same-origin fetch with the cookie, the `X-Orb-Portal: 1` header on anything but GET/HEAD, JSON in and out. A problem response becomes `ApiError { status, code, detail, title, unauthorized }`; a request that never gets an answer becomes `NotConnectedError`. `subscribeEvents(onEvent, onStatus)`: the SSE subscription (below). |
| `sse.ts` | `createSSEParser`: an incremental `text/event-stream` parser (any chunking, multi-line `data:`, comments, CRLF). `readSSE`: drives it from a `ReadableStream` until the stream ends or a signal aborts. |
| `store.ts` | The console store: the latest `AppStatus` from the stream, the output tail (capped at 2,000 lines like orb's own buffer), the dropped count and the connection state, read with `useConsole()` (`useSyncExternalStore`). `mergeLines` folds `/output` into what the stream delivered without duplicates and in time order. |
| `queries.ts` | React Query hooks: `useStatus` (every 5 s), `useOutput`, `useDevApp`, `useDevRoutes`, `useReadiness` (`/readyz` every 10 s while running), and `useAppAction("restart" \| "stop" \| "start")` with toasts. Nothing is retried that won't change on its own (not connected, 4xx). |
| `provider.tsx` | `DevtoolsProvider`: the `QueryClient`, the `Toaster`, the `TooltipProvider`, and the one events subscription for the whole app. |
| `mode.ts` | `dataMode()`: `"live"` or `"mock"` (below). |
| `mock/index.ts` | The in-memory `orb dev` for mock mode. |

### Live state: how a change reaches the page

1. `DevtoolsProvider` calls `subscribeEvents` once. It fetches
   `/_portal/api/events` with `fetch` (not `EventSource`: the cookie's
   protections and reconnect policy stay under our control) and reads the
   body with `readSSE`.
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
`/output`, `/events`, the three app actions (with the same 409 refusals and
the same `X-Orb-Portal` check), the generator `plan`/`apply` endpoints, and
`/_portal/app/readyz` plus every `/_dev/*` endpoint, all from
`lib/mock.ts` (`portalStatus`, `outputLines`, `devApp`, `devRoutes`,
`devConfig`, `devRequests`, `devLogs`, `devMigrations`, `devJobRuns`,
`devMail`). Its events endpoint returns a real `ReadableStream` in SSE
format (a state event, then an output line every 4 s while the app "runs"),
so the parser, the store and the reconnect logic run the same code in both
modes. Restart takes 1.8 s and goes through `building`; Stop and Start
change the state at once. Responses are `Response` objects with the right
content types, so `apiFetch`'s error handling is exercised too.

The public demo builds with `NEXT_PUBLIC_DEVTOOLS_DATA=mock`
(`apps/devtools/vercel.json`).

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
| `shell.tsx` | `Shell`, `AppChip`, `SearchButton` | `appChip` and `search` props take client components; `version` is a `ReactNode` |
| `nav.tsx` | `Nav` | `tone: "live"` renders a pulsing dot |

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
   client component from `components/<name>/`. Render skeletons
   (`Tile loading`, `Table loading`, `SkeletonLines`) while `isPending`,
   `Empty` for no data, and `ConnectionProblem` when `error` is set and
   there's no data, so the prerender and the first client render agree.
5. **Nav and palette.** Add the entry to `components/sidebar-nav.tsx` and the
   page to `components/search.tsx`.
6. **Tests.** Pure logic (parsers, merges, transports) gets a `*.test.ts` next
   to it; `pnpm --filter devtools test` runs vitest in the node environment.

## What Phase 0 leaves for later

- The Routes, Modules, Bootstrap, Audit, Jobs, Mail, Settings and Database
  pages still render from `lib/mock.ts`; their live versions read
  `/_dev/routes`, `/_dev/app`, `/_dev/jobs`, `/_dev/mail`, `/_dev/config` and
  `/_dev/migrations` through the hooks and shapes that now exist.
- The generator endpoints have types and a mock but no UI.
- The version in the shell reads `portal.version` (the orb version); the
  fallback before the portal answers is still `v0.1`.
