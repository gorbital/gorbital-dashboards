# apistock-dashboards

The three tools built around apistock, one Next.js app each, sharing one
theme and one component package. Mock data only for now: every screen
renders from `apps/*/lib/mock.ts`, nothing calls a backend.

| App | Product | What it is | Address | Port |
|---|---|---|---|---|
| `apps/devtools` | **bench** | devtools: inspect the app on your bench while `aps dev` runs it | bench.apistock.dev | 3100 |
| `apps/observe` | **gauge** | observability: requests, traces, errors, jobs, mail and logs from the data the app already sends | gauge.apistock.dev | 3200 |
| `apps/deploy` | **ship** | deploy: releases, rollouts, migrations, the fleet and its health | ship.apistock.dev | 3300 |

The folder and package names (`devtools`, `observe`, `deploy`) are the
stable identifiers; the product names live in one place,
`packages/ui/lib/products.ts`, and every shell, title and switcher reads
them from there. Rename a product by editing that file.

`packages/ui` (`@apistock/dash`) holds the dashboard shell (sidebar, page
header, product switcher), the primitives (tiles, panels, tables, badges,
pills, buttons, code blocks) and the SVG charts (sparkline, area, stacked
bars, donut, heatmap, trace waterfall). Colours match
`apistock-web/packages/ui/theme.css`; change both when changing a colour.

## Screens

**bench** · Routes (explorer with a request builder that uses your session),
Modules (the wiring in `internal/app`, drawn from source), Bootstrap
(startup timeline per constructor), Audit (architectural lint), Jobs (run
any definition now), Mail (the outbox `aps dev` captured), Settings
(runtime settings with history), Database (migrations, tables, slow queries).

**gauge** · Overview, Requests (latency heatmap), Traces and a trace
waterfall, Errors grouped by cause, Jobs and queues, Mail, Logs, Instances,
Retention, API keys.

**ship** · Overview (the rollout in progress), Releases and a release
pipeline (build → test → migrate → roll out → verify, with the log),
Environments, Instances, Migrations by environment, Health (90-day uptime),
History, Providers, Notifications.

## Run

Requires Node 22 and pnpm 10.

```bash
pnpm install
pnpm devtools dev            # http://localhost:3100
pnpm observe dev             # http://localhost:3200
pnpm deploy dev              # http://localhost:3300
pnpm dev                     # all three
pnpm build                   # static export of every app into apps/*/out
pnpm typecheck
```

## Landing page screenshots

`apistock-web/scripts/render-dashboards.mjs` screenshots the three running
apps into the landing page's product cards. Run it after a visual change.

## Repositories and deploys

Like apistock-web: `origin` fetches from `apistockhq/apistock-dashboards`
and pushes to both it and the personal mirror
`muhammadqazi/apistock-dashboards`. Each app is its own Vercel project with
the root directory set to `apps/<name>`.

```bash
git remote set-url --add --push origin git@github.com:apistockhq/apistock-dashboards.git
git remote set-url --add --push origin git@github.com:muhammadqazi/apistock-dashboards.git
```
