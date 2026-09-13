import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown } from "lucide-react";
import { useEffect, useRef } from "react";
import heroImage from "@/assets/hero-studio.jpg";
import heroImagePortrait from "@/assets/hero-studio-portrait.jpg";
import { Button } from "@/components/ui/button";

/** Upscale that gives the parallax room to travel without exposing an edge. */
const HERO_SCALE = 1.12;

/** PLACEHOLDER PHOTOGRAPHY: replace hero-studio*.jpg with approved imagery. */
export function Hero() {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = imgRef.current;
        if (!el) return;
        // Never travel further than the overflow the upscale gives us, or the
        // image edge would slide into frame.
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
      {/* Phones get a portrait crop of the same frame: less of the shot is thrown
          away by object-cover, and it ships far fewer bytes than the wide file. */}
      <picture className="contents">
        <source media="(max-width: 767px)" srcSet={heroImagePortrait} width={760} height={1152} />
        <img
          ref={imgRef}
          src={heroImage}
          alt="A toy designer at her studio desk holding up a red die-cast car above concept sketches"
          width={1920}
          height={1152}
          fetchPriority="high"
          className="absolute inset-0 -z-20 h-full w-full scale-[1.12] object-cover object-[40%_center] will-change-transform md:object-[center_15%]"
        />
      </picture>
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/55 to-ink/20" />
      <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-ink/50 to-transparent" />

      <div className="container-editorial relative w-full pb-16 pt-40 md:pb-24">
        <div className="grid gap-10 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <p className="eyebrow mb-6 text-ink-muted animate-in fade-in slide-in-from-bottom-2 duration-700">
              Careers · Global Play & Family Entertainment
            </p>
            <h1 className="display-xl text-balance-pretty animate-in fade-in slide-in-from-bottom-4 duration-1000">
              Empowering the
              <br />
              next generation
              <br />
              through play.
            </h1>
          </div>
          <div className="md:col-span-4 md:pb-3 animate-in fade-in slide-in-from-bottom-3 delay-200 duration-1000 fill-mode-both">
            <p className="max-w-sm text-base leading-relaxed text-ink-foreground/85 md:text-lg">
              We empower generations to explore the wonder of childhood and reach their full
              potential. Come help us do it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="paper" size="xl" className="w-full sm:w-auto">
                <Link to="/#jobs">
                  Explore Opportunities <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline-paper" size="xl" className="w-full sm:w-auto">
                <Link to="/#life">
                  Life at the Company
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-16 flex items-center justify-between border-t border-ink-foreground/20 pt-5 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-2">
            <ArrowDown className="size-3.5 animate-bounce" /> Scroll to explore
          </span>
          <span className="hidden sm:inline">Photo: placeholder — replace with approved photography</span>
        </div>
      </div>
    </section>
  );
}
