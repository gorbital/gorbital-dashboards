"use client";

import { useEffect, useState } from "react";

/**
 * What the panel cycles through: the screens the portal is for, each one a
 * real screenshot of it (docs/dev-portal/screenshots in the gorbital
 * repository).
 */
const SLIDES = [
  {
    tab: "Table Editor",
    title: "Your schema, editable",
    body: "Browse and change tables, columns and rows. Every change leaves as a migration in db/migrations, so the code stays the source of truth.",
    src: "/screens/table-editor.png",
  },
  {
    tab: "SQL Editor",
    title: "SQL, and the migration after it",
    body: "Run a query, read the plan, keep the statement as a snippet — or turn the statement you just ran into a migration.",
    src: "/screens/sql-editor.png",
  },
  {
    tab: "Logs",
    title: "Every request, every line",
    body: "Requests and logs as they happen, filtered and grouped, with the log lines of one request under the request itself.",
    src: "/screens/logs.png",
  },
  {
    tab: "Jobs",
    title: "Jobs you can watch",
    body: "Queues, schedules and what each run did, with the failures kept where you can read them.",
    src: "/screens/jobs.png",
  },
  {
    tab: "Generators",
    title: "The generators orb runs",
    body: "A module, a job, a migration, middleware: the portal plans and applies them through the same code as orb gen, and shows the diff first.",
    src: "/screens/generators.png",
  },
];

const EVERY = 6000;

/**
 * Film grain over the aurora. Generated once as an SVG turbulence and tiled,
 * rather than shipped as an image: it costs no request and no bytes in the
 * bundle, and it is what keeps a wide field of one colour from banding.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * The panel beside the sign-in field: what the Dev Portal is, while you find
 * the token. It advances on its own and stays still for anyone who asked
 * their system not to animate; the indicators move it by hand, and the
 * active one fills over the slide's own time.
 */
export function Showcase() {
  const [at, setAt] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(!!motion?.matches);
    apply();
    motion?.addEventListener?.("change", apply);
    return () => motion?.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (still) return;
    const id = setTimeout(() => setAt((i) => (i + 1) % SLIDES.length), EVERY);
    return () => clearTimeout(id);
  }, [still, at]);

  const slide = SLIDES[at];

  return (
    <aside aria-label="What the Dev Portal shows" className="relative hidden overflow-hidden bg-surface lg:block">
      {/* The aurora: four lights in the product's colours, each drifting on
          its own clock so the background never repeats a pose. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-bg" />
        <div className="absolute left-[-20%] top-[-25%] h-[85%] w-[85%] rounded-full bg-[radial-gradient(circle_at_center,var(--color-primary)_0%,transparent_62%)] opacity-75 blur-[60px] motion-safe:animate-[auroraA_19s_ease-in-out_infinite]" />
        <div className="absolute right-[-15%] top-[10%] h-[75%] w-[75%] rounded-full bg-[radial-gradient(circle_at_center,var(--color-primary-mid)_0%,transparent_60%)] opacity-65 blur-[70px] motion-safe:animate-[auroraB_24s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-25%] left-[10%] h-[80%] w-[80%] rounded-full bg-[radial-gradient(circle_at_center,var(--color-primary-deep)_0%,transparent_65%)] opacity-75 blur-[65px] motion-safe:animate-[auroraC_21s_ease-in-out_infinite]" />
        <div className="absolute bottom-[5%] right-[5%] h-[60%] w-[60%] rounded-full bg-[radial-gradient(circle_at_center,var(--color-primary-soft)_0%,transparent_60%)] opacity-50 blur-[80px] motion-safe:animate-[auroraD_27s_ease-in-out_infinite]" />
        {/* Settles the colour so the words on top keep their contrast. */}
        <div className="absolute inset-0 bg-gradient-to-br from-bg/25 via-transparent to-bg/55" />
        {/* The grain sits over all of it. */}
        <div className="absolute inset-0 opacity-[0.16] mix-blend-overlay" style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat" }} />
      </div>

      <div className="relative flex h-full flex-col gap-6 p-10">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Screens">
          {SLIDES.map((s, i) => (
            <button
              key={s.tab}
              role="tab"
              aria-selected={i === at}
              aria-label={s.tab}
              onClick={() => setAt(i)}
              className={`h-[3px] overflow-hidden rounded-full bg-text/20 transition-all duration-500 ${i === at ? "w-10" : "w-4 hover:bg-text/40"}`}
            >
              {i === at && (
                // Fills over the slide's own time, so the bar is the countdown
                // to the next one. It remounts with the slide, which restarts
                // it; without motion it simply sits full.
                <span key={at} className="block h-full rounded-full bg-text" style={still ? { width: "100%" } : { animation: `slideProgress ${EVERY}ms linear forwards` }} />
              )}
            </button>
          ))}
        </div>

        <div key={at} className="grid gap-2.5 motion-safe:animate-rise">
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary">{slide.tab}</span>
          <h2 className="max-w-[18ch] text-[32px] font-semibold leading-[1.12] tracking-tight text-text">{slide.title}</h2>
          <p className="max-w-[52ch] text-[13px] leading-relaxed text-muted">{slide.body}</p>
        </div>

        {/* The screen, straight on and large, running past the panel's
            bottom corners — the panel crops it, which is what gives the
            page its depth instead of a tilt. Every screenshot is mounted
            from the start and they cross-fade: remounting the img made the
            browser decode it again on each change, which showed as a blank
            frame. */}
        <div className="relative mt-6 flex-1">
          <div className="absolute inset-x-0 top-0 -mx-[9%] w-[118%]">
            <div className="rounded-t-[18px] border border-b-0 border-white/10 bg-black/50 p-2.5 pb-0 shadow-[0_-10px_90px_-20px_rgb(0_0_0/0.8)] backdrop-blur-sm">
              <div className="relative overflow-hidden rounded-t-[10px] ring-1 ring-white/5">
                {SLIDES.map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- a static export has no image optimiser
                  <img
                    key={s.src}
                    src={s.src}
                    alt={i === at ? `The Dev Portal's ${s.tab} screen` : ""}
                    aria-hidden={i === at ? undefined : true}
                    width={1440}
                    height={900}
                    fetchPriority={i === 0 ? "high" : "low"}
                    decoding="async"
                    className={`w-full transition-opacity duration-700 ease-out ${i === 0 ? "block" : "absolute inset-0"} ${i === at ? "opacity-100" : "opacity-0"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideProgress { from { width: 0%; } to { width: 100%; } }
        @keyframes auroraA { 0%,100% { transform: translate3d(0,0,0) scale(1) rotate(0deg); } 33% { transform: translate3d(14%,10%,0) scale(1.18) rotate(22deg); } 66% { transform: translate3d(-6%,16%,0) scale(0.94) rotate(-14deg); } }
        @keyframes auroraB { 0%,100% { transform: translate3d(0,0,0) scale(1.06) rotate(0deg); } 50% { transform: translate3d(-18%,14%,0) scale(0.9) rotate(-26deg); } }
        @keyframes auroraC { 0%,100% { transform: translate3d(0,0,0) scale(0.95) rotate(0deg); } 40% { transform: translate3d(16%,-14%,0) scale(1.2) rotate(18deg); } 75% { transform: translate3d(-10%,-6%,0) scale(1.05) rotate(-10deg); } }
        @keyframes auroraD { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-14%,-18%,0) scale(1.25); } }
      `}</style>
    </aside>
  );
}
