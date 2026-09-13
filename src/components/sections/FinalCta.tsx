import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section className="bg-sun py-28 text-sun-foreground md:py-44">
      <Reveal className="container-editorial">
        <div className="grid gap-10 md:grid-cols-12 md:items-end">
          <h2 className="display-xl text-balance-pretty md:col-span-8">Ready to empower the next generation?</h2>
          <div className="md:col-span-4 md:pb-3">
            <p className="max-w-sm text-lg leading-relaxed text-sun-foreground/80">
              Play is our language. Explore opportunities and find where your experience can take
              you.
            </p>
            <Button asChild variant="ink" size="xl" className="mt-8">
              <Link to="/#jobs">
                Explore Open Jobs <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
