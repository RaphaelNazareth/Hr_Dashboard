
import heroImage from "@/assets/hero-image.jpg";
import { Reveal } from "@/components/site/Reveal";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

export function Story() {
  return (
    <section id="life" className="scroll-mt-20 py-24 md:py-36">
      <div className="container-editorial">
        <Reveal>
          <p className="eyebrow mb-5">About us</p>
        </Reveal>

        <div className="grid items-center gap-12 md:grid-cols-12 md:gap-10">

          {/* Text */}
          <Reveal className="md:col-span-5">
            <h2 className="display-lg text-balance-pretty">
              Good work starts with good people.
            </h2>

            <p className="mt-8 max-w-md text-lg leading-relaxed text-muted-foreground">
              At PLAYCO, we work together to create products and experiences
              that bring joy to people around the world.
            </p>

            <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
              We learn from each other, share new ideas, and work together
              to bring those ideas to life.
            </p>

            <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
              We want our people to have the chance to learn, grow, and try
              new things. When our people grow, PLAYCO grows with them.
            </p>

            {/* Button */}
            <Link
              to="/life-at-company"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-red-700 hover:gap-3"
            >
              Explore Life at PLAYCO
              <ArrowUpRight size={17} strokeWidth={2} />
            </Link>
          </Reveal>

          {/* Image */}
          <Reveal
            delay={1}
            className="group relative md:col-span-7"
          >
            <Link
              to="/life-at-company"
              className="relative block overflow-hidden rounded-sm"
            >
              <img
                src={heroImage}
                alt="People working together at PLAYCO"
                width={1024}
                height={765}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              />

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 transition-colors duration-500 group-hover:bg-black/20" />
            </Link>
          </Reveal>

        </div>
      </div>
    </section>
  );
}
