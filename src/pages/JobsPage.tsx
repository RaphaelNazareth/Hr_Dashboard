import { type FC, type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import {
  fetchJobs,
  createJob,
  updateJobStatus,
  deleteJob,
  subscribeToJobs,
} from "@/lib/candidateBoard";
import type { JobRecord, NewJobInput } from "@/lib/candidateBoard";

// public.jobs — see the schema for the full column list. Realtime updates
// require the table to be added to Supabase's `supabase_realtime`
// publication (Database → Replication in the dashboard) so INSERT/UPDATE/
// DELETE events actually reach this page.

interface JobFormState {
  job_title: string;
  job_description: string;
  requirements: string;
  status: "Open" | "Closed";
}

function emptyJobForm(): JobFormState {
  return { job_title: "", job_description: "", requirements: "", status: "Open" };
}

export const JobsPage: FC = () => {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
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
    // update, or delete on public.jobs (from this tab, another tab, another
    // user, or the Supabase dashboard) patches local state immediately
    // instead of waiting for a manual refresh.
    const unsubscribe = subscribeToJobs({
      onInsert: (job) => {
        setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [job, ...prev]));
      },
      onUpdate: (job) => {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
      },
      onDelete: (jobId) => {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJobs();
      setJobs(result);
    } catch (err) {
      console.error("Failed to load jobs", err);
      setError("Couldn't load job postings. Check your Supabase connection.");
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
    if (!form.job_title.trim() || !form.job_description.trim()) {
      setFormError("Job title and description are required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const payload: NewJobInput = {
        job_title: form.job_title.trim(),
        job_description: form.job_description.trim(),
        requirements: form.requirements.trim() || null,
        status: form.status,
      };
      const created = await createJob(payload);
      // The realtime INSERT event will also deliver this row; the dedupe
      // check in onInsert keeps it from being added twice.
      setJobs((prev) => (prev.some((j) => j.id === created.id) ? prev : [created, ...prev]));
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to create job", err);
      setFormError("Couldn't save this job posting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(job: JobRecord) {
    const nextStatus = job.status === "Open" ? "Closed" : "Open";
    try {
      const updated = await updateJobStatus(job.id, nextStatus);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));
    } catch (err) {
      console.error("Failed to update job status", err);
      setError("Couldn't update that job's status.");
    }
  }

  async function handleDelete(job: JobRecord) {
    if (!window.confirm(`Delete the "${job.job_title}" posting? This can't be undone.`)) return;
    try {
      await deleteJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
    } catch (err) {
      console.error("Failed to delete job", err);
      setError("Couldn't delete that job posting.");
    }
  }

  function applyLinkFor(job: JobRecord) {
    return `${window.location.origin}/apply/${job.id}`;
  }

  async function copyLink(job: JobRecord) {
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
                    <CardTitle className="text-lg leading-snug">{job.job_title}</CardTitle>
                    <Badge
                      className={cn(
                        "shrink-0 border-0 font-medium",
                        job.status === "Open"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {job.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {job.job_description}
                  </p>

                  {job.requirements && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Requirements
                      </p>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {job.requirements}
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

                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto gap-1.5"
                      onClick={() => handleToggleStatus(job)}
                    >
                      Mark {job.status === "Open" ? "Closed" : "Open"}
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
              <Label htmlFor="job_title" className="text-xs font-medium">
                Job title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="job_title"
                value={form.job_title}
                onChange={(e) => updateField("job_title", e.target.value)}
                placeholder="e.g. Senior Product Designer"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="job_description" className="text-xs font-medium">
                Job description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="job_description"
                rows={4}
                value={form.job_description}
                onChange={(e) => updateField("job_description", e.target.value)}
                placeholder="What this role does day-to-day…"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="requirements" className="text-xs font-medium">
                Requirements
              </Label>
              <Textarea
                id="requirements"
                rows={4}
                value={form.requirements}
                onChange={(e) => updateField("requirements", e.target.value)}
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