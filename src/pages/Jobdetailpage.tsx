import { type FC, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  GraduationCap,
  GripVertical,
  List as ListIcon,
  LayoutGrid,
  Loader2,
  Save,
  User as UserIcon,
  SlidersHorizontal,
  CalendarClock,
  CalendarPlus,
  Send,
} from "lucide-react";
import {
  DEFAULT_STAGE_NAMES,
  fetchJobs,
  fetchCandidates,
  updateCandidateStatus,
  logTrackingEvent,
  fetchTrackingHistory,
  addCandidateNote,
  createInterviewSchedule,
  matchesCandidateSearch,
  NOTE_STAGE,
  isInterviewStage,
} from "@/lib/candidateBoard";
import type {
  JobRecord,
  CandidateRecord,
  TrackingRecord,
} from "@/lib/candidateBoard";

type ViewMode = "profile" | "kanban";

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function uniqueSorted(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter(Boolean))).sort() as string[];
}

function statusClass(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("reject")) return "bg-red-500/10 text-red-600 dark:text-red-400";
  if (s.includes("hire") || s.includes("offer"))
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (s.includes("interview")) return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
  if (s.includes("review") || s.includes("screen"))
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

// Field helper component for consistent form layout
const Field: React.FC<{ label: string; htmlFor: string; required?: boolean; hint?: string; children: React.ReactNode }> = ({ label, htmlFor, required, hint, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="block text-xs font-medium">
      {label}
      {required && <span className="text-destructive"> *</span>}
      {hint && <span className="ml-1 font-normal text-muted-foreground">({hint})</span>}
    </label>
    {children}
  </div>
);

export const JobDetailPage: FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobRecord | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("profile");
  const [query, setQuery] = useState("");
  const [stageTab, setStageTab] = useState<string>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [cityFilter, setCityFilter] = useState("all");
  const [educationFilter, setEducationFilter] = useState("all");
  const [noticeFilter, setNoticeFilter] = useState("all");
  const [mattelFilter, setMattelFilter] = useState<"all" | "yes" | "no">("all");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");

  // Detail-panel data
  const [logs, setLogs] = useState<TrackingRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsVersion, setLogsVersion] = useState(0);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Interview scheduling state
  const [interviewQueue, setInterviewQueue] = useState<{ candidate: CandidateRecord; stage: string }[]>([]);
  const [interviewDateTime, setInterviewDateTime] = useState("");
  const [interviewEndTime, setInterviewEndTime] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [schedulingInterview, setSchedulingInterview] = useState(false);

  // Onboarding state
  const [onboardingQueue, setOnboardingQueue] = useState<CandidateRecord[]>([]);
  const onboardingPrompt = onboardingQueue[0] ?? null;
  const [onbTitle, setOnbTitle] = useState("Onboarding");
  const [onbStart, setOnbStart] = useState("");
  const [onbEnd, setOnbEnd] = useState("");
  const [onbNotes, setOnbNotes] = useState("");
  const [savingOnboarding, setSavingOnboarding] = useState(false);

  // -- Load job + its candidates --------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [jobs, all] = await Promise.all([fetchJobs(), fetchCandidates()]);
        if (cancelled) return;
        const found = jobs.find((j) => j.id === jobId) ?? null;
        if (!found) {
          setError("Job not found.");
          return;
        }
        setJob(found);
        setCandidates(
          all.filter(
            (c) =>
              c.applied_position?.trim().toLowerCase() ===
              found.job_title.trim().toLowerCase()
          )
        );
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Couldn't load this job. Check your Supabase connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // -- Derived ----------------------------------------------------------------
  const searched = useMemo(() => {
    const min = ageMin.trim() ? Number(ageMin) : null;
    const max = ageMax.trim() ? Number(ageMax) : null;

    return candidates.filter((c) => {
      if (!matchesCandidateSearch(c, query)) return false;
      if (cityFilter !== "all" && c.city !== cityFilter) return false;
      if (educationFilter !== "all" && c.education !== educationFilter) return false;
      if (noticeFilter !== "all" && c.notice_period !== noticeFilter) return false;
      if (mattelFilter !== "all" && !!c.former_current_mattel_employee !== (mattelFilter === "yes"))
        return false;
      if (min !== null && (c.age == null || c.age < min)) return false;
      if (max !== null && (c.age == null || c.age > max)) return false;
      return true;
    });
  }, [candidates, query, cityFilter, educationFilter, noticeFilter, mattelFilter, ageMin, ageMax]);

  const cityOptions = useMemo(() => uniqueSorted(candidates.map((c) => c.city)), [candidates]);
  const educationOptions = useMemo(() => uniqueSorted(candidates.map((c) => c.education)), [candidates]);
  const noticeOptions = useMemo(() => uniqueSorted(candidates.map((c) => c.notice_period)), [candidates]);

  const activeFilterCount =
    [cityFilter, educationFilter, noticeFilter, mattelFilter].filter((v) => v !== "all").length +
    (ageMin || ageMax ? 1 : 0);

  function clearFilters() {
    setCityFilter("all");
    setEducationFilter("all");
    setNoticeFilter("all");
    setMattelFilter("all");
    setAgeMin("");
    setAgeMax("");
  }

  const countByStage = useMemo(() => {
    const map: Record<string, number> = { All: searched.length };
    DEFAULT_STAGE_NAMES.forEach((n) => (map[n] = 0));
    searched.forEach((c) => {
      map[c.status] = (map[c.status] ?? 0) + 1;
    });
    return map;
  }, [searched]);

  const visible = useMemo(
    () => (stageTab === "All" ? searched : searched.filter((c) => c.status === stageTab)),
    [searched, stageTab]
  );

  // Fall back to the first visible candidate if nothing (valid) is selected.
  const active = visible.find((c) => c.id === selectedId) ?? visible[0] ?? null;
  const activeIndex = active ? visible.findIndex((c) => c.id === active.id) : -1;

  // -- Tracking history for the open candidate -----------------------------
  useEffect(() => {
    if (!active) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    setLoadingLogs(true);
    fetchTrackingHistory(active.id)
      .then((entries) => !cancelled && setLogs(entries))
      .catch((err) => console.error("Failed to load history", err))
      .finally(() => !cancelled && setLoadingLogs(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, logsVersion]);

  const noteEntries = logs.filter((l) => l.stage === NOTE_STAGE);
  const stageHistory = logs.filter((l) => l.stage !== NOTE_STAGE);

  // -- Actions ---------------------------------------------------------------
  // Interview scheduling helpers
  const interviewPrompt = interviewQueue[0] ?? null;

  function enqueueInterviews(items: { candidate: CandidateRecord; stage: string }[]) {
    setInterviewDateTime("");
    setInterviewEndTime("");
    setInterviewNotes("");
    setInterviewQueue((q) => [...q, ...items]);
  }

  function closeInterviewPrompt() {
    setInterviewDateTime("");
    setInterviewEndTime("");
    setInterviewNotes("");
    setInterviewQueue((q) => q.slice(1));
    setLogsVersion((v) => v + 1);
  }

  const isHiredStage = (stage: string) => stage.trim().toLowerCase() === "hired";

  function enqueueOnboarding(candidate: CandidateRecord) {
    setOnbTitle("Onboarding");
    setOnbStart("");
    setOnbEnd("");
    setOnbNotes("");
    setOnboardingQueue((q) => [...q, candidate]);
  }

  function closeOnboardingPrompt() {
    setOnbTitle("Onboarding");
    setOnbStart("");
    setOnbEnd("");
    setOnbNotes("");
    setOnboardingQueue((q) => q.slice(1));
  }

  async function handleSaveOnboarding(e: React.FormEvent) {
    e.preventDefault();
    if (!onboardingPrompt || !onbStart || !onbTitle.trim()) return;
    setSavingOnboarding(true);
    try {
      const { error: insertError } = await supabase.from("onboarding_tasks").insert({
        candidate_id: onboardingPrompt.id,
        title: onbTitle.trim(),
        start_time: new Date(onbStart).toISOString(),
        end_time: buildEndIso(onbStart, onbEnd),
        notes: onbNotes.trim() || null,
      });
      if (insertError) throw insertError;
      closeOnboardingPrompt();
    } catch (err) {
      console.error("Failed to schedule onboarding", err);
      setError("Couldn't save the onboarding schedule. Please try again.");
    } finally {
      setSavingOnboarding(false);
    }
  }

  async function handleSkipInterview() {
    if (!interviewPrompt) return;
    const { candidate, stage } = interviewPrompt;
    try {
      await logTrackingEvent({
        candidateId: candidate.id,
        stage,
        date: new Date().toISOString(),
        notes: "Interview time not scheduled yet.",
      });
    } catch (err) {
      console.error(err);
      setError("Couldn't record that stage change in the candidate's history.");
    }
    closeInterviewPrompt();
  }

  async function persistInterview() {
    if (!interviewPrompt) return;
    const { candidate, stage } = interviewPrompt;
    
    const startLabel = interviewDateTime ? new Date(interviewDateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const timeRange = interviewEndTime ? `${startLabel}–${interviewEndTime}` : startLabel;
    const notes = interviewDateTime ? `Time: ${timeRange}\n${interviewNotes.trim()}` : interviewNotes.trim();

    const tracking = await logTrackingEvent({
      candidateId: candidate.id,
      stage,
      date: interviewDateTime ? new Date(interviewDateTime).toISOString() : new Date().toISOString(),
      notes: notes || undefined,
    });

    if (interviewDateTime) {
      try {
        await createInterviewSchedule({
          candidateId: candidate.id,
          trackingId: tracking.id,
          stage,
          startTime: new Date(interviewDateTime).toISOString(),
          endTime: buildEndIso(interviewDateTime, interviewEndTime),
          notes: interviewNotes.trim() || undefined,
        });
      } catch (err) {
        console.error("Failed to create interview_schedule row", err);
        setError("Stage change was saved, but the interview schedule entry failed.");
      }
    }
  }

  function buildEndIso(startDateTimeLocal: string, endTimeOnly: string) {
    if (!endTimeOnly) {
      return new Date(new Date(startDateTimeLocal).getTime() + 60 * 60 * 1000).toISOString();
    }
    const datePart = startDateTimeLocal.split("T")[0];
    return new Date(`${datePart}T${endTimeOnly}`).toISOString();
  }

  async function handleConfirmInterview(e: React.FormEvent) {
    e.preventDefault();
    if (!interviewPrompt) return;
    if (!interviewDateTime) {
      setError("Please provide an interview date and time.");
      return;
    }

    setSchedulingInterview(true);
    try {
      await persistInterview();
      closeInterviewPrompt();
    } catch (err) {
      console.error("Failed to schedule interview", err);
      setError("Couldn't save the interview time — please try again.");
    } finally {
      setSchedulingInterview(false);
    }
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const toLocalInput = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function handleAddToGoogleCalendar() {
    if (!interviewPrompt || !interviewDateTime) return;
    const { candidate, stage } = interviewPrompt;

    const title = encodeURIComponent(`${stage} - ${candidate.first_name} ${candidate.last_name}`);
    const details = encodeURIComponent(interviewNotes || `Please attend the interview at ${new Date(interviewDateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    const datePart = interviewDateTime.split("T")[0];
    const start = `${interviewDateTime.replace(/[-:]/g, "")}00`;
    const end = (
      interviewEndTime
        ? `${datePart}T${interviewEndTime}`
        : toLocalInput(new Date(new Date(interviewDateTime).getTime() + 60 * 60 * 1000))
    ).replace(/[-:]/g, "") + "00";

    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleSendInterviewEmail() {
    if (!interviewPrompt || !interviewDateTime) return;
    const { candidate, stage } = interviewPrompt;

    if (!candidate.email) {
      setError("Kandidat ini belum ada email-nya di database.");
      return;
    }

    setSchedulingInterview(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/send-interview-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: candidate.email,
          candidateName: `${candidate.first_name} ${candidate.last_name}`,
          stageName: stage,
          startDateTime: interviewDateTime,
          endTime: interviewEndTime,
          notes: interviewNotes.trim(),
        }),
      });
      if (!res.ok) throw new Error("Request failed");
    } catch (err) {
      console.error("Failed to email candidate", err);
      setError("Gagal kirim email ke kandidat — kabari manual dulu ya.");
    } finally {
      setSchedulingInterview(false);
    }
  }

  async function moveCandidate(candidate: CandidateRecord, stage: string) {
    if (candidate.status === stage) return;
    const snapshot = candidates;

    // optimistic
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidate.id ? { ...c, status: stage as CandidateRecord["status"] } : c
      )
    );

    try {
      await updateCandidateStatus(candidate.id, stage);
      
      if (isInterviewStage(stage)) {
        enqueueInterviews([{ candidate, stage }]);
      } else {
        await logTrackingEvent({
          candidateId: candidate.id,
          stage,
          date: new Date().toISOString(),
        });
        if (isHiredStage(stage)) enqueueOnboarding(candidate);
      }
      
      setLogsVersion((v) => v + 1);
    } catch (err) {
      console.error("Failed to move candidate", err);
      setCandidates(snapshot);
      setError("Couldn't save that move — please try again.");
    }
  }

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const candidate = candidates.find((c) => c.id === draggableId);
    if (candidate) void moveCandidate(candidate, destination.droppableId);
  }

  async function saveNote() {
    if (!active || !noteDraft.trim()) return;
    setSavingNote(true);
    try {
      const entry = await addCandidateNote(active.id, noteDraft.trim());
      setLogs((prev) => [entry, ...prev]);
      setNoteDraft("");
    } catch (err) {
      console.error("Failed to save note", err);
    } finally {
      setSavingNote(false);
    }
  }

  function openFromKanban(c: CandidateRecord) {
    setSelectedId(c.id);
    setStageTab("All");
    setView("profile");
  }

  function goPrev() {
    if (activeIndex > 0) setSelectedId(visible[activeIndex - 1].id);
  }
  function goNext() {
    if (activeIndex >= 0 && activeIndex < visible.length - 1)
      setSelectedId(visible[activeIndex + 1].id);
  }

  // -- Render -----------------------------------------------------------------
  return (
    <>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* Breadcrumb + back */}
        <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5"
            onClick={() => navigate("/jobs")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span>
            <button className="hover:underline" onClick={() => navigate("/jobs")}>
              Recruitment
            </button>
            {" / "}
            <span className="font-medium text-foreground">{job?.job_title ?? "…"}</span>
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !job ? null : (
          <>
            {/* Job header */}
            <Card className="mb-6">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h1 className="text-2xl font-bold tracking-tight">{job.job_title}</h1>
                      <Badge
                        className={cn(
                          "border-0 font-medium",
                          job.status === "Open"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-muted-foreground">
                      {job.job_description}
                    </p>
                  </div>

                  <div className="flex items-center rounded-lg border p-1">
                    <Button
                      size="sm"
                      variant={view === "profile" ? "secondary" : "ghost"}
                      className="gap-2"
                      onClick={() => setView("profile")}
                    >
                      <ListIcon className="h-4 w-4" />
                      Profile
                    </Button>
                    <Button
                      size="sm"
                      variant={view === "kanban" ? "secondary" : "ghost"}
                      className="gap-2"
                      onClick={() => setView("kanban")}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      Kanban
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="relative w-full max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search name, skills, or keywords…"
                      className="pl-9"
                    />
                  </div>

                  <button
                    onClick={() => setShowFilters((s) => !s)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm",
                      showFilters ? "border-primary/30 bg-primary/10 text-primary" : "bg-card hover:bg-muted/40"
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {activeFilterCount > 0 && (
                    <button onClick={clearFilters} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                      Clear all
                    </button>
                  )}
                </div>

                {showFilters && (
                  <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
                    <FilterSelect label="City" value={cityFilter} onChange={setCityFilter} allLabel="All cities" options={cityOptions} />
                    <FilterSelect label="Education" value={educationFilter} onChange={setEducationFilter} allLabel="All levels" options={educationOptions} />
                    <FilterSelect label="Notice Period" value={noticeFilter} onChange={setNoticeFilter} allLabel="All" options={noticeOptions} />

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Mattel Employee</label>
                      <select
                        value={mattelFilter}
                        onChange={(e) => setMattelFilter(e.target.value as "all" | "yes" | "no")}
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                      >
                        <option value="all">All</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Age range</label>
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} value={ageMin} onChange={(e) => setAgeMin(e.target.value)}
                          placeholder="Min" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm" />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input type="number" min={0} value={ageMax} onChange={(e) => setAgeMax(e.target.value)}
                          placeholder="Max" className="w-full rounded-md border bg-background px-3 py-1.5 text-sm" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Stage tabs (profile mode only) */}
                {view === "profile" && (
                  <div className="mt-4 flex gap-1 overflow-x-auto border-b">
                    {["All", ...DEFAULT_STAGE_NAMES].map((name) => (
                      <button
                        key={name}
                        onClick={() => setStageTab(name)}
                        className={cn(
                          "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
                          stageTab === name
                            ? "border-primary font-medium text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {name}
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-foreground">
                          {countByStage[name] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {view === "profile" ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
                {/* Candidate list */}
                <Card className="flex h-[calc(100vh-22rem)] min-h-[420px] flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto">
                    {visible.length === 0 && (
                      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No candidates found.
                      </p>
                    )}
                    {visible.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedId(c.id);
                          setNoteDraft("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60",
                          active?.id === c.id && "bg-primary/10 hover:bg-primary/10"
                        )}
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className="text-sm font-medium">
                            {initials(c.first_name, c.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.first_name} {c.last_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            Applied {c.applied_at ? new Date(c.applied_at).toLocaleDateString() : "—"}
                          </p>
                        </div>
                        <Badge className={cn("shrink-0 border-0 text-[10px]", statusClass(c.status))}>
                          {c.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Candidate detail */}
                <Card className="h-[calc(100vh-22rem)] min-h-[420px] overflow-y-auto">
                  {!active ? (
                    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                      <UserIcon className="mb-3 h-10 w-10" />
                      <p className="text-sm">Select a candidate to view their profile</p>
                    </div>
                  ) : (
                    <CardContent className="p-6">
                      {/* Toolbar: prev / next / move to */}
                      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="gap-1" onClick={goPrev} disabled={activeIndex <= 0}>
                            <ChevronLeft className="h-4 w-4" /> Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1"
                            onClick={goNext}
                            disabled={activeIndex >= visible.length - 1}
                          >
                            Next <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Move to</span>
                          <select
                            value={active.status}
                            onChange={(e) => void moveCandidate(active, e.target.value)}
                            className="rounded-md border bg-background px-2.5 py-1.5 text-sm"
                          >
                            {DEFAULT_STAGE_NAMES.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Header */}
                      <div className="mb-6 flex items-start gap-4">
                        <Avatar className="h-16 w-16 shrink-0">
                          <AvatarFallback className="text-xl font-semibold">
                            {initials(active.first_name, active.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-xl font-semibold">
                              {active.first_name} {active.last_name}
                            </h2>
                            <Badge className={cn("border-0 font-medium", statusClass(active.status))}>
                              {active.status}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5" /> {active.email}
                            </span>
                            {active.phone_number && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3.5 w-3.5" /> {active.phone_number}
                              </span>
                            )}
                            {active.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" /> {active.city}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <Tabs defaultValue="about" key={active.id}>
                        <TabsList className="mb-6">
                          <TabsTrigger value="about">About</TabsTrigger>
                          <TabsTrigger value="resume">Resume</TabsTrigger>
                          <TabsTrigger value="notes">Notes</TabsTrigger>
                          <TabsTrigger value="history">History</TabsTrigger>
                        </TabsList>

                        <TabsContent value="about" className="space-y-6">
                          <section>
                            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                              <Briefcase className="h-4 w-4" /> Experience
                            </h3>
                            <p className="text-sm text-muted-foreground">{active.experience || "—"}</p>
                          </section>
                          <section>
                            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                              <GraduationCap className="h-4 w-4" /> Education
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {active.education || "—"}
                              {active.school ? ` · ${active.school}` : ""}
                            </p>
                          </section>
                          <section>
                            <h3 className="mb-2 text-sm font-semibold">Skills</h3>
                            <div className="flex flex-wrap gap-2">
                              {(active.skills || "")
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .map((s) => (
                                  <Badge key={s} variant="secondary" className="font-normal">
                                    {s}
                                  </Badge>
                                ))}
                              {!active.skills && <span className="text-sm text-muted-foreground">—</span>}
                            </div>
                          </section>
                          <section className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 text-sm">
                            <Info label="Age" value={active.age ?? "—"} />
                            <Info label="Notice Period" value={active.notice_period || "—"} />
                            <Info label="18+ Confirmed" value={active.is_18_plus ? "Yes" : "No"} />
                            <Info label="Legal Right to Work" value={active.legal_right_to_work ? "Yes" : "No"} />
                            <Info
                              label="Former/Current Mattel Employee"
                              value={active.former_current_mattel_employee ? "Yes" : "No"}
                            />
                            <Info
                              label="Applied On"
                              value={active.applied_at ? new Date(active.applied_at).toLocaleDateString() : "—"}
                            />
                          </section>
                        </TabsContent>

                        <TabsContent value="resume">
                          <div className="rounded-lg border p-4">
                            {active.resume_path ? (
                              <a
                                href={active.resume_path}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-primary underline underline-offset-2"
                              >
                                View resume file
                              </a>
                            ) : (
                              <p className="text-sm text-muted-foreground">No resume on file.</p>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="notes">
                          <Textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Add a note about this candidate…"
                            rows={4}
                          />
                          <Button
                            onClick={saveNote}
                            disabled={savingNote || !noteDraft.trim()}
                            size="sm"
                            className="mt-3 gap-1.5"
                          >
                            {savingNote ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            Add Note
                          </Button>
                          <div className="mt-6 space-y-3">
                            {loadingLogs ? (
                              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                            ) : noteEntries.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No notes yet.</p>
                            ) : (
                              noteEntries.map((n) => (
                                <div key={n.id} className="rounded-lg border p-3">
                                  <p className="text-xs text-muted-foreground">{formatDateTime(n.moved_at)}</p>
                                  <p className="mt-1 text-sm">{n.notes}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="history">
                          {loadingLogs ? (
                            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                          ) : stageHistory.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                              No history yet.
                            </div>
                          ) : (
                            <ol className="relative space-y-6 border-l pl-6">
                              {stageHistory.map((h) => (
                                <li key={h.id} className="relative">
                                  <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium">{h.stage}</p>
                                    <span className="text-xs text-muted-foreground">
                                      {formatDateTime(h.moved_at)}
                                    </span>
                                  </div>
                                  {h.notes && (
                                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                                      {h.notes}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ol>
                          )}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  )}
                </Card>
              </div>
            ) : (
              /* Kanban mode */
              <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {DEFAULT_STAGE_NAMES.map((stage) => {
                    const items = searched.filter((c) => c.status === stage);
                    return (
                      <div key={stage} className="w-72 shrink-0 rounded-xl border bg-muted/30 p-3">
                        <div className="mb-3 flex items-center gap-2">
                          <h3 className="font-semibold">{stage}</h3>
                          <span className="rounded-full bg-background px-2 py-0.5 text-xs">
                            {items.length}
                          </span>
                        </div>
                        <Droppable droppableId={stage}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={cn(
                                "flex min-h-[320px] flex-col gap-2 rounded-lg p-1 transition-colors",
                                snapshot.isDraggingOver && "bg-primary/5"
                              )}
                            >
                              {items.length === 0 && (
                                <div className="flex min-h-[100px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                                  No candidates
                                </div>
                              )}
                              {items.map((c, index) => (
                                <Draggable key={c.id} draggableId={c.id} index={index}>
                                  {(drag) => (
                                    <div
                                      ref={drag.innerRef}
                                      {...drag.draggableProps}
                                      onClick={() => openFromKanban(c)}
                                      className="cursor-pointer rounded-lg border bg-background p-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="truncate font-medium leading-tight">
                                          {c.first_name} {c.last_name}
                                        </p>
                                        <div
                                          {...drag.dragHandleProps}
                                          onClick={(e) => e.stopPropagation()}
                                          className="cursor-grab"
                                        >
                                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                      </div>
                                      <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                                        {c.city && (
                                          <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" /> {c.city}
                                          </span>
                                        )}
                                        <span className="flex items-center gap-1 truncate">
                                          <Mail className="h-3 w-3" /> {c.email}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    );
                  })}
                </div>
              </DragDropContext>
            )}
          </>
        )}
      </main>

      {/* Schedule interview dialog */}
      <Dialog
        open={!!interviewPrompt}
        onOpenChange={(open) => {
          if (!open) void handleSkipInterview();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 fill-white stroke-black" />
              Schedule Interview
            </DialogTitle>
            <DialogDescription>
              {interviewPrompt && (
                <>
                  {interviewPrompt.candidate.first_name} {interviewPrompt.candidate.last_name} was moved to{" "}
                  <span className="font-medium">{interviewPrompt.stage}</span>. When is it scheduled for?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmInterview} className="space-y-4">
            <Field label="Start" htmlFor="interviewDateTime" required>
              <Input
                id="interviewDateTime"
                type="datetime-local"
                value={interviewDateTime}
                onChange={(e) => setInterviewDateTime(e.target.value)}
                required
              />
            </Field>

            <Field label="End Time" htmlFor="interviewEndTime" hint="Optional">
              <Input
                id="interviewEndTime"
                type="time"
                value={interviewEndTime}
                onChange={(e) => setInterviewEndTime(e.target.value)}
              />
            </Field>

            <Field label="Notes" htmlFor="interviewNotes" hint="Optional">
              <Textarea
                id="interviewNotes"
                rows={3}
                value={interviewNotes}
                onChange={(e) => setInterviewNotes(e.target.value)}
                placeholder="Interviewer, format, focus areas…"
              />
            </Field>

            <DialogFooter className="flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={handleAddToGoogleCalendar}
                disabled={!interviewDateTime}
              >
                <CalendarPlus className="h-4 w-4" />
                Add to Google Calendar
              </Button>

              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={handleSendInterviewEmail}
                disabled={schedulingInterview || !interviewPrompt?.candidate.email}
              >
                {schedulingInterview ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Email candidate
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={handleSkipInterview}
                disabled={schedulingInterview}
              >
                Skip for now
              </Button>
              <Button type="submit" className="gap-2" disabled={schedulingInterview || !interviewDateTime}>
                {schedulingInterview && <Loader2 className="h-4 w-4 animate-spin" />}
                Save time
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Onboarding scheduling dialog */}
      <Dialog
        open={!!onboardingPrompt}
        onOpenChange={(open) => {
          if (!open) closeOnboardingPrompt();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Schedule Onboarding
            </DialogTitle>
            <DialogDescription>
              {onboardingPrompt && (
                <>
                  {onboardingPrompt.first_name} {onboardingPrompt.last_name} was moved to{" "}
                  <span className="font-medium">Hired</span>. When does onboarding start?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveOnboarding} className="space-y-4">
            <Field label="Title" htmlFor="onbTitle" required>
              <Input id="onbTitle" value={onbTitle} onChange={(e) => setOnbTitle(e.target.value)} placeholder="Orientation, contract signing…" required />
            </Field>
            <Field label="Start" htmlFor="onbStart" required>
              <Input id="onbStart" type="datetime-local" value={onbStart} onChange={(e) => setOnbStart(e.target.value)} required />
            </Field>
            <Field label="End Time" htmlFor="onbEnd" hint="Optional">
              <Input id="onbEnd" type="time" value={onbEnd} onChange={(e) => setOnbEnd(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="onbNotes" hint="Optional">
              <Textarea id="onbNotes" rows={3} value={onbNotes} onChange={(e) => setOnbNotes(e.target.value)} placeholder="Location, who to meet, documents to bring…" />
            </Field>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={closeOnboardingPrompt} disabled={savingOnboarding}>
                Skip for now
              </Button>
              <Button type="submit" className="gap-2" disabled={savingOnboarding || !onbStart || !onbTitle.trim()}>
                {savingOnboarding && <Loader2 className="h-4 w-4 animate-spin" />}
                Save schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Info: FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div>
    <p className="text-muted-foreground">{label}</p>
    <p className="font-medium">{value}</p>
  </div>
);

const FilterSelect: FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: string[];
}> = ({ label, value, onChange, allLabel, options }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
    >
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  </div>
);

export default JobDetailPage;