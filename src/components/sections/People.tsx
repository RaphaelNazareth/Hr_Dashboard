import { useState } from "react";
import { ArrowLeft, ArrowRight, Quote } from "lucide-react";

import { people } from "@/data/people";
import { Reveal } from "@/components/site/Reveal";

export function People() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const current = people[active];

  const goTo = (index: number) => {
    setDirection(index > active ? "next" : "prev");
    setActive(index);
  };

  const next = () => {
    setDirection("next");
    setActive((prev) => (prev + 1) % people.length);
  };

  const previous = () => {
    setDirection("prev");
    setActive((prev) => (prev - 1 + people.length) % people.length);
  };

  const getPerson = (offset: number) => {
    return people[(active + offset + people.length) % people.length];
  };

  const previousPerson = getPerson(-1);
  const nextPerson = getPerson(1);

  return (
    <section
      id="people"
      className="scroll-mt-20 overflow-hidden bg-[#f7f5f0] py-24 md:py-32"
    >
      <div className="container-editorial">

        {/* Header */}
        <Reveal>
          <div className="max-w-3xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              People
            </p>

            <h2 className="font-display text-4xl font-medium tracking-tight md:text-6xl">
              The people behind the play.
            </h2>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Designers, engineers, makers and planners — the people who turn
              purposeful play into something a child can hold.
            </p>
          </div>
        </Reveal>

        {/* Carousel */}
        <Reveal delay={1} className="mt-16 md:mt-20">
          <div className="relative">

            {/* Desktop */}
            <div className="relative hidden h-[620px] items-center justify-center md:flex">

              {/* Previous preview */}
              <button
                type="button"
                onClick={previous}
                aria-label={`Previous: ${previousPerson.name}`}
                className="group absolute left-[-18%] z-0 w-[32%] cursor-pointer"
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-white opacity-35 transition-all duration-500 group-hover:scale-[1.02] group-hover:opacity-50">
                  <img
                    src={previousPerson.photo}
                    alt=""
                    className="h-full w-full object-cover object-top"
                  />

                  <div className="absolute inset-0 bg-black/10" />
                </div>
              </button>

              {/* Next preview */}
              <button
                type="button"
                onClick={next}
                aria-label={`Next: ${nextPerson.name}`}
                className="group absolute right-[-18%] z-0 w-[32%] cursor-pointer"
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-white opacity-35 transition-all duration-500 group-hover:scale-[1.02] group-hover:opacity-50">
                  <img
                    src={nextPerson.photo}
                    alt=""
                    className="h-full w-full object-cover object-top"
                  />

                  <div className="absolute inset-0 bg-black/10" />
                </div>
              </button>

              {/* Main card */}
              <div
                key={current.id}
                className={`relative z-10 grid h-full w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-[0_25px_80px_rgba(0,0,0,0.10)] md:grid-cols-2 ${
                  direction === "next"
                    ? "animate-[slideInRight_0.45s_ease-out]"
                    : "animate-[slideInLeft_0.45s_ease-out]"
                }`}
              >

                {/* Image */}
                <div className="relative min-h-[620px] overflow-hidden">
                  <img
                    src={current.photo}
                    alt={current.name}
                    className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 hover:scale-[1.02]"
                  />

                  {/* gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

                  {/* Number */}
                  <div className="absolute left-6 top-6 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-xs font-semibold shadow-sm backdrop-blur">
                    {String(active + 1).padStart(2, "0")}
                  </div>
                </div>

                {/* Testimonial */}
                <div className="flex flex-col justify-between p-9 md:p-12 lg:p-14">

                  <div>
                    <Quote
                      size={34}
                      strokeWidth={1.4}
                      className="mb-10 text-[#e53935]"
                    />

                    <blockquote className="font-display text-2xl font-medium leading-[1.18] tracking-tight lg:text-[2.15rem]">
                      “{current.quote}”
                    </blockquote>
                  </div>

                  <div className="mt-12">
                    <div className="mb-6 h-px w-full bg-border" />

                    <p className="text-base font-semibold">
                      {current.name}
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {current.role}
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {current.location}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile */}
            <div className="md:hidden">

              <div
                key={current.id}
                className="overflow-hidden rounded-[24px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.08)]"
              >
                {/* Image */}
                <div className="relative aspect-[4/5]">
                  <img
                    src={current.photo}
                    alt={current.name}
                    className="h-full w-full object-cover object-top"
                  />

                  <div className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xs font-semibold">
                    {String(active + 1).padStart(2, "0")}
                  </div>
                </div>

                {/* Text */}
                <div className="p-7">

                  <Quote
                    size={28}
                    strokeWidth={1.4}
                    className="mb-7 text-[#e53935]"
                  />

                  <blockquote className="font-display text-2xl font-medium leading-tight tracking-tight">
                    “{current.quote}”
                  </blockquote>

                  <div className="mt-8 border-t border-border pt-5">
                    <p className="font-semibold">
                      {current.name}
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {current.role}, {current.location}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-8 flex items-center justify-between md:mt-10">

              {/* Counter */}
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold">
                  {String(active + 1).padStart(2, "0")}
                </span>

                <span className="text-muted-foreground">/</span>

                <span className="text-muted-foreground">
                  {String(people.length).padStart(2, "0")}
                </span>
              </div>

              {/* Pagination */}
              <div className="hidden items-center gap-2 sm:flex">
                {people.map((person, index) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`View ${person.name}`}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      index === active
                        ? "w-9 bg-[#e53935]"
                        : "w-1.5 bg-black/20 hover:bg-black/40"
                    }`}
                  />
                ))}
              </div>

              {/* Arrows */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={previous}
                  aria-label="Previous person"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white transition-all duration-200 hover:-translate-x-0.5 hover:bg-black hover:text-white"
                >
                  <ArrowLeft
                    size={18}
                    strokeWidth={1.7}
                  />
                </button>

                <button
                  type="button"
                  onClick={next}
                  aria-label="Next person"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white transition-all duration-200 hover:translate-x-0.5 hover:bg-black hover:text-white"
                >
                  <ArrowRight
                    size={18}
                    strokeWidth={1.7}
                  />
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}