
import heroImage from "@/assets/hero-image.jpg";
import { Reveal } from "@/components/site/Reveal";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";

export function Story() {
  const { t } = useLanguage();
  return (
    <section id="life" className="scroll-mt-20 py-16 sm:py-24 md:py-36">
      <div className="container-editorial">
        <Reveal>
          <p className="eyebrow mb-5">{t("story.eyebrow")}</p>
        </Reveal>

        <div className="grid items-center gap-8 md:grid-cols-12 md:gap-10 md:gap-y-12">

          {/* Text */}
          <Reveal className="md:col-span-5">
            <h2 className="display-lg text-balance-pretty">
              {t("story.title")}
            </h2>

            <p className="mt-8 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("story.p1")}
            </p>

            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("story.p2")}
            </p>

            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("story.p3")}
            </p>

            {/* Button */}
            <Link
              to="/life-at-company"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-red-700 hover:gap-3"
            >
              {t("story.cta")}
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
                alt={t("story.imageAlt")}
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
