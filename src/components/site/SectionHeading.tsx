import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  lead,
  tone = "ink",
  align = "left",
  className,
  size = "lg",
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  tone?: "ink" | "paper";
  align?: "left" | "center";
  className?: string;
  size?: "lg" | "md";
}) {
  return (
    <Reveal className={cn(align === "center" && "mx-auto text-center", "max-w-3xl", className)}>
      {eyebrow && (
        <p className={cn("eyebrow mb-5", tone === "paper" && "text-ink-muted")}>{eyebrow}</p>
      )}
      <h2 className={cn(size === "lg" ? "display-lg" : "display-md", "text-balance-pretty")}>
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            "mt-6 max-w-xl text-base leading-relaxed md:text-lg",
            tone === "paper" ? "text-ink-muted" : "text-muted-foreground",
            align === "center" && "mx-auto",
          )}
        >
          {lead}
        </p>
      )}
    </Reveal>
  );
}
