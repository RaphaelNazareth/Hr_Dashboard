import { journeySteps } from "@/data/journey";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";

/** Horizontal editorial strip on desktop; scroll-snaps on mobile. */
export function Journey() {
  return (
    <section className="bg-ink py-24 text-ink-foreground md:py-36">
      <div className="container-editorial">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow="From idea to play"
            tone="paper"
            title="Every product is a journey. You'll see all of it."
          />
          <Reveal delay={1} className="max-w-xs text-sm leading-relaxed text-ink-muted">
            Most people never get to watch an idea become something a child holds. Here, that's
            what the week looks like.
          </Reveal>
        </div>
      </div>

      <div className="scrollbar-none mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 sm:px-8 lg:mt-20 lg:grid lg:grid-cols-5 lg:gap-3 lg:px-12 xl:mx-auto xl:max-w-[88rem]">
        {journeySteps.map((step, i) => (
          <Reveal
            key={step.index}
            delay={(i % 4) as 0 | 1 | 2 | 3}
            className="group relative w-[78vw] shrink-0 snap-start sm:w-[52vw] lg:w-auto"
          >
            <div className="img-zoom relative aspect-[3/4]">
              <img
                src={step.image}
                alt={step.title}
                width={1024}
                height={1280}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="font-display text-sm font-semibold tracking-[0.2em] text-sun">
                  {step.index}
                </p>
                <h3 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-[22ch] text-sm text-ink-foreground/80">{step.text}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
