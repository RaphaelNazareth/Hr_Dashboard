import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { JobCard } from "./JobCard";
import { departments, employmentTypes, jobs, locations, type Job } from "@/data/jobs";
import { cn } from "@/lib/utils";

export interface JobFilters {
  q: string;
  department: string;
  location: string;
  type: string;
}

const empty: JobFilters = { q: "", department: "", location: "", type: "" };

export function filterJobs(list: Job[], f: JobFilters) {
  const q = f.q.trim().toLowerCase();
  return list.filter(
    (j) =>
      (!q ||
        j.title.toLowerCase().includes(q) ||
        j.team.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)) &&
      (!f.department || j.department === f.department) &&
      (!f.location || j.location === f.location) &&
      (!f.type || j.type === f.type),
  );
}

export function JobSearch({
  limit,
  initial,
  compact = false,
}: {
  limit?: number;
  initial?: Partial<JobFilters>;
  compact?: boolean;
}) {
  const [filters, setFilters] = useState<JobFilters>({ ...empty, ...initial });
  const results = useMemo(() => filterJobs(jobs, filters), [filters]);
  const shown = limit ? results.slice(0, limit) : results;
  const active = Object.entries(filters).filter(([k, v]) => k !== "q" && v).length;

  const set = (k: keyof JobFilters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div>
      {/* Search bar */}
      <div className="border-b border-ink">
        <label className="flex items-center gap-3 py-3">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set("q")(e.target.value)}
            placeholder="Search by title, team or location"
            className="w-full bg-transparent font-display text-xl font-medium tracking-tight outline-none placeholder:text-muted-foreground/70 md:text-2xl"
            aria-label="Search jobs"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => set("q")("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border py-4">
        <span className="hidden items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:inline-flex">
          <SlidersHorizontal className="size-3.5" /> Filter
        </span>
        <FilterSelect label="Department" value={filters.department} onChange={set("department")} options={departments} />
        <FilterSelect label="Location" value={filters.location} onChange={set("location")} options={locations} />
        <FilterSelect label="Employment type" value={filters.type} onChange={set("type")} options={employmentTypes} />
        {active > 0 && (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...empty, q: f.q }))}
            className="ml-auto text-xs font-medium text-brand hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="py-4 text-xs text-muted-foreground">
        {results.length} open {results.length === 1 ? "position" : "positions"}
        {limit && results.length > limit ? ` · showing ${limit}` : ""}
      </p>

      <div className={cn(compact && "")}>
        {shown.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
        {shown.length === 0 && (
          <div className="py-16 text-center">
            <p className="font-display text-2xl font-semibold">No positions match yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a broader search, or check back soon — new roles open every week.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "cursor-pointer appearance-none bg-transparent pr-5 text-sm font-medium outline-none transition-colors",
          value ? "text-ink underline decoration-brand decoration-2 underline-offset-4" : "text-ink/70 hover:text-ink",
        )}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-0 size-3 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M2 4l4 4 4-4" />
      </svg>
    </label>
  );
}
