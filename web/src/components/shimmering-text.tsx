import { cn } from "@/lib/utils";

export function ShimmeringText({
  text = "Loading",
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden={!text.trim()}
      className={cn(
        "animate-shimmer bg-clip-text text-transparent",
        "bg-[linear-gradient(100deg,var(--muted-foreground)_20%,var(--foreground)_50%,var(--muted-foreground)_80%)]",
        "bg-[length:200%_100%]",
        className
      )}
    >
      {text}
    </span>
  );
}