import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { JobSearch } from "@/components/jobs/JobSearch";
import { Reveal } from "@/components/site/Reveal";
import { SectionHeading } from "@/components/site/SectionHeading";
import { Button } from "@/components/ui/button";

export function OpenJobs() {
  return (
    <section id="jobs" className="scroll-mt-20 bg-paper-2 py-24 md:py-36">
      <div className="container-editorial">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow="Open jobs"
            title="Find your next opportunity."
            lead="Search across teams, locations and employment types."
          />
          <Reveal delay={1}>
            <Button asChild variant="quiet">
              <Link to="/#jobs">
                View all positions <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </div>
        <Reveal delay={1} className="mt-14">
          <JobSearch limit={5} />
        </Reveal>
      </div>
    </section>
  );
}
