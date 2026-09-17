import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { JobRecord } from "@/lib/candidateBoard";
import { useLanguage } from "@/hooks/useLanguage";

export function JobCard({ job }: { job: JobRecord }) {
  const { t } = useLanguage();
  return (
    <Link
      to={`/apply/${job.id}`}
      className="group grid grid-cols-1 gap-3 border-b border-border py-6 transition-colors hover:bg-card md:grid-cols-12 md:items-center md:gap-6 md:px-4 md:-mx-4"
    >
      <div className="md:col-span-9">
        <h3 className="font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">
          {job.job_title}
        </h3>
        {job.job_description && (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
            {job.job_description}
          </p>
        )}
      </div>
      <div className="md:col-span-3 md:text-right">
        <span className="arrow-nudge inline-flex items-center gap-2 text-sm font-semibold text-ink group-hover:text-brand">
          {t("jobs.viewPosition")} <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}