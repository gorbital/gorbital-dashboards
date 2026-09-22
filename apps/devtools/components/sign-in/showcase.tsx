"use client";

import { useEffect, useRef, useState } from "react";

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
  const paused = useRef(false);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(!!motion?.matches);
    apply();
    motion?.addEventListener?.("change", apply);
    return () => motion?.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (still) return;
    const id = setInterval(() => {
      if (!paused.current) setAt((i) => (i + 1) % SLIDES.length);
    }, EVERY);
    return () => clearInterval(id);
  }, [still]);

  const slide = SLIDES[at];

  return (
    <aside
      aria-label="What the Dev Portal shows"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      className="relative hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block"
    >
      {/* The light behind it: two slow blooms in the product's own colour. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-primary/20 blur-3xl motion-safe:animate-[bloom_14s_ease-in-out_infinite]" />
        <div className="absolute -bottom-32 -right-16 h-[380px] w-[380px] rounded-full bg-primary-deep/35 blur-3xl motion-safe:animate-[bloom_18s_ease-in-out_infinite_reverse]" />
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-bg/70" />
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
              className={`h-[3px] rounded-full transition-all duration-500 ${i === at ? "w-8 bg-text" : "w-4 bg-text/25 hover:bg-text/40"}`}
            />
          ))}
        </div>

        <div key={at} className="grid gap-2.5 motion-safe:animate-rise">
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary">{slide.tab}</span>
          <h2 className="max-w-[18ch] text-[32px] font-semibold leading-[1.12] tracking-tight text-text">{slide.title}</h2>
          <p className="max-w-[52ch] text-[13px] leading-relaxed text-muted">{slide.body}</p>
        </div>

        {/* The screen itself, tilted and running off the edge. */}
        <div className="relative mt-2 flex-1" style={{ perspective: "1400px" }}>
          <div
            key={`shot-${at}`}
            className="absolute -right-16 top-0 w-[820px] overflow-hidden rounded-xl border border-border shadow-2xl motion-safe:animate-rise"
            style={{ transform: "rotateX(4deg) rotateY(-16deg) rotateZ(1deg)", transformOrigin: "left center" }}
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

      <style>{`@keyframes bloom { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(24px,-18px,0) scale(1.12); } }`}</style>
    </aside>
  );
}
