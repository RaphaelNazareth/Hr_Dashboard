import { Link } from "react-router-dom";
import { brand } from "@/data/site";
import { cn } from "@/lib/utils";

/**
 * PLACEHOLDER WORDMARK.
 * Swap the text for the approved corporate logo (SVG) when brand assets are
 * released. Keep the "Careers" suffix to distinguish this from the main site.
 */
export function Wordmark({ tone = "ink", className }: { tone?: "ink" | "paper"; className?: string }) {
  return (
    <Link
      to="/"
      aria-label={`${brand.wordmark} ${brand.suffix} — home`}
      className={cn(
        "group inline-flex items-baseline gap-2 font-display",
        tone === "ink" ? "text-ink" : "text-ink-foreground",
        className,
      )}
    >
      <span className="text-[1.15rem] font-bold tracking-[0.08em]">{brand.wordmark}</span>
      <span
        className={cn(
          "text-[0.95rem] font-medium tracking-tight",
          tone === "ink" ? "text-muted-foreground" : "text-ink-muted",
        )}
      >
        {brand.suffix}
      </span>
      <span className="ml-0.5 inline-block size-1.5 translate-y-[-1px] rounded-full bg-brand transition-transform duration-500 group-hover:scale-150" />
    </Link>
  );
}
