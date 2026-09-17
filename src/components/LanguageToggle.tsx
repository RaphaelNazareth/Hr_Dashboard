import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";

export function LanguageToggle({
  tone = "ink",
  className,
}: {
  tone?: "ink" | "paper";
  className?: string;
}) {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border p-0.5 text-[0.7rem] font-semibold tracking-wide",
        tone === "paper"
          ? "border-ink-foreground/30 text-ink-foreground"
          : "border-border bg-background/80 text-foreground",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          locale === "en"
            ? tone === "paper"
              ? "bg-ink-foreground text-ink"
              : "bg-ink text-ink-foreground"
            : tone === "paper"
              ? "text-ink-foreground/70 hover:text-ink-foreground"
              : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("id")}
        aria-pressed={locale === "id"}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          locale === "id"
            ? tone === "paper"
              ? "bg-ink-foreground text-ink"
              : "bg-ink text-ink-foreground"
            : tone === "paper"
              ? "text-ink-foreground/70 hover:text-ink-foreground"
              : "text-muted-foreground hover:text-foreground",
        )}
      >
        ID
      </button>
    </div>
  );
}
