"use client";

import { useEffect, useState } from "react";

/**
 * What the panel cycles through: the screens the portal is for, each one a
 * real screenshot of it (docs/dev-portal/screenshots in the gorbital
 * repository, resized for the bundle).
 */
const SLIDES = [
  {
    tab: "Table Editor",
    title: "Your schema, editable",
    body: "Browse and change tables, columns and rows. Every change leaves as a migration in db/migrations, so the code stays the source of truth.",
    src: "/screens/table-editor.jpg",
  },
  {
    tab: "SQL Editor",
    title: "SQL, and the migration after it",
    body: "Run a query, read the plan, keep the statement as a snippet — or turn the statement you just ran into a migration.",
    src: "/screens/sql-editor.jpg",
  },
  {
    tab: "Logs",
    title: "Every request, every line",
    body: "Requests and logs as they happen, filtered and grouped, with the log lines of one request under the request itself.",
    src: "/screens/logs.jpg",
  },
  {
    tab: "Jobs",
    title: "Jobs you can watch",
    body: "Queues, schedules and what each run did, with the failures kept where you can read them.",
    src: "/screens/jobs.jpg",
  },
  {
    tab: "Generators",
    title: "The generators orb runs",
    body: "A module, a job, a migration, middleware: the portal plans and applies them through the same code as orb gen, and shows the diff first.",
    src: "/screens/generators.jpg",
  },
];

const EVERY = 6000;

/**
 * The panel beside the sign-in field: what the Dev Portal is, while you find
 * the token. It advances on its own and stops for anyone who asked their
 * system not to animate; the dots move it by hand, and hovering holds it.
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
      {/* The aurora: four lights in the product's colours, each drifting on its
          own clock so the background never repeats a pose. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-bg" />
        <div className="absolute left-[-20%] top-[-25%] h-[85%] w-[85%] rounded-full bg-[radial-gradient(circle_at_center,var(--color-primary)_0%,transparent_62%)] opacity-75 blur-[60px] motion-safe:animate-[auroraA_19s_ease-in-out_infinite]" />
        <div className="absolute right-[-15%] top-[10%] h-[75%] w-[75%] rounded-full bg-[radial-gradient(circle_at_center,var(--color-primary-mid)_0%,transparent_60%)] opacity-65 blur-[70px] motion-safe:animate-[auroraB_24s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-25%] left-[10%] h-[80%] w-[80%] rounded-full bg-[radial-gradient(circle_at_center,var(--color-primary-deep)_0%,transparent_65%)] opacity-75 blur-[65px] motion-safe:animate-[auroraC_21s_ease-in-out_infinite]" />
        <div className="absolute bottom-[5%] right-[5%] h-[60%] w-[60%] rounded-full bg-[radial-gradient(circle_at_center,var(--color-primary-soft)_0%,transparent_60%)] opacity-50 blur-[80px] motion-safe:animate-[auroraD_27s_ease-in-out_infinite]" />
        {/* Settles the colour so the words on top keep their contrast. */}
        <div className="absolute inset-0 bg-gradient-to-br from-bg/25 via-transparent to-bg/55" />
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
                <span
                  key={at}
                  className="block h-full rounded-full bg-text"
                  style={still ? { width: "100%" } : { animation: `slideProgress ${EVERY}ms linear forwards` }}
                />
              )}
            </button>
          ))}
        </div>

        <div key={at} className="grid gap-2.5 motion-safe:animate-rise">
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary">{slide.tab}</span>
          <h2 className="max-w-[18ch] text-[32px] font-semibold leading-[1.12] tracking-tight text-text">{slide.title}</h2>
          <p className="max-w-[52ch] text-[13px] leading-relaxed text-muted">{slide.body}</p>
        </div>

        {/* The screen itself, tilted and running off the edge. */}
        <div className="relative mt-2 flex-1 px-2" style={{ perspective: "1600px" }}>
          <div
            key={`shot-${at}`}
            className="absolute inset-x-0 top-0 overflow-hidden rounded-xl border border-border shadow-2xl motion-safe:animate-rise"
            style={{ transform: "rotateX(3deg) rotateY(-11deg) rotateZ(0.6deg) scale(0.97)", transformOrigin: "center center" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a static export has no image optimiser */}
            <img
              src={slide.src}
              alt={`The Dev Portal's ${slide.tab} screen`}
              width={1100}
              height={688}
              className="block w-full"
              loading="lazy"
              decoding="async"
            />
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
