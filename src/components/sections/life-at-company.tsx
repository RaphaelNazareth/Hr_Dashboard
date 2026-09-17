import picture1 from "@/assets/picture1.jpeg";
import picture2 from "@/assets/picture2.jpeg";
import picture3 from "@/assets/picture3.jpeg";
import picture4 from "@/assets/picture4.jpeg";
import picture5 from "@/assets/picture5.jpeg";
import picture6 from "@/assets/picture6.jpeg";
import picture7 from "@/assets/picture7.jpeg";
import picture8 from "@/assets/picture8.jpeg";
import picture9 from "@/assets/picture9.jpeg";
import picture10 from "@/assets/picture10.jpeg";

import { SiteNav } from "@/components/site/SiteNav";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDown } from "lucide-react";

const PRINCIPLES = [
  {
    number: "01",
    title: "We collaborate.",
    text: "Great ideas rarely happen alone. We work across disciplines, challenge each other, and build better things together.",
    picture: picture3,
  },
  {
    number: "02",
    title: "We innovate.",
    text: "We stay curious, question the expected, and turn new ideas into experiences people want to play with.",
    picture: picture4,
  },
  {
    number: "03",
    title: "We execute.",
    text: "Ideas matter when they become real. We take ownership, move with purpose, and hold ourselves to a high standard.",
    picture: picture7,
  },
];

const CULTURE = [
  {
    title: "Create boldly",
    text: "Creativity is not a department. It's how we approach problems, products, and possibilities.",
    picture: picture6,
  },
  {
    title: "Bring your perspective",
    text: "Different experiences create different ideas. We want people to show up as themselves and make their voice heard.",
    picture: picture8,
  },
  {
    title: "Keep growing",
    text: "Your career should keep moving. We create room to learn, take on challenges, and grow into what's next.",
    picture: picture9,
  },
];

export default function LifeAtCompany() {
  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171717]">
      <SiteNav />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-16 pt-32 md:px-12 md:pb-24 md:pt-40">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
                Life at PLAYCO
              </p>

              <h1 className="max-w-5xl text-5xl font-bold leading-[0.94] tracking-[-0.055em] md:text-7xl lg:text-[6.5rem]">
                Make something
                <br />
                worth playing with.
              </h1>
            </div>

            <div className="lg:col-span-4 lg:pb-2">
              <p className="max-w-md text-lg leading-8 text-[#171717]/65">
                We bring designers, creators, engineers, storytellers, and
                problem-solvers together to create products and experiences
                that inspire people through play.
              </p>
            </div>
          </div>

          <div className="mt-14 overflow-hidden rounded-[1.5rem] md:mt-20">
            <img
              src={picture1}
              alt="PLAYCO creative team working together"
              className="aspect-[16/8] w-full object-cover"
            />
          </div>

          <div className="mt-6 flex items-center justify-between border-b border-[#171717]/15 pb-6">
            <span className="text-sm text-[#171717]/50">
              Creativity. Purpose. Play.
            </span>

            <ArrowDown className="size-5 text-[#171717]/50" />
          </div>
        </div>
      </section>

      {/* PURPOSE */}
      <section className="bg-[#e31b23] px-6 py-24 text-white md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <p className="mb-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
            Our purpose
          </p>

          <h2 className="max-w-6xl text-4xl font-bold leading-[0.98] tracking-[-0.045em] md:text-6xl lg:text-7xl">
            We create experiences that help generations discover the wonder
            of play — and their own potential.
          </h2>
        </div>
      </section>

      {/* HOW WE WORK */}
      <section className="px-6 py-24 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
                How we work
              </p>

              <h2 className="max-w-lg text-4xl font-bold leading-[1] tracking-[-0.04em] md:text-6xl">
                One team.
                <br />
                Three ways forward.
              </h2>
            </div>

            <div className="lg:col-span-7">
              <div className="divide-y divide-[#171717]/15">
                {PRINCIPLES.map((item) => (
                  <div
                    key={item.number}
                    className="grid gap-6 py-8 md:grid-cols-[60px_1fr_1.2fr] md:items-start"
                  >
                    <span className="text-sm text-[#171717]/40">
                      {item.number}
                    </span>

                    <h3 className="text-2xl font-bold tracking-[-0.03em]">
                      {item.title}
                    </h3>

                    <p className="max-w-md text-base leading-7 text-[#171717]/60">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CREATIVITY */}
      <section className="bg-[#171717] px-6 py-24 text-white md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-20">
            <div className="lg:col-span-5">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
                Creativity is our starting point
              </p>

              <h2 className="text-4xl font-bold leading-[0.98] tracking-[-0.045em] md:text-6xl">
                The best ideas can come from anywhere.
              </h2>

              <p className="mt-7 max-w-md text-lg leading-8 text-white/55">
                We give people room to question, experiment, make mistakes,
                and discover better ways forward.
              </p>
            </div>

            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-[1.5rem]">
                <img
                  src={picture2}
                  alt="PLAYCO designer creating a toy prototype"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PEOPLE / CULTURE */}
      <section className="px-6 py-24 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-14 max-w-3xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
              Our culture
            </p>

            <h2 className="text-4xl font-bold leading-[1] tracking-[-0.04em] md:text-6xl">
              Bring your ideas.
              <br />
              Bring yourself.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {CULTURE.map((item) => (
              <article key={item.title}>
                <div className="overflow-hidden rounded-[1.25rem]">
                  <img
                    src={item.picture}
                    alt={item.title}
                    className="aspect-[4/3] w-full object-cover transition-transform duration-700 hover:scale-[1.03]"
                  />
                </div>

                <h3 className="mt-5 text-2xl font-bold tracking-[-0.03em]">
                  {item.title}
                </h3>

                <p className="mt-3 max-w-sm text-base leading-7 text-[#171717]/60">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* BELONGING */}
      <section className="grid bg-[#eae5d9] lg:grid-cols-2">
        <div className="flex items-center px-6 py-24 md:px-12 md:py-32">
          <div className="max-w-xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
              A place to belong
            </p>

            <h2 className="text-4xl font-bold leading-[0.98] tracking-[-0.04em] md:text-6xl">
              Different voices make better things.
            </h2>

            <p className="mt-7 text-lg leading-8 text-[#171717]/60">
              We want people to feel respected, included, and heard. Your
              perspective changes the work — and that's exactly why it belongs
              here.
            </p>
          </div>
        </div>

        <div className="min-h-[500px]">
          <img
            src={picture10}
            alt="PLAYCO team collaborating in a creative studio"
            className="h-full w-full object-cover"
          />
        </div>
      </section>

      {/* GROWTH */}
      <section className="px-6 py-24 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <div className="overflow-hidden rounded-[1.5rem]">
                <img
                  src={picture9}
                  alt="PLAYCO colleague learning from a teammate"
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-5 lg:col-start-8">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
                Keep growing
              </p>

              <h2 className="text-4xl font-bold leading-[0.98] tracking-[-0.04em] md:text-6xl">
                Your next chapter starts here.
              </h2>

              <p className="mt-7 text-lg leading-8 text-[#171717]/60">
                Take on new challenges. Learn from people around you. Build
                skills that travel with you. We believe meaningful work should
                help people grow — not keep them in one place.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#e31b23] px-6 py-24 text-white md:px-12 md:py-36">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-12 md:flex-row md:items-end">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
              What's next?
            </p>

            <h2 className="max-w-4xl text-5xl font-bold leading-[0.95] tracking-[-0.05em] md:text-7xl">
              Come build what's next with us.
            </h2>
          </div>

          <Link
            to="/#jobs"
            className="group inline-flex shrink-0 items-center gap-3 rounded-full bg-white px-7 py-4 text-sm font-semibold text-[#171717] transition-all hover:gap-5"
          >
            Explore open roles
            <ArrowUpRight className="size-5" />
          </Link>
        </div>
      </section>
    </main>
  );
}