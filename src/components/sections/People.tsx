import { people } from "@/data/people";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { cn } from "@/lib/utils";

/** Asymmetric editorial collage. Content comes from src/data/people.ts. */
export function People() {
  const [lead, ...rest] = people;
  return (
    <section id="people" className="scroll-mt-20 py-24 md:py-36">
      <div className="container-editorial">
        <SectionHeading
          eyebrow="People"
          title="The people behind the play."
          lead="Designers, engineers, makers and planners — the people who turn purposeful play into something a child can hold. Placeholder stories for now; every one will be replaced with a real voice."
        />

        <div className="mt-16 grid gap-x-8 gap-y-14 md:grid-cols-12">
          {/* Lead portrait */}
          <Reveal className="md:col-span-7">
            <figure>
              <div className="img-zoom aspect-[4/5] md:aspect-[5/4]">
                <img
                  src={lead.photo}
                  alt={lead.name}
                  width={1024}
                  height={1280}
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
              </div>
              <blockquote className="mt-6 max-w-xl font-display text-2xl font-medium leading-snug tracking-tight md:text-3xl">
                “{lead.quote}”
              </blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold">{lead.name}</span>
                <span className="text-muted-foreground"> — {lead.role}, {lead.location}</span>
              </figcaption>
            </figure>
          </Reveal>

          {/* Stacked column */}
          <div className="grid gap-14 md:col-span-5 md:pt-24">
            {rest.slice(0, 2).map((p, i) => (
              <Reveal key={p.id} delay={(i + 1) as 1 | 2}>
                <figure className={cn(i === 1 && "md:ml-12")}>
                  <div className="img-zoom aspect-[4/5]">
                    <img
                      src={p.photo}
                      alt={p.name}
                      width={1024}
                      height={1280}
                      loading="lazy"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                  <blockquote className="mt-5 font-display text-xl font-medium leading-snug tracking-tight">
                    “{p.quote}”
                  </blockquote>
                  <figcaption className="mt-3 text-sm">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-muted-foreground"> — {p.role}, {p.location}</span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>

          {/* Wide bottom row */}
          {rest[2] && (
            <Reveal className="md:col-span-12">
              <figure className="grid items-center gap-8 border-t border-border pt-10 md:grid-cols-12">
                <div className="img-zoom aspect-square md:col-span-3">
                  <img
                    src={rest[2].photo}
                    alt={rest[2].name}
                    width={1024}
                    height={1280}
                    loading="lazy"
                    className="h-full w-full object-cover object-top"
                  />
                </div>
                <div className="md:col-span-8 md:col-start-5">
                  <blockquote className="font-display text-2xl font-medium leading-snug tracking-tight md:text-4xl">
                    “{rest[2].quote}”
                  </blockquote>
                  <figcaption className="mt-4 text-sm">
                    <span className="font-semibold">{rest[2].name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {rest[2].role}, {rest[2].location}
                    </span>
                  </figcaption>
                </div>
              </figure>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
