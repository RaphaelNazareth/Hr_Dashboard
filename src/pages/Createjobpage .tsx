import { type FC, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createJob } from "@/lib/candidateBoard";
import type { NewJobInput } from "@/lib/candidateBoard";
import {
  LOCKED_STAGES,
  defaultStages,
  fetchProcesses,
  saveProcess,
  type HiringProcess,
} from "@/lib/hiringProcesses";
import { COUNTRIES, INDONESIAN_CITIES } from "@/pages/indonesiancities";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

// Move to a Vite env var (import.meta.env.VITE_API_BASE) before deploying.
const API_BASE = "http://127.0.0.1:8000";

const JOB_TYPES = ["Permanent", "Contract", "Temporary", "Internship"];
const WORKING_HOURS = ["Full-time", "Part-time", "Casual"];
const EXPERIENCE = ["Entry Level", "Mid Level", "Senior", "Executive"];
const INDUSTRIES = ["Sales", "Engineering", "Design", "Operations", "Finance", "HR", "Marketing"];
const WORKPLACE = ["On-site", "Hybrid", "Remote"];

interface JobForm {
  job_title: string;
  country: string;
  city: string;
  job_type: string;
  working_hours: string;
  experience_level: string;
  industry: string;
  workplace_type: string;
  job_description: string;
  requirements: string;
  pay_min: string;
  pay_max: string;
  pay_visible: boolean;
}

const EMPTY: JobForm = {
  job_title: "",
  country: "Indonesia",
  city: "",
  job_type: JOB_TYPES[0],
  working_hours: WORKING_HOURS[0],
  experience_level: EXPERIENCE[0],
  industry: INDUSTRIES[0],
  workplace_type: WORKPLACE[0],
  job_description: "",
  requirements: "",
  pay_min: "",
  pay_max: "",
  pay_visible: true,
};

interface StageDraft {
  name: string;
  is_interview: boolean;
}

function initialStages(): StageDraft[] {
  return defaultStages().map(({ name, is_interview }) => ({ name, is_interview }));
}

function sameStages(a: StageDraft[], b: StageDraft[]) {
  return (
    a.length === b.length &&
    a.every((s, i) => s.name.trim() === b[i].name.trim() && s.is_interview === b[i].is_interview)
  );
}

// ---------------------------------------------------------------------------
// AI suggestions: POST /api/job-suggestions (job_suggestions.py on the backend)
// ---------------------------------------------------------------------------

type AiMode = "generate" | "rewrite";

async function requestAiSuggestions(
  form: JobForm,
  mode: AiMode
): Promise<{ job_description: string; requirements: string }> {
  const res = await fetch(`${API_BASE}/api/job-suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      job_title: form.job_title.trim(),
      industry: form.industry,
      experience_level: form.experience_level,
      job_type: form.job_type,
      working_hours: form.working_hours,
      workplace_type: form.workplace_type,
      city: form.city,
      country: form.country,
      job_description: form.job_description.trim(),
      requirements: form.requirements.trim(),
    }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const CreateJobPage: FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<JobForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // What the form held before the AI replaced it, so the HR can undo.
  const [aiUndo, setAiUndo] = useState<{ job_description: string; requirements: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hiring stages: pick a saved process as a starting point, then tweak freely.
  const [processes, setProcesses] = useState<HiringProcess[]>([]);
  const [processId, setProcessId] = useState("");
  const [stages, setStages] = useState<StageDraft[]>(initialStages());

  useEffect(() => {
    fetchProcesses().then(setProcesses).catch((err) => console.error("Failed to load processes", err));
  }, []);

  function set<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setCountry(country: string) {
    setForm((prev) => ({ ...prev, country, city: "" }));
  }

  // -- Stage editing ---------------------------------------------------------
  function pickProcess(id: string) {
    setProcessId(id);
    const p = processes.find((x) => x.id === id);
    setStages(
      p ? p.stages.map(({ name, is_interview }) => ({ name, is_interview })) : initialStages()
    );
  }

  function updateStage(i: number, patch: Partial<StageDraft>) {
    setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  // New stages go just before the locked tail (Hired / Rejected).
  function addStage() {
    setStages((prev) => {
      const tail = prev.findIndex((s) => LOCKED_STAGES.includes(s.name) && s.name !== "Applied");
      const at = tail === -1 ? prev.length : tail;
      const next = [...prev];
      next.splice(at, 0, { name: "", is_interview: false });
      return next;
    });
  }

  function moveStage(i: number, dir: -1 | 1) {
    setStages((prev) => {
      const j = i + dir;
      if (j < 1 || j >= prev.length || LOCKED_STAGES.includes(prev[j].name)) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // -- AI --------------------------------------------------------------------
  // Nothing written yet -> "generate". Anything written -> "rewrite".
  // The backend prompt ignores the draft if it is gibberish and generates anyway.
  const hasDraft = !!(form.job_description.trim() || form.requirements.trim());
  const aiMode: AiMode = hasDraft ? "rewrite" : "generate";
  const canUseAi = !!form.job_title.trim();

  async function handleAi() {
    if (!canUseAi || aiLoading) return;
    setAiLoading(true);
    setAiNote(null);
    try {
      const res = await requestAiSuggestions(form, aiMode);
      const nextDescription = res.job_description?.trim();
      const nextRequirements = res.requirements?.trim();
      if (!nextDescription && !nextRequirements) {
        setAiNote("The AI returned an empty answer. Try again.");
        return;
      }
      setAiUndo({ job_description: form.job_description, requirements: form.requirements });
      setForm((prev) => ({
        ...prev,
        job_description: nextDescription || prev.job_description,
        requirements: nextRequirements || prev.requirements,
      }));
    } catch (err) {
      console.error(err);
      setAiNote("Couldn't reach the AI. Check that the backend is running, then try again.");
    } finally {
      setAiLoading(false);
    }
  }

  function undoAi() {
    if (!aiUndo) return;
    setForm((prev) => ({ ...prev, ...aiUndo }));
    setAiUndo(null);
    setAiNote(null);
  }

  // -- Submit ----------------------------------------------------------------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.job_title.trim() || !form.job_description.trim()) {
      setError("Job title and description are required.");
      return;
    }
    if (stages.some((s) => !s.name.trim())) {
      setError("Every hiring stage needs a name.");
      return;
    }
    const names = stages.map((s) => s.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      setError("Hiring stage names must be unique.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Note: The hiring process logic has been commented out since 
      // hiring_process_id is not part of the current job schema.
      // Uncomment and implement when the schema supports it.
      
      const payload: NewJobInput = {
        job_title: form.job_title.trim(),
        job_description: form.job_description.trim(),
        requirements: form.requirements.trim() || null,
        status: "Open",
        country: form.country || null,
        city: form.city || null,
      };
      await createJob(payload);
      navigate("/jobs");
    } catch (err) {
      console.error("Failed to create job", err);
      setError("Couldn't save this job posting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const location = [form.city, form.country].filter(Boolean).join(", ");
  const hasPay = !!(form.pay_min || form.pay_max);

  const aiButtonLabel = aiLoading
    ? aiMode === "rewrite"
      ? "Rewriting…"
      : "Generating…"
    : aiMode === "rewrite"
      ? "Rewrite with AI"
      : "Generate with AI";

  return (
    <>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" onClick={() => navigate("/jobs")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <span>
            Recruitment / <span className="font-medium text-foreground">Create a job</span>
          </span>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: form */}
          <Card>
            <CardContent className="space-y-8 p-6">
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Section title="Job title and location">
                <Field label="Job title" required>
                  <Input
                    value={form.job_title}
                    onChange={(e) => set("job_title", e.target.value)}
                    placeholder="e.g. Account Executive"
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Country"
                    value={form.country}
                    options={COUNTRIES}
                    onChange={setCountry}
                  />
                  {form.country === "Indonesia" ? (
                    <SelectField
                      label="City / Suburb"
                      value={form.city}
                      options={INDONESIAN_CITIES}
                      placeholder="Select city"
                      onChange={(v) => set("city", v)}
                    />
                  ) : (
                    <Field label="City / Suburb">
                      <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
                    </Field>
                  )}
                </div>
              </Section>

              <Section title="Employment details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="Job type" value={form.job_type} options={JOB_TYPES} onChange={(v) => set("job_type", v)} />
                  <SelectField label="Working hours" value={form.working_hours} options={WORKING_HOURS} onChange={(v) => set("working_hours", v)} />
                  <SelectField label="Experience" value={form.experience_level} options={EXPERIENCE} onChange={(v) => set("experience_level", v)} />
                  <SelectField label="Industry" value={form.industry} options={INDUSTRIES} onChange={(v) => set("industry", v)} />
                </div>
                <SelectField label="Workplace type" value={form.workplace_type} options={WORKPLACE} onChange={(v) => set("workplace_type", v)} />
              </Section>

              <Section title="Hiring stages">
                <Field label="Start from">
                  <select
                    value={processId}
                    onChange={(e) => pickProcess(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Default pipeline</option>
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <ol className="space-y-2">
                  {stages.map((s, i) => {
                    const locked = LOCKED_STAGES.includes(s.name);
                    return (
                      <li key={i} className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2">
                        <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                        <Input
                          value={s.name}
                          disabled={locked}
                          onChange={(e) => updateStage(i, { name: e.target.value })}
                          placeholder="e.g. Technical Interview"
                          className="h-9"
                        />
                        <label className="flex shrink-0 items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={s.is_interview}
                            disabled={locked}
                            onChange={(e) => updateStage(i, { is_interview: e.target.checked })}
                            className="h-4 w-4 accent-primary"
                          />
                          Interview
                        </label>
                        {locked ? (
                          <Lock className="mx-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <div className="flex shrink-0">
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveStage(i, -1)} disabled={i <= 1}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => moveStage(i, 1)}
                              disabled={i + 1 >= stages.length || LOCKED_STAGES.includes(stages[i + 1].name)}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setStages((prev) => prev.filter((_, idx) => idx !== i))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>

                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addStage}>
                    <Plus className="h-4 w-4" /> Add stage
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Tick "Interview" to schedule a time when a candidate enters that stage.
                  </p>
                </div>
              </Section>

              <Section
                title="Job description"
                action={
                  <div className="flex items-center gap-2">
                    {aiUndo && !aiLoading && (
                      <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={undoAi}>
                        <Undo2 className="h-3.5 w-3.5" /> Undo
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-purple-400/60 bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 dark:text-purple-300"
                      onClick={handleAi}
                      disabled={aiLoading || !canUseAi}
                    >
                      {aiLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {aiButtonLabel}
                    </Button>
                  </div>
                }
              >
                {!canUseAi && (
                  <p className="text-xs text-muted-foreground">Enter a job title to use AI.</p>
                )}
                {aiNote && <p className="text-xs text-destructive">{aiNote}</p>}
                <Field label="Summary & responsibilities" required>
                  <Textarea
                    rows={8}
                    value={form.job_description}
                    onChange={(e) => set("job_description", e.target.value)}
                    placeholder="What this role does day-to-day…"
                    required
                  />
                </Field>
                <Field label="Requirements / qualifications">
                  <Textarea
                    rows={6}
                    value={form.requirements}
                    onChange={(e) => set("requirements", e.target.value)}
                    placeholder="One per line: qualifications, experience, skills…"
                  />
                </Field>
              </Section>

              <Section title="Pay rate">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Min">
                    <Input type="number" min={0} value={form.pay_min} onChange={(e) => set("pay_min", e.target.value)} />
                  </Field>
                  <Field label="Max">
                    <Input type="number" min={0} value={form.pay_max} onChange={(e) => set("pay_max", e.target.value)} />
                  </Field>
                </div>
                <label
                  htmlFor="pay_visible"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                >
                  <input
                    id="pay_visible"
                    type="checkbox"
                    checked={form.pay_visible}
                    onChange={(e) => set("pay_visible", e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Show pay rate to candidates
                </label>
              </Section>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="ghost" onClick={() => navigate("/jobs")} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" className="gap-2" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create job
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right: live preview */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <Card className="max-h-[calc(100vh-8rem)] overflow-y-auto">
              <CardContent className="p-6">
                <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>

                <h2 className="text-xl font-semibold">{form.job_title || "Job title"}</h2>
                <p className="text-sm text-muted-foreground">Mattel</p>

                {location && (
                  <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {location}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {[form.workplace_type, form.job_type, form.industry, form.working_hours, form.experience_level].map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>

                {hasPay && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {form.pay_visible
                      ? `Pay: ${form.pay_min || "—"} – ${form.pay_max || "—"}`
                      : "Pay rate hidden from candidates"}
                  </p>
                )}

                <div className="mt-5">
                  <p className="mb-2 text-sm font-semibold">Hiring process</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {stages.map((s, i) => (
                      <span
                        key={i}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          s.is_interview
                            ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "text-muted-foreground"
                        )}
                      >
                        {s.name || "Untitled"}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <p className="mb-1 text-sm font-semibold">Summary</p>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {form.job_description.trim() || "Job description will appear here."}
                  </p>
                </div>

                {form.requirements.trim() && (
                  <div className="mt-5">
                    <p className="mb-1 text-sm font-semibold">Qualifications</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {form.requirements
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </form>
      </main>
    </>
  );
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const Section: FC<{ title: string; action?: ReactNode; children: ReactNode }> = ({ title, action, children }) => (
  <section className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-base font-semibold">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

const Field: FC<{ label: string; required?: boolean; children: ReactNode }> = ({ label, required, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium">
      {label}
      {required && <span className="text-destructive"> *</span>}
    </Label>
    {children}
  </div>
);

const SelectField: FC<{ label: string; value: string; options: string[]; placeholder?: string; onChange: (v: string) => void }> = ({
  label,
  value,
  options,
  placeholder,
  onChange,
}) => (
  <Field label={label}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </Field>
);

export default CreateJobPage;