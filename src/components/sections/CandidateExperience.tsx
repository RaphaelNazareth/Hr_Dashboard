import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { candidateSteps } from "@/data/culture";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { Button } from "@/components/ui/button";

export function CandidateExperience() {
  return (
    <section className="py-24 md:py-36">
      <div className="container-editorial grid gap-12 md:grid-cols-12">
        <div className="md:col-span-4">
          <SectionHeading
            eyebrow="Candidate experience"
            title="Your application, all in one place."
            lead="Sign in with your email to view open jobs, apply, and follow your application's progress — no password needed."
            size="md"
          />
          <Reveal delay={1} className="mt-8">
            <Button asChild variant="ink" size="lg">
              <Link to="/apply">
                Candidate Portal <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </div>

        <ol className="grid gap-px bg-border md:col-span-8 md:grid-cols-4">
          {candidateSteps.map((s, i) => (
            <Reveal
              as="li"
              key={s.title}
              delay={(i % 4) as 0 | 1 | 2 | 3}
              className="relative flex flex-col bg-background p-6 md:min-h-[16rem]"
            >
              <span className="font-display text-sm font-semibold tracking-[0.2em] text-brand">
                0{i + 1}
              </span>
              <h3 className="mt-auto pt-10 font-display text-xl font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              {i < candidateSteps.length - 1 && (
                <ArrowRight className="absolute right-4 top-6 hidden size-4 text-muted-foreground md:block" />
              )}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
