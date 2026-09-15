/** The four-bar apistock mark. Used in every shell and the product switcher. */
export function Mark({ className = "h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16.6 14" className={`${className} w-auto shrink-0`} aria-hidden="true">
      <rect x="2.6" y="0" width="14" height="3" fill="#d8ff3e" />
      <rect x="0" y="3.6667" width="14" height="3" fill="#f0efe9" />
      <rect x="0" y="7.3333" width="14" height="3" fill="#6b6b63" />
      <rect x="0" y="11" width="14" height="3" fill="#3a3a34" />
    </svg>
  );
}
