import { Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { JobCard } from "./JobCard";
import { fetchJobs, type JobRecord } from "@/lib/candidateBoard";
import { useLanguage } from "@/hooks/useLanguage";

export interface JobFilters {
  q: string;
}

export function filterJobs(list: JobRecord[], f: JobFilters) {
  const q = f.q.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (j) =>
      j.job_title.toLowerCase().includes(q) ||
      (j.job_description ?? "").toLowerCase().includes(q) ||
      (j.requirements ?? "").toLowerCase().includes(q),
  );
}

export function JobSearch({ limit }: { limit?: number }) {
  const { t } = useLanguage();
  const [allJobs, setAllJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const jobs = await fetchJobs();
        if (!cancelled) setAllJobs(jobs.filter((j) => j.status === "Open"));
      } catch (err) {
        console.error("Failed to load jobs", err);
        if (!cancelled) setError(t("jobs.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => filterJobs(allJobs, { q }), [allJobs, q]);
  const shown = limit ? results.slice(0, limit) : results;

  return (
    <div>
      <div className="border-b border-ink">
        <label className="flex items-center gap-3 py-3">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("jobs.searchPlaceholder")}
            className="w-full min-w-0 bg-transparent font-display text-xl font-medium tracking-tight outline-none placeholder:text-muted-foreground/70 md:text-2xl"
            aria-label={t("jobs.searchAria")}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={t("jobs.clear")}
              className="text-muted-foreground hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("jobs.loading")}
        </div>
      ) : error ? (
        <p className="py-10 text-sm text-destructive">{error}</p>
      ) : (
        <>
          <p className="py-4 text-xs text-muted-foreground">
            {results.length === 1
              ? t("jobs.countOne", { count: results.length })
              : t("jobs.countMany", { count: results.length })}
            {limit && results.length > limit ? t("jobs.showing", { limit }) : ""}
          </p>
          <div>
            {shown.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
            {shown.length === 0 && (
              <div className="py-16 text-center">
                <p className="font-display text-2xl font-semibold">{t("jobs.emptyTitle")}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("jobs.emptyLead")}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}