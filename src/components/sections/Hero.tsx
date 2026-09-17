import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown } from "lucide-react";
import { useEffect, useRef } from "react";
import heroImage from "@/assets/hero-studio.png";
import heroImagePortrait from "@/assets/hero-studio-portrait.jpg";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

/** Upscale that gives the parallax room to travel without exposing an edge. */
const HERO_SCALE = 1.15;

/** PLACEHOLDER PHOTOGRAPHY: replace hero-studio*.jpg with approved imagery. */
export function Hero() {
  const imgRef = useRef<HTMLImageElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = imgRef.current;
        if (!el) return;
        const maxShift = (el.offsetHeight * (HERO_SCALE - 1)) / 2;
        const y = Math.min(window.scrollY * 0.18, maxShift);
        el.style.transform = `translate3d(0, ${y}px, 0) scale(${HERO_SCALE})`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden bg-ink text-ink-foreground">
      <picture className="contents">
        <source media="(max-width: 767px)" srcSet={heroImagePortrait} width={760} height={1152} />
        <img
          ref={imgRef}
          src={heroImage}
          alt="A toy designer at her studio desk holding up a red die-cast car above concept sketches"
          width={1920}
          height={1152}
          fetchPriority="high"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
        />
      </picture>

      {/* Vertical wash for general legibility */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/55 to-ink/20" />
      {/* Diagonal wash (bottom-left → top-right) to punch up contrast behind the headline specifically */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-ink/80 via-ink/25 to-transparent" />
      {/* Slightly heavier top overlay so the nav sits on a consistent dark band regardless of what's behind it */}
      <div className="absolute inset-x-0 top-0 -z-10 h-48 bg-gradient-to-b from-ink/70 via-ink/35 to-transparent" />

      <div className="container-editorial relative w-full pb-12 pt-28 sm:pb-16 sm:pt-36 md:pb-24 md:pt-40">
        <div className="grid gap-8 md:grid-cols-12 md:items-end md:gap-10">
          <div className="md:col-span-8">
            <h1 className="display-xl text-balance-pretty animate-in fade-in slide-in-from-bottom-4 duration-1000">
              {t("hero.titleLine1")}
              <br />
              {t("hero.titleLine2")}
              <br />
              {t("hero.titleLine3")}
            </h1>
          </div>
          <div className="md:col-span-4 md:pb-3 animate-in fade-in slide-in-from-bottom-3 delay-200 duration-1000 fill-mode-both">
            <p className="max-w-sm text-base leading-relaxed text-ink-foreground/85 md:text-lg">
              {t("hero.lead")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                asChild
                size="xl"
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
              >
                <Link to="/#jobs">
                  {t("hero.explore")} <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="xl"
                className="w-full border-ink-foreground/60 bg-transparent text-ink-foreground hover:bg-ink-foreground/10 sm:w-auto"
              >
                <Link to="/#life">{t("hero.life")}</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-16 flex items-center justify-between border-t border-ink-foreground/20 pt-6 text-xs text-ink-muted sm:mt-24 md:mt-28">
          <span className="inline-flex items-center gap-2">
            <ArrowDown className="size-3.5 animate-bounce" /> {t("hero.scroll")}
          </span>
        </div>
      </div>
    </section>
  );
}