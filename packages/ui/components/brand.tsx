/** The gorbital mark: a ring cut by the import-path slash, 34° tilt. The ring takes the theme's text colour, so it works on either ground; the slash is a lime fill. */
export function Mark({ className = "h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={`${className} w-auto shrink-0`} aria-hidden="true">
      <defs>
        <mask id="gorbital-slash">
          <rect width="120" height="120" fill="#fff" />
          <rect x="52" y="2" width="16" height="116" fill="#000" transform="rotate(34 60 60)" />
        </mask>
      </defs>
      <circle cx="60" cy="60" r="42" fill="none" stroke="var(--color-text)" strokeWidth="14" mask="url(#gorbital-slash)" />
      <rect x="54" y="6" width="12" height="108" fill="#C6F24A" transform="rotate(34 60 60)" />
    </svg>
  );
}
