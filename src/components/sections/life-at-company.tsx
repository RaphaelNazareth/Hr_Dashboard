import picture1 from "@/assets/picture1.jpeg";
import picture2 from "@/assets/picture2.jpeg";
import picture5 from "@/assets/picture5.jpeg";
import picture6 from "@/assets/picture6.jpeg";
import picture7 from "@/assets/picture7.jpeg";
import picture8 from "@/assets/picture8.jpeg";
import picture10 from "@/assets/picture10.jpeg";

import { SiteNav } from "@/components/site/SiteNav";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDown } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const CULTURE_IMAGES = [picture6, picture8, picture7];

export default function LifeAtCompany() {
  const { t, copy } = useLanguage();
  const principles = copy.life.principles;
  const culture = copy.life.culture;

  return (
    <div className="site-scope min-h-screen overflow-x-hidden bg-[#f5f3ee] text-[#171717]">
      <SiteNav />

      {/* HERO */}
      <section className="relative overflow-hidden px-4 pb-12 pt-28 sm:px-6 sm:pb-16 sm:pt-32 md:px-12 md:pb-24 md:pt-40">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
                {t("life.eyebrow")}
              </p>

              <h1 className="max-w-5xl text-[2.35rem] font-bold leading-[0.98] tracking-[-0.055em] sm:text-5xl md:text-7xl lg:text-[6.5rem]">
                {t("life.titleLine1")}
                <br />
                {t("life.titleLine2")}
              </h1>
            </div>

            <div className="lg:col-span-4 lg:pb-2">
              <p className="max-w-md text-lg leading-8 text-[#171717]/65">
                {t("life.lead")}
              </p>
            </div>
          </div>

          <div className="mt-14 overflow-hidden rounded-[1.5rem] md:mt-20">
            <img
              src={picture1}
              alt="mattel creative team working together"
              className="aspect-[16/10] w-full object-cover sm:aspect-[16/8]"
            />
          </div>

          <div className="mt-6 flex items-center justify-between border-b border-[#171717]/15 pb-6">
            <span className="text-sm text-[#171717]/50">
              {t("life.strap")}
            </span>

            <ArrowDown className="size-5 text-[#171717]/50" />
          </div>
        </div>
      </section>

      {/* PURPOSE */}
      <section className="bg-[#e31b23] px-6 py-24 text-white md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <p className="mb-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
            {t("life.purposeEyebrow")}
          </p>

          <h2 className="max-w-6xl text-3xl font-bold leading-[1.05] tracking-[-0.045em] sm:text-4xl md:text-6xl lg:text-7xl">
            {t("life.purpose")}
          </h2>
        </div>
      </section>

      {/* HOW WE WORK */}
      <section className="px-6 py-24 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
                {t("life.howEyebrow")}
              </p>

              <h2 className="max-w-lg text-3xl font-bold leading-[1.05] tracking-[-0.04em] sm:text-4xl md:text-6xl">
                {t("life.howTitleLine1")}
                <br />
                {t("life.howTitleLine2")}
              </h2>
            </div>

            <div className="lg:col-span-7">
              <div className="divide-y divide-[#171717]/15">
                {principles.map((item) => (
                  <div
                    key={item.number}
                    className="grid gap-4 py-8 sm:gap-6 md:grid-cols-[60px_1fr_1.2fr] md:items-start"
                  >
                    <span className="text-sm text-[#171717]/40">
                      {item.number}
                    </span>

                    <h3 className="text-xl font-bold tracking-[-0.03em] sm:text-2xl">
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
                {t("life.creativityEyebrow")}
              </p>

              <h2 className="text-3xl font-bold leading-[1.05] tracking-[-0.045em] sm:text-4xl md:text-6xl">
                {t("life.creativityTitle")}
              </h2>

              <p className="mt-7 max-w-md text-lg leading-8 text-white/55">
                {t("life.creativityLead")}
              </p>
            </div>

            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-[1.5rem]">
                <img
                  src={picture2}
                  alt="mattel designer creating a toy prototype"
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
              {t("life.cultureEyebrow")}
            </p>

            <h2 className="text-3xl font-bold leading-[1.05] tracking-[-0.04em] sm:text-4xl md:text-6xl">
              {t("life.cultureTitleLine1")}
              <br />
              {t("life.cultureTitleLine2")}
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
            {culture.map((item, i) => (
              <article key={item.title}>
                <div className="overflow-hidden rounded-[1.25rem]">
                  <img
                    src={CULTURE_IMAGES[i]}
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
        <div className="flex items-center px-4 py-16 sm:px-6 sm:py-24 md:px-12 md:py-32">
          <div className="max-w-xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#e31b23]">
              {t("life.belongEyebrow")}
            </p>

            <h2 className="text-3xl font-bold leading-[1.05] tracking-[-0.04em] sm:text-4xl md:text-6xl">
              {t("life.belongTitle")}
            </h2>

            <p className="mt-7 text-lg leading-8 text-[#171717]/60">
              {t("life.belongLead")}
            </p>
          </div>
        </div>

        <div className="min-h-[280px] sm:min-h-[500px]">
          <img
            src={picture10}
            alt="mattel team collaborating in a creative studio"
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
                  src={picture5}
                  alt="mattel colleague learning from a teammate"
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
    </div>
  );
}