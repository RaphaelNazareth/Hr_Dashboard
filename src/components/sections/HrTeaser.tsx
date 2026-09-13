import { Link } from "react-router-dom";
import { ArrowUpRight, Lock } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";

/** Intentionally small. HR is a separate authenticated application. */
export function HrTeaser() {
  return (
    <section className="border-y border-border">
      <Reveal className="container-editorial flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-ink-foreground">
            <Lock className="size-3.5" />
          </span>
          <div>
            <p className="eyebrow">For HR teams</p>
            <p className="mt-2 max-w-lg text-base text-foreground">
              Manage applications, candidates, forms, and recruitment progress from one place.
            </p>
          </div>
        </div>
        <Button asChild variant="outline-ink">
          <Link to="/dashboard">
            Sign In to HR Dashboard <ArrowUpRight />
          </Link>
        </Button>
      </Reveal>
    </section>
  );
}
