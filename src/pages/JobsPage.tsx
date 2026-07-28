import { type FC, type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Briefcase,
  Plus,
  Loader2,
  Link as LinkIcon,
  Check,
  Trash2,
  Users,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090"
);
pb.autoCancellation(false);

// This is a separate PocketBase collection from Operator_dataset /
// Candidate_Tracking — it just holds the job postings themselves. Create it
// in the PocketBase admin UI with these fields if it doesn't exist yet:
//   Job_Title (text, required)
//   Job_Description (text/editor, required)
//   Requirements (text/editor, required)
//   Status ("Open" | "Closed", default "Open")
// Its API "List/Search" and "View" rules need to allow public read (empty
// rule) since ApplyPage fetches a job by id without auth.
const JOBS_COLLECTION = "Jobs";

interface Job extends RecordModel {
  Job_Title: string;
  Job_Description: string;
  Requirements: string;
  Status: "Open" | "Closed";
  created: string;
}

interface JobFormState {
  Job_Title: string;
  Job_Description: string;
  Requirements: string;
  Status: "Open" | "Closed";
}

function emptyJobForm(): JobFormState {
  return { Job_Title: "", Job_Description: "", Requirements: "", Status: "Open" };
}

export const JobsPage: FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<JobFormState>(emptyJobForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    void loadJobs();

    // Keep this page in sync with the database in real time — any create,
    // update, or delete on the Jobs collection (from this tab, another tab,
    // another user, or the PocketBase admin UI) patches local state
    // immediately instead of waiting for a manual refresh.
    let unsubscribe: (() => void) | undefined;

    pb.collection(JOBS_COLLECTION)
      .subscribe<Job>("*", (e) => {
        setJobs((prev) => {
          if (e.action === "create") {
            if (prev.some((j) => j.id === e.record.id)) return prev;
            return [e.record, ...prev];
          }
          if (e.action === "update") {
            return prev.map((j) => (j.id === e.record.id ? e.record : j));
          }
          if (e.action === "delete") {
            return prev.filter((j) => j.id !== e.record.id);
          }
          return prev;
        });
      })
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch((err) => {
        console.error("Failed to subscribe to Jobs realtime updates", err);
      });

    return () => {
      unsubscribe?.();
    };
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const result = await pb.collection(JOBS_COLLECTION).getFullList<Job>({
        sort: "-created",
      });
      setJobs(result);
    } catch (err) {
      console.error("Failed to load jobs", err);
      setError("Couldn't load job postings. Check your PocketBase connection.");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(emptyJobForm());
    setFormError(null);
    setIsOpen(true);
  }

  function updateField<K extends keyof JobFormState>(field: K, value: JobFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.Job_Title.trim() || !form.Job_Description.trim()) {
      setFormError("Job title and description are required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const created = await pb.collection(JOBS_COLLECTION).create<Job>({
        Job_Title: form.Job_Title.trim(),
        Job_Description: form.Job_Description.trim(),
        Requirements: form.Requirements.trim(),
        Status: form.Status,
      });
      setJobs((prev) => [created, ...prev]);
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to create job", err);
      setFormError("Couldn't save this job posting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(job: Job) {
    const nextStatus = job.Status === "Open" ? "Closed" : "Open";
    try {
      const updated = await pb
        .collection(JOBS_COLLECTION)
        .update<Job>(job.id, { Status: nextStatus });
      setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));
    } catch (err) {
      console.error("Failed to update job status", err);
      setError("Couldn't update that job's status.");
    }
  }

  async function handleDelete(job: Job) {
    if (!window.confirm(`Delete the "${job.Job_Title}" posting? This can't be undone.`)) return;
    try {
      await pb.collection(JOBS_COLLECTION).delete(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
    } catch (err) {
      console.error("Failed to delete job", err);
      setError("Couldn't delete that job posting.");
    }
  }

  function applyLinkFor(job: Job) {
    return `${window.location.origin}/apply/${job.id}`;
  }

  async function copyLink(job: Job) {
    try {
      await navigator.clipboard.writeText(applyLinkFor(job));
      setCopiedId(job.id);
      setTimeout(() => setCopiedId((id) => (id === job.id ? null : id)), 1800);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  }

  return (
    <>
      <Header />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Job Postings</h1>
            <p className="text-muted-foreground mt-1">
              Create a job, then share its application link with candidates.
            </p>
          </div>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Job
          </Button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
            <Briefcase className="mx-auto mb-3 h-10 w-10" />
            <p className="text-sm">No job postings yet. Create your first one.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {jobs.map((job) => (
              <Card key={job.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-snug">{job.Job_Title}</CardTitle>
                    <Badge
                      className={cn(
                        "shrink-0 border-0 font-medium",
                        job.Status === "Open"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {job.Status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {job.Job_Description}
                  </p>

                  {job.Requirements && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Requirements
                      </p>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {job.Requirements}
                      </p>
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyLink(job)}>
                      {copiedId === job.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <LinkIcon className="h-3.5 w-3.5" /> Copy link
                        </>
                      )}
                    </Button>

                    <Link to={`/apply/${job.id}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> Preview
                      </Button>
                    </Link>

                    <Link to={`/pipeline?position=${encodeURIComponent(job.Job_Title)}`}>
                      <Button size="sm" variant="ghost" className="gap-1.5">
                        <Users className="h-3.5 w-3.5" /> Applicants
                      </Button>
                    </Link>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto gap-1.5"
                      onClick={() => handleToggleStatus(job)}
                    >
                      Mark {job.Status === "Open" ? "Closed" : "Open"}
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(job)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* New Job dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Job Posting</DialogTitle>
            <DialogDescription>
              Candidates will see this title, description, and requirements on the
              application form.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="Job_Title" className="text-xs font-medium">
                Job title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="Job_Title"
                value={form.Job_Title}
                onChange={(e) => updateField("Job_Title", e.target.value)}
                placeholder="e.g. Senior Product Designer"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="Job_Description" className="text-xs font-medium">
                Job description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="Job_Description"
                rows={4}
                value={form.Job_Description}
                onChange={(e) => updateField("Job_Description", e.target.value)}
                placeholder="What this role does day-to-day…"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="Requirements" className="text-xs font-medium">
                Requirements
              </Label>
              <Textarea
                id="Requirements"
                rows={4}
                value={form.Requirements}
                onChange={(e) => updateField("Requirements", e.target.value)}
                placeholder="Qualifications, experience, skills…"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" className="gap-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create job
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobsPage;