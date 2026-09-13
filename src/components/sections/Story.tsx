import storyImage from "@/assets/story-workbench.jpg";
import { Reveal } from "@/components/site/Reveal";

export function Story() {
  return (
    <section id="life" className="scroll-mt-20 py-24 md:py-36">
      <div className="container-editorial grid items-center gap-12 md:grid-cols-12 md:gap-8">
        <Reveal className="md:col-span-5 md:col-start-1">
          <p className="eyebrow mb-5">Life at the Company</p>
          <h2 className="display-lg text-balance-pretty">We treat play as if the future depends on it.</h2>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-muted-foreground">
            Because it does. Toys, content, consumer products, digital and live experiences —
            nothing we make is made alone. A sketch becomes a product through designers, engineers,
            manufacturing teams, marketers and planners, each adding something the others couldn't.
          </p>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
            Our mission is to create innovative products and experiences that inspire fans,
            entertain audiences, and develop children through play. Working here means seeing your
            part in that whole.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-6">
            <Stat value="1945" label="Making play since" />
            <Stat value="40+" label="Countries with teams" />
            <Stat value="130" label="Markets we reach" />
          </dl>
        </Reveal>
        <Reveal delay={1} className="img-zoom md:col-span-6 md:col-start-7">
          <img
            src={storyImage}
            alt="Two colleagues reviewing a hand-drawn toy sketch at a workbench"
            width={1280}
            height={1600}
            loading="lazy"
            className="aspect-[4/5] w-full object-cover"
          />
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-3xl font-semibold tracking-tight">{value}</dd>
      <dd className="mt-1 text-xs text-muted-foreground">{label}</dd>
    </div>
  );
}
