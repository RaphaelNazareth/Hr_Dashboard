import { Link } from "react-router-dom";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Wordmark } from "./Wordmark";
import { navLinks } from "@/data/site";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteNav({ transparent = false }: { transparent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const solid = !transparent || scrolled || open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500",
        solid
          ? "border-b border-border bg-paper/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="container-editorial flex h-16 items-center justify-between lg:h-[4.5rem]">
        <Wordmark tone={solid ? "ink" : "paper"} />

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          {navLinks.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "link-draw text-[0.9rem] font-medium transition-colors",
                solid ? "text-ink/80 hover:text-ink" : "text-ink-foreground/85 hover:text-ink-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm" className={cn(!solid && "text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground")}>
            <Link to="/apply">Apply</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className={cn(!solid && "text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground")}>
            <Link to="/candidate-portal">Candidate Login</Link>
          </Button>
          <Button asChild variant={solid ? "ink" : "paper"} size="sm">
            <Link to="/dashboard">Admin Login</Link>
          </Button>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex size-10 items-center justify-center lg:hidden",
            solid ? "text-ink" : "text-ink-foreground",
          )}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "lg:hidden overflow-hidden bg-paper transition-[max-height,opacity] duration-500 ease-editorial",
          open ? "max-h-[calc(100dvh-4rem)] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="container-editorial flex flex-col gap-1 pb-8 pt-4">
          {navLinks.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-b border-border py-4 font-display text-2xl font-semibold text-ink"
            >
              {item.label}
              <ArrowUpRight className="size-5 text-muted-foreground" />
            </Link>
          ))}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button asChild variant="outline-ink" size="lg">
              <Link to="/apply" onClick={() => setOpen(false)}>
                Apply
              </Link>
            </Button>
            <Button asChild variant="ink" size="lg">
              <Link to="/candidate-portal" onClick={() => setOpen(false)}>
                Candidate Login
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}