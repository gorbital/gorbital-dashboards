# gorbital-dashboards

The three tools built around gorbital, one Next.js app each, sharing one
theme and one component package.

| App | Product | What it is | Address | Port |
|---|---|---|---|---|
| `apps/devtools` | **Dev Portal** | inspect the app on your bench while `orb dev` runs it | devtools.gorbital.dev | 3100 (served by `orb dev`) · 3101 (`next dev`) |
| `apps/observe` | **Observability Portal** | requests, traces, errors, jobs, mail and logs from the data the app already sends | observe.gorbital.dev | 3200 |
| `apps/deploy` | **Deployment Portal** | releases, rollouts, migrations, the fleet and its health | deploy.gorbital.dev | 3300 |

The folder and package names (`devtools`, `observe`, `deploy`) are the
stable identifiers; the product names live in one place,
`packages/ui/lib/products.ts`, and every shell, title and switcher reads
them from there. Rename a product by editing that file.

`packages/ui` (`@gorbital/dash`) holds the dashboard shell in three variants
(`boxed` for Dev Portal, `docked` for Observability, `rail` for Deployment),
the page header, the product switcher, the primitives (tiles, panels, tables,
badges, pills, buttons, code blocks, inputs, dialogs, sheets, dropdowns, tabs,
tooltips, toasts, the ⌘K palette, spinners and skeletons) and the SVG charts
(sparkline, area, stacked bars, donut, heatmap, trace waterfall). Colours
match `gorbital-web/packages/ui/theme.css`; change both when changing a
colour.

## Live data and mock data

The Observability and Deployment portals render from `apps/*/lib/mock.ts`
only; nothing there calls a backend yet.

The Dev Portal has a data layer (`apps/devtools/lib/api/`, described in
[docs/devtools-architecture.md](docs/devtools-architecture.md)) that reads
`orb dev`'s portal API on the same origin. It runs in one of two modes:

| Mode | Where the data comes from | When |
|---|---|---|
| `live` | `/_portal/api/*` and `/_portal/app/*` on the page's own origin: the `orb dev` that serves the export, or the Next dev server's proxy to it | the default |
| `mock` | an in-memory `orb dev` (`lib/api/mock/`) answering the same endpoints from `lib/mock.ts`, with a simulated event stream | the public demo on Vercel, offline work, tests |

The build sets the default with `NEXT_PUBLIC_DEVTOOLS_DATA=mock|live`
(`apps/devtools/vercel.json` sets `mock` so devtools.gorbital.dev keeps
showing sample data). A browser overrides it at any time:

```js
localStorage.devtoolsData = "mock"   // or "live"; then reload
```

Today the Overview page, the app chip and the version in the shell are
live; the other Dev Portal pages still render from `lib/mock.ts` and will
move over page by page.

## Run

Requires Node 22 and pnpm 10.

```bash
pnpm install
pnpm devtools dev            # http://localhost:3101 (see below)
pnpm observe dev             # http://localhost:3200
pnpm deploy dev              # http://localhost:3300
pnpm dev                     # all three
pnpm build                   # static export of every app into apps/*/out
pnpm typecheck
pnpm test                    # vitest, currently apps/devtools only
```

### Working on the Dev Portal against a real `orb dev`

`orb dev` serves the Dev Portal's static export at `http://127.0.0.1:3100`
and its API under `/_portal/` on that origin (the export is bundled into
`orb` by `gorbital/scripts/sync-portal.sh`). While you work on the UI you
run the Next dev server on **3101** instead, and it proxies `/_portal/*` to
`orb dev`:

```bash
# terminal 1, in a gorbital app
orb dev                      # prints  ✓ Dev Portal  http://127.0.0.1:3100/_portal/auth?t=<token>

# terminal 2, here
pnpm devtools dev            # http://localhost:3101, proxies /_portal/* to http://127.0.0.1:3100
```

Then sign in **on the dev server's origin**: take the link `orb dev`
printed and open it as `http://localhost:3101/_portal/auth?t=<token>`. The
portal sets its `orb_portal` cookie for `localhost`, the browser sends it
with every proxied request, and the page goes live. (The cookie the printed
link sets on `127.0.0.1` doesn't reach `localhost`; that's why the origin
matters.) Set `ORB_PORTAL_URL` to proxy somewhere other than
`http://127.0.0.1:3100`.

The proxy is a Next rewrite added only in the development phase
(`apps/devtools/next.config.ts`), because `output: "export"` can't carry
rewrites; the exported build talks to whatever origin serves it. Without an
`orb dev` the page shows how to start one, and `localStorage.devtoolsData =
"mock"` shows the sample data instead.

## Screens

**Dev Portal** · Overview (the app's state, project, links, readiness, the
dev console summary and a live output console with Restart / Stop / Start),
Routes (explorer with a request builder that uses your session), Modules
(the wiring in `internal/app`, drawn from source), Bootstrap (startup
timeline per constructor), Audit (architectural lint), Jobs (run any
definition now), Mail (the outbox `orb dev` captured), Settings (runtime
settings with history), Database (migrations, tables, slow queries).

**Observability Portal** · Overview, Requests (latency heatmap), Traces and a trace
waterfall, Errors grouped by cause, Jobs and queues, Mail, Logs, Instances,
Retention, API keys.

**Deployment Portal** · Overview (the rollout in progress), Releases and a release
pipeline (build → test → migrate → roll out → verify, with the log),
Environments, Instances, Migrations by environment, Health (90-day uptime),
History, Providers, Notifications.

## Landing page screenshots

`gorbital-web/scripts/render-dashboards.mjs` screenshots the three running
apps into the landing page's product cards. Run it after a visual change.
The Dev Portal now runs on 3101 in development, so point the script there:
`DEVTOOLS_URL=http://localhost:3101`, with `localStorage.devtoolsData` unset
or `mock` so the shots show sample data rather than a "not connected" panel.

## Repositories and deploys

Like gorbital-web: `origin` fetches from `gorbital/gorbital-dashboards`
and pushes to both it and the personal mirror
`muhammadqazi/gorbital-dashboards`. Each app is its own Vercel project with
the root directory set to `apps/<name>`.

```bash
git remote set-url --add --push origin git@github.com:gorbital/gorbital-dashboards.git
git remote set-url --add --push origin git@github.com:muhammadqazi/gorbital-dashboards.git
```
