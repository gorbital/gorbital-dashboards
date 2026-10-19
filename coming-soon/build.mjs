// Builds the coming-soon page each product subdomain serves while its hosted
// demo is down: out/<id>/ for devtools, observe and deploy.
//
//   node coming-soon/build.mjs
//   npx -y wrangler@4 deploy --config coming-soon/wrangler.<id>.jsonc
//
// To bring a demo back, deploy its app again: pnpm --filter <id> run cf:deploy.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const apps = path.resolve(here, "../apps");

const PRODUCTS = [
  { id: "devtools", name: "Dev Portal", tagline: "Inspect the app on your bench while orb dev runs it.", page: "https://www.gorbital.dev/devtools", docs: "https://docs.gorbital.dev/dev-portal/" },
  { id: "observe", name: "Observability Portal", tagline: "Requests, traces, jobs and errors from the data your app already sends.", page: "https://www.gorbital.dev/observe", docs: "https://docs.gorbital.dev/" },
  { id: "deploy", name: "Deployment Portal", tagline: "Releases, rollouts, migrations and the fleet, from commit to running instance.", page: "https://www.gorbital.dev/deploy", docs: "https://docs.gorbital.dev/" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const page = (p) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name)} · coming soon · gorbital</title>
<meta name="description" content="${esc(p.name)} for gorbital is coming soon. ${esc(p.tagline)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${p.page}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0B0C0A" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f2f1ec" media="(prefers-color-scheme: light)">
<style>
  :root { --bg: #0B0C0A; --text: #F2F1EC; --muted: rgba(242,241,236,.62); --line: rgba(242,241,236,.14); --accent: #C6F24A; --on-accent: #0B0C0A; color-scheme: dark; }
  @media (prefers-color-scheme: light) { :root { --bg: #f2f1ec; --text: #0b0c0a; --muted: rgba(11,12,10,.62); --line: rgba(11,12,10,.14); --accent: #5c7a12; --on-accent: #f2f1ec; color-scheme: light; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { background: var(--bg); color: var(--text); font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; min-height: 100vh; }
  body::before { content: ""; position: fixed; inset: 0; pointer-events: none; background: radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%); }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  header, main, footer { position: relative; width: 100%; max-width: 760px; margin: 0 auto; padding: 0 24px; }
  header { padding-top: 28px; }
  .logo { display: inline-flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-weight: 700; font-size: 22px; letter-spacing: -.04em; }
  .logo svg { width: 26px; height: 26px; }
  main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-top: 64px; padding-bottom: 64px; }
  .kicker { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: 0 0 20px; }
  h1 { font-size: clamp(40px, 9vw, 76px); line-height: 1.04; letter-spacing: -.03em; font-weight: 600; margin: 0; }
  h1 span { color: var(--accent); }
  .tagline { font-size: 15px; color: var(--muted); max-width: 520px; margin: 24px 0 40px; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px; border-radius: 999px; font-size: 14px; font-weight: 600; text-decoration: none; border: 1px solid var(--line); color: var(--text); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .btn:hover { border-color: var(--accent); }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  footer { padding-bottom: 28px; font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  footer a { color: inherit; }
</style>
</head>
<body>
<header>
  <a class="logo" href="https://www.gorbital.dev" aria-label="gorbital home">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs><mask id="m"><rect width="120" height="120" fill="#fff"/><rect x="52" y="2" width="16" height="116" fill="#000" transform="rotate(34 60 60)"/></mask></defs>
      <circle cx="60" cy="60" r="42" fill="none" stroke="currentColor" stroke-width="14" mask="url(#m)"/>
      <rect x="54" y="6" width="12" height="108" fill="var(--accent)" transform="rotate(34 60 60)"/>
    </svg>
    gorbital
  </a>
</header>
<main>
  <p class="kicker mono">{ ${p.id}.gorbital.dev }</p>
  <h1>${esc(p.name)}<br><span>coming soon.</span></h1>
  <p class="tagline mono">${esc(p.tagline)}</p>
  <div class="actions">
    <a class="btn primary" href="${p.page}">About the ${esc(p.name)}</a>
    <a class="btn" href="${p.docs}">Read the docs</a>
    <a class="btn" href="https://github.com/gorbital/gorbital">GitHub</a>
  </div>
</main>
<footer class="mono">
  <span>gorbital, the Go framework for production APIs</span>
  <a href="https://www.gorbital.dev">www.gorbital.dev</a>
</footer>
</body>
</html>
`;

// Search engines may follow links, AI crawlers stay out (same list as packages/ui/lib/ai-crawlers.ts).
const robots = (ai) => `User-Agent: ${ai.join("\nUser-Agent: ")}\nDisallow: /\n\nUser-Agent: *\nAllow: /\n`;

const { AI_CRAWLERS } = await import(path.resolve(here, "../packages/ui/lib/ai-crawlers.ts"));

for (const p of PRODUCTS) {
  const out = path.join(here, "out", p.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "index.html"), page(p));
  writeFileSync(path.join(out, "robots.txt"), robots(AI_CRAWLERS));
  writeFileSync(path.join(out, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n  Cache-Control: public, max-age=300\n");
  for (const f of ["favicon.svg", "favicon-32x32.png", "apple-touch-icon.png"]) cpSync(path.join(apps, p.id, "public", f), path.join(out, f));
  writeFileSync(
    path.join(here, `wrangler.${p.id}.jsonc`),
    `// ${p.id}.gorbital.dev while its demo is down: the coming-soon page on every path.
// Generated by build.mjs. Deploy: npx -y wrangler@4 deploy --config coming-soon/wrangler.${p.id}.jsonc
{
  "name": "gorbital-${p.id}",
  "compatibility_date": "2026-10-01",
  "workers_dev": true,
  "assets": {
    "directory": "./out/${p.id}",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "single-page-application"
  },
  "routes": [{ "pattern": "${p.id}.gorbital.dev", "custom_domain": true }]
}
`,
  );
  console.log(`coming-soon: wrote out/${p.id}`);
}
