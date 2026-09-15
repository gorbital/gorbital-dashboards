# gorbital-dashboards

The three tools built around gorbital, one Next.js app each, sharing one
theme and one component package. Mock data only for now: every screen
renders from `apps/*/lib/mock.ts`, nothing calls a backend.

| App | Product | What it is | Address | Port |
|---|---|---|---|---|
| `apps/devtools` | **Dev Portal** | inspect the app on your bench while `orb dev` runs it | devtools.gorbital.dev | 3100 |
| `apps/observe` | **Observability Portal** | requests, traces, errors, jobs, mail and logs from the data the app already sends | observe.gorbital.dev | 3200 |
| `apps/deploy` | **Deployment Portal** | releases, rollouts, migrations, the fleet and its health | deploy.gorbital.dev | 3300 |

The folder and package names (`devtools`, `observe`, `deploy`) are the
stable identifiers; the product names live in one place,
`packages/ui/lib/products.ts`, and every shell, title and switcher reads
them from there. Rename a product by editing that file.

`packages/ui` (`@gorbital/dash`) holds the dashboard shell in three variants
(`boxed` for Dev Portal, `docked` for Observability, `rail` for Deployment),
the page header, the product switcher, the primitives (tiles, panels, tables, badges,
pills, buttons, code blocks) and the SVG charts (sparkline, area, stacked
bars, donut, heatmap, trace waterfall). Colours match
`gorbital-web/packages/ui/theme.css`; change both when changing a colour.

## Screens

**Dev Portal** · Routes (explorer with a request builder that uses your session),
Modules (the wiring in `internal/app`, drawn from source), Bootstrap
(startup timeline per constructor), Audit (architectural lint), Jobs (run
any definition now), Mail (the outbox `orb dev` captured), Settings
(runtime settings with history), Database (migrations, tables, slow queries).

**Observability Portal** · Overview, Requests (latency heatmap), Traces and a trace
waterfall, Errors grouped by cause, Jobs and queues, Mail, Logs, Instances,
Retention, API keys.

**Deployment Portal** · Overview (the rollout in progress), Releases and a release
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

`gorbital-web/scripts/render-dashboards.mjs` screenshots the three running
apps into the landing page's product cards. Run it after a visual change.

## Repositories and deploys

Like gorbital-web: `origin` fetches from `gorbital/gorbital-dashboards`
and pushes to both it and the personal mirror
`muhammadqazi/gorbital-dashboards`. Each app is its own Vercel project with
the root directory set to `apps/<name>`.

```bash
git remote set-url --add --push origin git@github.com:gorbital/gorbital-dashboards.git
git remote set-url --add --push origin git@github.com:muhammadqazi/gorbital-dashboards.git
```
