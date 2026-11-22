/** Marque Cavalel : un escalier de progression traversé par un saut de
 *  cavalier (flèche en L) vers un objectif. Monochrome, lisible en petit. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 54h14V42h14V30h14V18" opacity={0.55} />
      <path d="M10 54V42h14V30h14" />
      <path d="M38 24l8 6-8 6" />
      <rect
        x="42"
        y="10"
        width="10"
        height="10"
        rx="2"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
        <LogoMark className="h-5 w-5" />
      </span>
      <span className="text-base font-semibold tracking-tight">Cavalel</span>
    </span>
  );
}
