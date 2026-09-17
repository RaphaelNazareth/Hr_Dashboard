import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

export function CandidateExperience() {
  const { t, copy } = useLanguage();
  return (
    <section className="py-16 sm:py-24 md:py-36">
      <div className="container-editorial grid gap-10 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-4">
          <SectionHeading
            eyebrow={t("candidate.eyebrow")}
            title={t("candidate.title")}
            lead={t("candidate.lead")}
            size="md"
          />
          <Reveal delay={1} className="mt-8">
            <Button asChild variant="ink" size="lg">
              <Link to="/apply">
                {t("candidate.cta")} <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </div>

        <ol className="grid gap-px bg-border md:col-span-8 sm:grid-cols-2 lg:grid-cols-3">
          {copy.candidate.steps.map((s, i) => {
            const isLastInRow = (i + 1) % 3 === 0;
            const isLast = i === copy.candidate.steps.length - 1;
            return (
              <Reveal
                as="li"
                key={s.title}
                delay={Math.min(i, 3) as 0 | 1 | 2 | 3}
                className="relative flex flex-col bg-background p-6 md:min-h-[16rem]"
              >
                <span className="font-display text-sm font-semibold tracking-[0.2em] text-brand">
                  0{i + 1}
                </span>
                <h3 className="mt-auto pt-10 font-display text-xl font-semibold tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
                {!isLast && !isLastInRow && (
                  <ArrowRight className="absolute right-4 top-6 hidden size-4 text-muted-foreground md:block" />
                )}
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}