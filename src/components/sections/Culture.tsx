import collab from "@/assets/culture-collab.jpg";
import learning from "@/assets/culture-learning.jpg";
import { cultureThemes } from "@/data/culture";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";

export function Culture() {
  return (
    <section className="py-24 md:py-36">
      <div className="container-editorial">
        <SectionHeading
          eyebrow="What we stand for"
          title="Trust is the foundation of everything we make."
          lead="Our relationship with our people, families, partners and communities rests on one belief: that we will do the right thing and live up to our commitments."
        />

        <div className="mt-16 grid gap-6 md:grid-cols-12 md:gap-8">
          <Reveal className="img-zoom md:col-span-8">
            <img
              src={collab}
              alt="A team laughing while arranging toy prototypes on a table"
              width={1600}
              height={1000}
              loading="lazy"
              className="aspect-[16/10] w-full object-cover"
            />
          </Reveal>
          <Reveal delay={1} className="img-zoom md:col-span-4">
            <img
              src={learning}
              alt="A team lead mentoring a colleague at an assembly station"
              width={1024}
              height={1280}
              loading="lazy"
              className="aspect-[4/5] h-full w-full object-cover md:aspect-auto"
            />
          </Reveal>
        </div>

        <ul className="mt-16 grid gap-x-8 md:grid-cols-2 lg:grid-cols-5">
          {cultureThemes.map((c, i) => (
            <Reveal
              as="li"
              key={c.theme}
              delay={(i % 4) as 0 | 1 | 2 | 3}
              className="border-t border-ink py-6"
            >
              <p className="eyebrow">{c.theme}</p>
              <p className="mt-4 font-display text-xl font-medium leading-snug tracking-tight md:text-2xl">
                {c.statement}
              </p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
