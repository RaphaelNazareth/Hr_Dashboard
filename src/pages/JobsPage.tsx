import { type FC, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUpDown,
  Briefcase,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchJobs,
  fetchCandidates,
  updateJobStatus,
  deleteJob,
  subscribeToJobs,
  DEFAULT_STAGE_NAMES,
} from "@/lib/candidateBoard";
import type { JobRecord, CandidateRecord } from "@/lib/candidateBoard";

// Location isn't a column on public.jobs yet (see CreateJobPage TODO). Once you
// add city/country, this picks them up automatically.
type JobRow = JobRecord & { city?: string | null; country?: string | null; created_at?: string };

function locationOf(job: JobRow) {
  return [job.city, job.country].filter(Boolean).join(", ");
}

type SortKey = "title" | "created";

const MENU_WIDTH = 192;
const MENU_HEIGHT = 176;

export const JobsPage: FC = () => {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Open" | "Closed">("Open");
  const [locationFilter, setLocationFilter] = useState("All");
  const [showMore, setShowMore] = useState(false);

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "created",
    dir: "desc",
  });

  // Row menu lives outside the table (fixed position) so the table's
  // overflow container can't clip it.
  const [menu, setMenu] = useState<{ job: JobRow; top: number; left: number } | null>(null);

  // -- Load + realtime -------------------------------------------------------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [j, c] = await Promise.all([fetchJobs(), fetchCandidates()]);
        setJobs(j as JobRow[]);
        setCandidates(c);
      } catch (err) {
        console.error("Failed to load jobs", err);
        setError("Couldn't load job postings. Check your Supabase connection.");
      } finally {
        setLoading(false);
      }
    })();

    // Keeps the table in sync with public.jobs (needs the table in the
    // `supabase_realtime` publication).
    const unsubscribe = subscribeToJobs({
      onInsert: (job) =>
        setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [job as JobRow, ...prev])),
      onUpdate: (job) => setJobs((prev) => prev.map((j) => (j.id === job.id ? (job as JobRow) : j))),
      onDelete: (id) => setJobs((prev) => prev.filter((j) => j.id !== id)),
    });
    return () => unsubscribe();
  }, []);

  // Close the menu on any scroll / resize so it never floats away from its row.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  // -- Derived -----------------------------------------------------------------
  // Key counts by normalized job title so candidates added manually (without
  // a job_id) are still counted — mirrors how JobDetailPage filters them.
  const counts = useMemo(() => {
    const map: Record<string, { total: number; fresh: number }> = {};
    for (const c of candidates) {
      const key = (c.applied_position ?? "").trim().toLowerCase();
      if (!key) continue;
      const entry = (map[key] ??= { total: 0, fresh: 0 });
      entry.total++;
      if (c.status === DEFAULT_STAGE_NAMES[0]) entry.fresh++;
    }
    return map;
  }, [candidates]);

  const locationOptions = useMemo(
    () => Array.from(new Set(jobs.map(locationOf).filter(Boolean))).sort(),
    [jobs]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = jobs.filter((j) => {
      if (q && !j.job_title.toLowerCase().includes(q)) return false;
      if (statusFilter !== "All" && j.status !== statusFilter) return false;
      if (locationFilter !== "All" && locationOf(j) !== locationFilter) return false;
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) =>
      sort.key === "title"
        ? a.job_title.localeCompare(b.job_title) * dir
        : (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()) * dir
    );
  }, [jobs, search, statusFilter, locationFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  // -- Actions -----------------------------------------------------------------
  function openMenu(e: React.MouseEvent<HTMLButtonElement>, job: JobRow) {
    if (menu?.job.id === job.id) {
      setMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const openUp = rect.bottom + MENU_HEIGHT > window.innerHeight;
    setMenu({
      job,
      top: openUp ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - MENU_WIDTH),
    });
  }

  async function handleToggleStatus(job: JobRow) {
    setMenu(null);
    try {
      const updated = await updateJobStatus(job.id, job.status === "Open" ? "Closed" : "Open");
      setJobs((prev) => prev.map((j) => (j.id === job.id ? (updated as JobRow) : j)));
    } catch (err) {
      console.error(err);
      setError("Couldn't update that job's status.");
    }
  }

  async function handleDelete(job: JobRow) {
    setMenu(null);
    if (!window.confirm(`Delete the "${job.job_title}" posting? This can't be undone.`)) return;
    try {
      await deleteJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
    } catch (err) {
      console.error(err);
      setError("Couldn't delete that job posting.");
    }
  }

  async function copyLink(job: JobRow) {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/apply/${job.id}`);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  }

  const activeChips: { label: string; clear: () => void }[] = [];
  if (statusFilter !== "All")
    activeChips.push({ label: `Status: ${statusFilter}`, clear: () => setStatusFilter("All") });
  if (locationFilter !== "All")
    activeChips.push({ label: `Location: ${locationFilter}`, clear: () => setLocationFilter("All") });

  // -- Render --------------------------------------------------------------------
  return (
    <div className="px-6 py-6">
      <div className="rounded-xl border bg-card p-5">
          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button className="gap-2" onClick={() => navigate("/recruitment/jobs/new")}>
              <Plus className="h-4 w-4" />
              Add new job
            </Button>

            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by job title"
                className="pl-9"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filter by
            </span>

            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as typeof statusFilter)}
              options={["All", "Open", "Closed"]}
            />
            <FilterSelect
              label="Location"
              value={locationFilter}
              onChange={setLocationFilter}
              options={["All", ...locationOptions]}
            />
            <button
              onClick={() => setShowMore((s) => !s)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium",
                showMore ? "border-primary/30 bg-primary/10 text-primary" : "bg-card hover:bg-muted/40"
              )}
            >
              More
            </button>
          </div>

          {showMore && (
            <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              More filters (team, country, job type) will show here once those columns exist on public.jobs.
            </p>
          )}

          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeChips.map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {chip.label}
                  <button onClick={chip.clear} aria-label={`Clear ${chip.label}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Table */}
          <div className="mt-4 overflow-x-auto rounded-lg border">
            {loading ? (
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Briefcase className="mx-auto mb-3 h-10 w-10" />
                <p className="text-sm">
                  {jobs.length === 0 ? "No job postings yet. Create your first one." : "No jobs match these filters."}
                </p>
              </div>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <tr>
                    <Th>
                      <SortButton label="Job title" onClick={() => toggleSort("title")} />
                    </Th>
                    <Th className="text-center">New</Th>
                    <Th className="text-center">Total</Th>
                    <Th>Location</Th>
                    <Th>Status</Th>
                    <Th>
                      <SortButton label="Created on" onClick={() => toggleSort("created")} />
                    </Th>
                    <Th className="text-center">More options</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((job) => {
                    const c = counts[job.job_title.trim().toLowerCase()] ?? { total: 0, fresh: 0 };
                    return (
                      <tr key={job.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-5">
                          <button
                            onClick={() => navigate(`/recruitment/jobs/${job.id}`)}
                            className="text-left font-medium text-primary hover:underline"
                          >
                            {job.job_title}
                          </button>
                        </td>
                        <td className="px-4 py-5 text-center">
                          <CountBubble value={c.fresh} />
                        </td>
                        <td className="px-4 py-5 text-center">
                          <CountBubble value={c.total} />
                        </td>
                        <td className="px-4 py-5 text-muted-foreground">{locationOf(job) || "—"}</td>
                        <td className="px-4 py-5">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-[11px] font-bold uppercase",
                              job.status === "Open"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-5 text-muted-foreground">
                          {job.created_at ? new Date(job.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-5 text-center">
                          <button
                            onClick={(e) => openMenu(e, job)}
                            className="rounded p-1 hover:bg-muted"
                            aria-label="More options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
      </div>

      {/* Row menu (rendered once, fixed-position so table overflow can't clip it) */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 rounded-lg border bg-popover p-1 text-left shadow-md"
            style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
          >
            <MenuItem icon={LinkIcon} label="Copy apply link" onClick={() => copyLink(menu.job)} />
            <MenuItem
              icon={ExternalLink}
              label="Preview"
              onClick={() => {
                window.open(`/apply/${menu.job.id}`, "_blank", "noreferrer");
                setMenu(null);
              }}
            />
            <MenuItem
              icon={menu.job.status === "Open" ? Lock : Unlock}
              label={menu.job.status === "Open" ? "Mark closed" : "Mark open"}
              onClick={() => handleToggleStatus(menu.job)}
            />
            <MenuItem icon={Trash2} label="Delete" danger onClick={() => handleDelete(menu.job)} />
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const Th: FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <th className={cn("px-4 py-3", className)}>{children}</th>
);

const SortButton: FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1.5 hover:text-foreground">
    {label}
    <ArrowUpDown className="h-3 w-3" />
  </button>
);

const CountBubble: FC<{ value: number }> = ({ value }) => (
  <span
    className={cn(
      "inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
      value > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
    )}
  >
    {value}
  </span>
);

const FilterSelect: FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1 text-sm">
    <span className="font-medium">{label}:</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent text-sm text-muted-foreground focus:outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </label>
);

const MenuItem: FC<{
  icon: FC<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon: Icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
      danger && "text-destructive"
    )}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

export default JobsPage;