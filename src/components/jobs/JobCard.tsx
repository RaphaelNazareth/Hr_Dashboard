import { Link } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import type { Job } from "@/data/jobs";

/** Editorial list row for a job. Not a card — a hairline row that lifts on hover. */
export function JobCard({ job }: { job: Job }) {
  return (
    <Link
      to="/apply"
      className="group grid grid-cols-1 gap-3 border-b border-border py-6 transition-colors hover:bg-card md:grid-cols-12 md:items-center md:gap-6 md:px-4 md:-mx-4"
    >
      <div className="md:col-span-6">
        <h3 className="font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">
          {job.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {job.department} · {job.type}
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground md:col-span-3">
        <MapPin className="size-3.5" />
        {job.location}
      </div>
      <div className="md:col-span-3 md:text-right">
        <span className="arrow-nudge inline-flex items-center gap-2 text-sm font-semibold text-ink group-hover:text-brand">
          View Position <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
