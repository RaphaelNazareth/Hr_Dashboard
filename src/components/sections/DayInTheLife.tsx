import { useState } from "react";
import { careerAreas } from "@/data/day-in-the-life";
import { SectionHeading } from "@/components/site/SectionHeading";
import { Reveal } from "@/components/site/Reveal";
import { cn } from "@/lib/utils";

export function DayInTheLife() {
  const [activeId, setActiveId] = useState(careerAreas[0].id);
  const area = careerAreas.find((a) => a.id === activeId) ?? careerAreas[0];

  return (
    <section id="how-we-work" className="scroll-mt-20 bg-paper-2 py-24 md:py-36">
      <div className="container-editorial">
        <SectionHeading eyebrow="How we work" title="What does a day here look like?" />

        <div className="mt-14 grid gap-12 md:grid-cols-12">
          {/* Area selector */}
          <Reveal className="md:col-span-4">
            <div
              role="tablist"
              aria-label="Career areas"
              className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-col md:gap-0 md:px-0"
            >
              {careerAreas.map((a) => {
                const active = a.id === activeId;
                return (
                  <button
                    key={a.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveId(a.id)}
                    className={cn(
                      "shrink-0 whitespace-nowrap border-b-2 px-1 py-3 text-left font-display text-lg font-semibold tracking-tight transition-colors md:flex md:w-full md:items-center md:justify-between md:border-b md:border-border md:py-5 md:text-3xl",
                      active
                        ? "border-brand text-ink md:border-border"
                        : "border-transparent text-muted-foreground hover:text-ink md:border-border",
                    )}
                  >
                    {a.label}
                    <span
                      className={cn(
                        "hidden size-2 rounded-full transition-all duration-500 md:block",
                        active ? "scale-100 bg-brand" : "scale-0 bg-transparent",
                      )}
                    />
                  </button>
                );
              })}
            </div>
            <p className="mt-6 hidden max-w-xs text-sm leading-relaxed text-muted-foreground md:block">
              Days vary — this is a typical one. Every role gets time on the floor, in the lab or
              in front of the families who play with what we make.
            </p>
          </Reveal>

          {/* Timeline */}
          <div className="md:col-span-7 md:col-start-6" key={area.id}>
            <p className="font-display text-xl font-medium tracking-tight text-ink animate-in fade-in slide-in-from-bottom-2 duration-500 md:text-2xl">
              {area.intro}
            </p>
            <ol className="relative mt-10 border-l border-border pl-8">
              {area.timeline.map((t, i) => (
                <li
                  key={t.time}
                  className="relative pb-10 last:pb-0 animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-700"
                  style={{ animationDelay: `${80 + i * 90}ms` }}
                >
                  <span className="timeline-dot absolute -left-[2.3rem] top-1.5" />
                  <div className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:gap-6">
                    <time className="font-display text-sm font-semibold tabular-nums tracking-[0.08em] text-brand">
                      {t.time}
                    </time>
                    <div>
                      <h3 className="font-display text-xl font-semibold tracking-tight md:text-2xl">
                        {t.title}
                      </h3>
                      {t.detail && (
                        <p className="mt-1 text-sm text-muted-foreground md:text-base">{t.detail}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
