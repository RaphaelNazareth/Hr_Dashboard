import {
  type FC,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Users,
  Calendar,
  ClipboardList,
  Plus,
  Trash2,
  Check,
  X,
  GripVertical,
  LayoutGrid,
  List as ListIcon,
  Mail,
  Phone,
  MapPin,
  CalendarPlus,
  Send,
  Search,
  Loader2,
  ArrowLeftRight,
  CalendarClock,
  SlidersHorizontal,
} from "lucide-react";
import {
  DEFAULT_STAGE_NAMES,
  isInterviewStage,
  fetchCandidates,
  createCandidate,
  updateCandidateStatus,
  logTrackingEvent,
  createInterviewSchedule,
  matchesCandidateSearch,
  moveCandidates,
} from "@/lib/candidateBoard";
import type { CandidateRecord, NewCandidateInput } from "@/lib/candidateBoard";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const UNASSIGNED_ID = "__unassigned__";

interface Stage {
  id: string;
  name: string;
  order: number;
}

function buildDefaultStages(): Stage[] {
  return DEFAULT_STAGE_NAMES.map((name, i) => ({
    id: `local-${i}`,
    name,
    order: i,
  }));
}

type ViewMode = "card" | "list";

// Fields collected in the "New Candidate" form. These map 1:1 to the
// public.candidates columns (minus the ones we derive automatically:
// id / applied_at / created_at / updated_at / candidate_code).
interface CandidateFormState {
  first_name: string;
  last_name: string;
  age: string;
  email: string;
  phone_number: string;
  city: string;
  applied_position: string;
  experience: string;
  education: string;
  school: string;
  skills: string;
  notice_period: string;
  status: string;
  resume_path: string;
  is_18_plus: boolean;
  legal_right_to_work: boolean;
  former_current_mattel_employee: boolean;
}

function buildEmptyCandidateForm(defaultStatus: string): CandidateFormState {
  return {
    first_name: "",
    last_name: "",
    age: "",
    email: "",
    phone_number: "",
    city: "",
    applied_position: "",
    experience: "",
    education: "",
    school: "",
    skills: "",
    notice_period: "",
    status: defaultStatus,
    resume_path: "",
    is_18_plus: false,
    legal_right_to_work: false,
    former_current_mattel_employee: false,
  };
}

// A pending drag-into-an-interview-stage move, waiting on the user to give
// (or skip) a scheduled time before we write the candidate_tracking /
// interview_schedule rows.
interface InterviewPrompt {
  candidate: CandidateRecord;
  stageName: string;
}

function formatGCalDate(dateTimeLocal: string) {
  // "2026-08-05T10:00" -> "20260805T100000"
  return `${dateTimeLocal.replace(/[-:]/g, "")}00`;
}

function buildGoogleCalendarUrl(
  candidate: CandidateRecord,
  stageName: string,
  startDateTime: string,
  endTime: string,
  notes: string
) {
  const title = encodeURIComponent(
    `${stageName} - ${candidate.first_name} ${candidate.last_name}`
  );

  const startLabel = new Date(startDateTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const details = encodeURIComponent(
    notes || `Please attend the interview at ${startLabel}`
  );

  const datePart = startDateTime.split("T")[0];
  const start = formatGCalDate(startDateTime);
  const end = endTime
    ? formatGCalDate(`${datePart}T${endTime}`)
    : formatGCalDate(
        new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000)
          .toISOString()
          .slice(0, 16)
      );

  return (
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${title}` +
    `&dates=${start}/${end}` +
    `&details=${details}`
  );
}

// Builds an ISO end timestamp from the same calendar date as the start,
// combined with a plain HH:mm time input. Falls back to start + 1h.
function buildEndIso(startDateTimeLocal: string, endTimeOnly: string) {
  if (!endTimeOnly) {
    return new Date(
      new Date(startDateTimeLocal).getTime() + 60 * 60 * 1000
    ).toISOString();
  }
  const datePart = startDateTimeLocal.split("T")[0];
  return new Date(`${datePart}T${endTimeOnly}`).toISOString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RecruitmentBoard: FC = () => {
  const navigate = useNavigate();

  const [stages, setStages] = useState<Stage[]>([]);
  const [columns, setColumns] = useState<Record<string, CandidateRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  const DEFAULT_VISIBLE_COUNT = 10;
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  // Per-column search queries, keyed by stage id (UNASSIGNED_ID included).
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});

  // Global filters — apply across every column at once, on top of the
  // per-column search above.
  const [showFilters, setShowFilters] = useState(false);
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [educationFilter, setEducationFilter] = useState<string>("all");
  const [noticePeriodFilter, setNoticePeriodFilter] = useState<string>("all");
  const [mattelFilter, setMattelFilter] = useState<"all" | "yes" | "no">("all");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");

  // "New Candidate" dialog state.
  const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false);
  const [candidateForm, setCandidateForm] = useState<CandidateFormState>(
    buildEmptyCandidateForm(DEFAULT_STAGE_NAMES[0])
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // "Schedule interview" dialog state — shown after dropping a candidate
  // into any stage whose name contains "interview".
  const [interviewPrompt, setInterviewPrompt] = useState<InterviewPrompt | null>(null);
  const [interviewDateTime, setInterviewDateTime] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [schedulingInterview, setSchedulingInterview] = useState(false);

  // Horizontal-scroll slider for the pipeline.
  const pipelineScrollRef = useRef<HTMLDivElement>(null);
  const [scrollMax, setScrollMax] = useState(0);
  const [scrollValue, setScrollValue] = useState(0);
  const [interviewEndTime, setInterviewEndTime] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Bulk selection state — shared across every stage.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStageTarget, setBulkStageTarget] = useState<string>(DEFAULT_STAGE_NAMES[0]);
  const [bulkMoving, setBulkMoving] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectManyInColumn(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function getVisibleCount(stageId: string) {
    return visibleCounts[stageId] ?? DEFAULT_VISIBLE_COUNT;
  }

  function showMore(stageId: string) {
    setVisibleCounts((prev) => ({
      ...prev,
      [stageId]: (prev[stageId] ?? DEFAULT_VISIBLE_COUNT) + DEFAULT_VISIBLE_COUNT,
    }));
  }

  function showLess(stageId: string) {
    setVisibleCounts((prev) => ({ ...prev, [stageId]: DEFAULT_VISIBLE_COUNT }));
  }

  function getSearch(stageId: string) {
    return columnSearch[stageId] ?? "";
  }

  function setSearch(stageId: string, value: string) {
    setColumnSearch((prev) => ({ ...prev, [stageId]: value }));
  }

  function openCandidateProfile(candidate: CandidateRecord) {
    navigate(`/profiles?candidateId=${candidate.id}`);
  }

  // -- Load data -------------------------------------------------------

  useEffect(() => {
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBoard() {
    setLoading(true);
    setError(null);
    try {
      const candidateRecords = await fetchCandidates();

      const localStages = buildDefaultStages();

      const grouped: Record<string, CandidateRecord[]> = {};
      localStages.forEach((s) => (grouped[s.id] = []));
      grouped[UNASSIGNED_ID] = [];

      for (const candidate of candidateRecords) {
        const match = localStages.find((s) => s.name === candidate.status);
        if (match) {
          grouped[match.id].push(candidate);
        } else {
          grouped[UNASSIGNED_ID].push(candidate);
        }
      }

      setStages(localStages);
      setColumns(grouped);
    } catch (err) {
      console.error(err);
      setError("Couldn't load the recruitment board. Check your Supabase connection.");
    } finally {
      setLoading(false);
    }
  }

  // -- Derived -----------------------------------------------------------

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
  );

  // Flatten every column into one list so we can derive dropdown options
  // from the real data, same idea as `records` in Candidates.tsx.
  const allCandidates = useMemo(() => Object.values(columns).flat(), [columns]);

  const positionOptions = useMemo(
    () => Array.from(new Set(allCandidates.map((c) => c.applied_position).filter(Boolean))).sort() as string[],
    [allCandidates]
  );
  const cityOptions = useMemo(
    () => Array.from(new Set(allCandidates.map((c) => c.city).filter(Boolean))).sort() as string[],
    [allCandidates]
  );
  const educationOptions = useMemo(
    () => Array.from(new Set(allCandidates.map((c) => c.education).filter(Boolean))).sort() as string[],
    [allCandidates]
  );
  const noticePeriodOptions = useMemo(
    () => Array.from(new Set(allCandidates.map((c) => c.notice_period).filter(Boolean))).sort() as string[],
    [allCandidates]
  );

  // Bundled once so every StageColumn gets the same object reference unless
  // a filter actually changes (avoids needless re-renders).
  const columnFilters = useMemo(
    () => ({
      position: positionFilter,
      city: cityFilter,
      education: educationFilter,
      noticePeriod: noticePeriodFilter,
      mattel: mattelFilter,
      ageMin,
      ageMax,
    }),
    [positionFilter, cityFilter, educationFilter, noticePeriodFilter, mattelFilter, ageMin, ageMax]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (positionFilter !== "all") count++;
    if (cityFilter !== "all") count++;
    if (educationFilter !== "all") count++;
    if (noticePeriodFilter !== "all") count++;
    if (mattelFilter !== "all") count++;
    if (ageMin || ageMax) count++;
    return count;
  }, [positionFilter, cityFilter, educationFilter, noticePeriodFilter, mattelFilter, ageMin, ageMax]);

  function clearAllFilters() {
    setPositionFilter("all");
    setCityFilter("all");
    setEducationFilter("all");
    setNoticePeriodFilter("all");
    setMattelFilter("all");
    setAgeMin("");
    setAgeMax("");
  }

  // Names from the fixed list that aren't already a column.
  const availableStageNames = useMemo(
    () => DEFAULT_STAGE_NAMES.filter((name) => !stages.some((s) => s.name === name)),
    [stages]
  );

  const hasUnassigned = (columns[UNASSIGNED_ID]?.length ?? 0) > 0;

  const totalCandidates = useMemo(
    () => Object.values(columns).reduce((sum, list) => sum + list.length, 0),
    [columns]
  );

  const hiredCount = useMemo(() => {
    const hiredStage = orderedStages.find(
      (s) => s.name.trim().toLowerCase() === "hired"
    );
    return hiredStage ? columns[hiredStage.id]?.length ?? 0 : 0;
  }, [orderedStages, columns]);

  const interviewCount = useMemo(() => {
    return orderedStages
      .filter((s) => s.name.toLowerCase().includes("interview"))
      .reduce((sum, s) => sum + (columns[s.id]?.length ?? 0), 0);
  }, [orderedStages, columns]);

  const openPositions = useMemo(() => {
    const positions = new Set<string>();
    Object.values(columns)
      .flat()
      .forEach((c) => c.applied_position && positions.add(c.applied_position));
    return positions.size;
  }, [columns]);

  // -- Drag and drop -------------------------------------------------------

  function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceId = source.droppableId;
    const destId = destination.droppableId;

    // Grab the candidate + destination stage before mutating state, so we
    // know what (and whether) to log once the move lands.
    const sourceList = columns[sourceId] ?? [];
    const movingCandidate = sourceList.find((c) => c.id === draggableId);
    const destStage = orderedStages.find((s) => s.id === destId);

    setColumns((prev) => {
      const sourceItems = Array.from(prev[sourceId] ?? []);

      // Find the real index by ID (not by the filtered visual index)
      const realSourceIndex = sourceItems.findIndex((c) => c.id === draggableId);
      if (realSourceIndex === -1) return prev;

      const [moved] = sourceItems.splice(realSourceIndex, 1);

      const destItems =
        sourceId === destId ? sourceItems : Array.from(prev[destId] ?? []);

      // Still using destination.index for now (visual drop position)
      destItems.splice(destination.index, 0, moved);

      return {
        ...prev,
        [sourceId]: sourceItems,
        [destId]: destItems,
      };
    });

    if (sourceId !== destId && destId !== UNASSIGNED_ID && destStage && movingCandidate) {
      updateCandidateStatus(draggableId, destStage.name).catch((err) => {
        console.error("Failed to update candidate status", err);
        setError("Couldn't save that move — please refresh and try again.");
      });

      if (isInterviewStage(destStage.name)) {
        // Hold off on the tracking / interview_schedule entries until we
        // know when the interview is scheduled for.
        setInterviewDateTime("");
        setInterviewEndTime("");
        setInterviewNotes("");
        setInterviewPrompt({ candidate: movingCandidate, stageName: destStage.name });
      } else {
        logTrackingEvent({
          candidateId: movingCandidate.id,
          stage: destStage.name,
          date: new Date().toISOString(),
        }).catch((err) => {
          console.error("Failed to log tracking event", err);
          setError("Couldn't record that stage change in the candidate's history.");
        });
      }
    }
  }

  // -- Bulk move -----------------------------------------------------------

  async function handleBulkMove() {
    if (selectedIds.size === 0) return;

    setBulkMoving(true);
    setError(null);

    try {
      const toMove = allCandidates.filter((c) => selectedIds.has(c.id));
      const { succeeded, failed } = await moveCandidates(toMove, bulkStageTarget);

      if (succeeded.length) {
        const succeededById = new Map(succeeded.map((r) => [r.id, r]));
        const destStage = orderedStages.find((s) => s.name === bulkStageTarget);
        const destId = destStage ? destStage.id : UNASSIGNED_ID;

        setColumns((prev) => {
          const next: Record<string, CandidateRecord[]> = {};
          for (const [stageId, list] of Object.entries(prev)) {
            next[stageId] = list.filter((c) => !succeededById.has(c.id));
          }
          next[destId] = [...succeeded, ...(next[destId] ?? [])];
          return next;
        });
      }

      if (failed.length) {
        setError(`Couldn't move ${failed.length} candidate(s). Please try again.`);
      }
    } finally {
      setSelectedIds(new Set());
      setBulkMoving(false);
    }
  }

  // -- Interview scheduling prompt -----------------------------------------
  function buildInterviewNotes(baseNotes: string) {
    if (!interviewDateTime) return baseNotes;
    const startLabel = new Date(interviewDateTime).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const timeRange = interviewEndTime ? `${startLabel}–${interviewEndTime}` : startLabel;
    const rangeLine = `Time: ${timeRange}`;
    return baseNotes ? `${rangeLine}\n${baseNotes}` : rangeLine;
  }

  // Writes the candidate_tracking history row and, when a start time was
  // given, the matching interview_schedule row (linked via tracking_id).
  async function persistInterview() {
    if (!interviewPrompt) return;
    const { candidate, stageName } = interviewPrompt;
    const notes = buildInterviewNotes(interviewNotes.trim());
    const movedAt = interviewDateTime
      ? new Date(interviewDateTime).toISOString()
      : new Date().toISOString();

    const tracking = await logTrackingEvent({
      candidateId: candidate.id,
      stage: stageName,
      date: movedAt,
      notes,
    });

    if (interviewDateTime) {
      try {
        await createInterviewSchedule({
          candidateId: candidate.id,
          trackingId: tracking.id,
          stage: stageName,
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

  async function handleConfirmInterview(e: FormEvent) {
    e.preventDefault();
    if (!interviewPrompt) return;

    setSchedulingInterview(true);
    try {
      await persistInterview();
      setInterviewPrompt(null);
    } catch (err) {
      console.error("Failed to schedule interview", err);
      setError("Couldn't save the interview time — please try again from the profile.");
    } finally {
      setSchedulingInterview(false);
    }
  }

  function handleSkipInterviewTime() {
    if (!interviewPrompt) return;
    persistInterview().catch((err) => {
      console.error("Failed to log tracking event", err);
      setError("Couldn't record that stage change in the candidate's history.");
    });
    setInterviewPrompt(null);
  }

  function handleAddToGoogleCalendar() {
    if (!interviewPrompt || !interviewDateTime) return;
    const { candidate, stageName } = interviewPrompt;

    const url = buildGoogleCalendarUrl(
      candidate,
      stageName,
      interviewDateTime,
      interviewEndTime,
      interviewNotes.trim()
    );

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleSendInterviewEmail() {
    if (!interviewPrompt) return;
    const { candidate, stageName } = interviewPrompt;

    if (!candidate.email) {
      setError("Kandidat ini belum ada email-nya di database.");
      return;
    }

    setSendingEmail(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/send-interview-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: candidate.email,
          candidateName: `${candidate.first_name} ${candidate.last_name}`,
          stageName,
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
      setSendingEmail(false);
    }
  }

  // -- Column management -------------------------------------------------

  function openAddColumn() {
    setNewColumnName(availableStageNames[0] ?? "");
    setAddingColumn(true);
  }

  function handleAddColumn() {
    if (!newColumnName) return;
    // Order is always derived from the fixed stage list, so columns stay in
    // canonical pipeline order (Applied -> ... -> Rejected) no matter what
    // sequence they're added in.
    const order = DEFAULT_STAGE_NAMES.indexOf(newColumnName as (typeof DEFAULT_STAGE_NAMES)[number]);
    const localId = `local-${Date.now()}`;

    setStages((prev) => [...prev, { id: localId, name: newColumnName, order }]);
    setColumns((prev) => ({ ...prev, [localId]: [] }));

    setNewColumnName("");
    setAddingColumn(false);
  }

  function handleDeleteColumn(stage: Stage) {
    if ((columns[stage.id]?.length ?? 0) > 0) {
      window.alert("Move or reassign every candidate out of this column before deleting it.");
      return;
    }
    if (!window.confirm(`Delete the "${stage.name}" column?`)) return;

    setStages((prev) => prev.filter((s) => s.id !== stage.id));
    setColumns((prev) => {
      const next = { ...prev };
      delete next[stage.id];
      return next;
    });
  }

  // -- New candidate form --------------------------------------------------

  function openAddCandidate() {
    const defaultStatus = orderedStages[0]?.name ?? DEFAULT_STAGE_NAMES[0];
    setCandidateForm(buildEmptyCandidateForm(defaultStatus));
    setFormError(null);
    setIsAddCandidateOpen(true);
  }

  function updateCandidateField<K extends keyof CandidateFormState>(
    field: K,
    value: CandidateFormState[K]
  ) {
    setCandidateForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreateCandidate(e: FormEvent) {
    e.preventDefault();

    if (!candidateForm.first_name.trim() || !candidateForm.last_name.trim()) {
      setFormError("First name and last name are required.");
      return;
    }
    if (!candidateForm.email.trim()) {
      setFormError("Email is required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload: NewCandidateInput = {
      candidate_code: `CAND-${Date.now()}`,
      first_name: candidateForm.first_name.trim(),
      last_name: candidateForm.last_name.trim(),
      age: candidateForm.age ? Number(candidateForm.age) : null,
      gender: null,
      place_of_birth: null,
      date_of_birth: null,
      email: candidateForm.email.trim(),
      phone_number: candidateForm.phone_number.trim() || null,
      mobile_phone_wa: null,
      identity_card_number: null,
      family_card_number: null,
      religion: null,
      marital_status: null,
      city: candidateForm.city.trim() || null,
      applied_position: candidateForm.applied_position.trim() || null,
      job_id: null,
      experience: candidateForm.experience.trim() || null,
      education: candidateForm.education.trim() || null,
      school: candidateForm.school.trim() || null,
      skills: candidateForm.skills.trim() || null,
      certificates: null,
      languages: null,
      notice_period: candidateForm.notice_period.trim() || null,
      status: candidateForm.status as NewCandidateInput["status"],
      resume_path: candidateForm.resume_path.trim() || null,
      ktp_path: null,
      is_18_plus: candidateForm.is_18_plus,
      legal_right_to_work: candidateForm.legal_right_to_work,
      former_current_mattel_employee: candidateForm.former_current_mattel_employee,
      // This quick-add form doesn't collect consent — it's for recruiters
      // manually adding a candidate, not the public application flow, which
      // is where these actually get captured (ApplyPage).
      consent_data_collection: true,
      consent_data_usage: true,
      consent_data_retention: true,
    };

    try {
      const created = await createCandidate(payload);

      const targetStage = orderedStages.find((s) => s.name === created.status);
      const bucketId = targetStage ? targetStage.id : UNASSIGNED_ID;

      setColumns((prev) => ({
        ...prev,
        [bucketId]: [created, ...(prev[bucketId] ?? [])],
      }));

      // Seed the candidate's history with their starting stage.
      logTrackingEvent({
        candidateId: created.id,
        stage: created.status,
        date: created.applied_at,
        notes: "Candidate added to the pipeline.",
      }).catch((err) => {
        console.error("Failed to log initial tracking event", err);
      });

      setIsAddCandidateOpen(false);
    } catch (err) {
      console.error(err);
      setFormError("Couldn't save this candidate. Please check the fields and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // -- Pipeline scroll slider ----------------------------------------------

  useEffect(() => {
    const el = pipelineScrollRef.current;
    if (!el) return;

    const updateMax = () => {
      setScrollMax(Math.max(0, el.scrollWidth - el.clientWidth));
      setScrollValue(el.scrollLeft);
    };

    updateMax();

    const resizeObserver = new ResizeObserver(updateMax);
    resizeObserver.observe(el);
    window.addEventListener("resize", updateMax);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMax);
    };
  }, [orderedStages.length, hasUnassigned, viewMode, loading]);

  function handlePipelineScroll() {
    const el = pipelineScrollRef.current;
    if (!el) return;
    setScrollValue(el.scrollLeft);
  }

  function handleSliderChange(value: number) {
    const el = pipelineScrollRef.current;
    if (!el) return;
    el.scrollLeft = value;
    setScrollValue(value);
  }

  // -- Render --------------------------------------------------------------

  return (
    <>
      <Header />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Recruitment Pipeline</h1>
            <p className="text-muted-foreground mt-1">
              Manage every stage of your hiring process.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border p-1">
              <Button
                variant={viewMode === "card" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => setViewMode("card")}
              >
                <LayoutGrid className="h-4 w-4" />
                Card
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
                onClick={() => setViewMode("list")}
              >
                <ListIcon className="h-4 w-4" />
                List
              </Button>
            </div>

            <Button className="gap-2" onClick={openAddCandidate}>
              <Plus className="h-4 w-4" />
              New Candidate
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Users} label="Total Candidates" value={totalCandidates} sub="Across all stages" />
          <StatCard icon={Briefcase} label="Open Positions" value={openPositions} sub="Distinct roles applied for" />
          <StatCard icon={Calendar} label="Interviews" value={interviewCount} sub="In interview-stage columns" />
          <StatCard icon={ClipboardList} label="Hired" value={hiredCount} sub="Successfully onboarded" />
        </div>

        {/* Bulk selection toolbar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 mt-6 flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <select
              value={bulkStageTarget}
              onChange={(e) => setBulkStageTarget(e.target.value)}
              className="ml-auto rounded-md border bg-background px-2.5 py-1.5 text-sm"
            >
              {DEFAULT_STAGE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Button onClick={handleBulkMove} disabled={bulkMoving} size="sm">
              {bulkMoving ? "Moving…" : "Move"}
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear Selection
            </Button>
          </div>
        )}

        {/* Pipeline */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Hiring Pipeline</CardTitle>

            {!loading && scrollMax > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  type="range"
                  min={0}
                  max={scrollMax}
                  step={1}
                  value={scrollValue}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  aria-label="Scroll pipeline horizontally"
                />
              </div>
            )}
          </CardHeader>

          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowFilters((s) => !s)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                  showFilters
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "bg-card hover:bg-muted/40"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {showFilters && (
              <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Applied Position
                  </label>
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="all">All positions</option>
                    {positionOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
                  <select
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="all">All cities</option>
                    {cityOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Education
                  </label>
                  <select
                    value={educationFilter}
                    onChange={(e) => setEducationFilter(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="all">All education levels</option>
                    {educationOptions.map((ed) => (
                      <option key={ed} value={ed}>
                        {ed}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Notice Period
                  </label>
                  <select
                    value={noticePeriodFilter}
                    onChange={(e) => setNoticePeriodFilter(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="all">All notice periods</option>
                    {noticePeriodOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Age range
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={ageMin}
                      onChange={(e) => setAgeMin(e.target.value)}
                      placeholder="Min"
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="number"
                      min={0}
                      value={ageMax}
                      onChange={(e) => setAgeMax(e.target.value)}
                      placeholder="Max"
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Mattel Employee
                  </label>
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
              </div>
            )}

            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Loading pipeline…
              </div>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <div
                  ref={pipelineScrollRef}
                  onScroll={handlePipelineScroll}
                  className="no-scrollbar flex gap-4 overflow-x-auto pb-2"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {hasUnassigned && (
                    <StageColumn
                      stage={{ id: UNASSIGNED_ID, name: "Unassigned", order: -1 }}
                      candidates={columns[UNASSIGNED_ID] ?? []}
                      viewMode={viewMode}
                      isSystem
                      visibleCount={getVisibleCount(UNASSIGNED_ID)}
                      onShowMore={() => showMore(UNASSIGNED_ID)}
                      onShowLess={() => showLess(UNASSIGNED_ID)}
                      searchValue={getSearch(UNASSIGNED_ID)}
                      onSearchChange={(v) => setSearch(UNASSIGNED_ID, v)}
                      onOpenCandidate={openCandidateProfile}
                      filters={columnFilters}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelected}
                      onSelectAll={selectManyInColumn}
                    />
                  )}

                  {orderedStages.map((stage) => (
                    <StageColumn
                      key={stage.id}
                      stage={stage}
                      candidates={columns[stage.id] ?? []}
                      viewMode={viewMode}
                      onDelete={() => handleDeleteColumn(stage)}
                      visibleCount={getVisibleCount(stage.id)}
                      onShowMore={() => showMore(stage.id)}
                      onShowLess={() => showLess(stage.id)}
                      searchValue={getSearch(stage.id)}
                      onSearchChange={(v) => setSearch(stage.id, v)}
                      onOpenCandidate={openCandidateProfile}
                      filters={columnFilters}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelected}
                      onSelectAll={selectManyInColumn}
                    />
                  ))}

                  {/* Add column */}
                  <div className="w-72 shrink-0">
                    {addingColumn ? (
                      <div className="rounded-xl border bg-muted/30 p-3">
                        {availableStageNames.length > 0 ? (
                          <select
                            autoFocus
                            value={newColumnName}
                            onChange={(e) => setNewColumnName(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            {availableStageNames.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            All stages are already on the board.
                          </p>
                        )}
                        <div className="mt-2 flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setAddingColumn(false)}>
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleAddColumn}
                            disabled={availableStageNames.length === 0}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={openAddColumn}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-muted/40"
                      >
                        <Plus className="h-4 w-4" />
                        Add column
                      </button>
                    )}
                  </div>
                </div>
              </DragDropContext>
            )}
          </CardContent>
        </Card>
      </main>

      {/* New Candidate dialog */}
      <Dialog open={isAddCandidateOpen} onOpenChange={setIsAddCandidateOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Candidate</DialogTitle>
            <DialogDescription>
              Fields map directly to the public.candidates columns.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCandidate} className="space-y-5">
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="first_name" required>
                <Input
                  id="first_name"
                  value={candidateForm.first_name}
                  onChange={(e) => updateCandidateField("first_name", e.target.value)}
                  required
                />
              </Field>
              <Field label="Last name" htmlFor="last_name" required>
                <Input
                  id="last_name"
                  value={candidateForm.last_name}
                  onChange={(e) => updateCandidateField("last_name", e.target.value)}
                  required
                />
              </Field>

              <Field label="Age" htmlFor="age">
                <Input
                  id="age"
                  type="number"
                  min={0}
                  value={candidateForm.age}
                  onChange={(e) => updateCandidateField("age", e.target.value)}
                />
              </Field>
              <Field label="Email" htmlFor="email" required>
                <Input
                  id="email"
                  type="email"
                  value={candidateForm.email}
                  onChange={(e) => updateCandidateField("email", e.target.value)}
                  required
                />
              </Field>

              <Field label="Phone number" htmlFor="phone_number">
                <Input
                  id="phone_number"
                  value={candidateForm.phone_number}
                  onChange={(e) => updateCandidateField("phone_number", e.target.value)}
                />
              </Field>
              <Field label="City" htmlFor="city">
                <Input
                  id="city"
                  value={candidateForm.city}
                  onChange={(e) => updateCandidateField("city", e.target.value)}
                />
              </Field>

              <Field label="Applied position" htmlFor="applied_position">
                <Input
                  id="applied_position"
                  value={candidateForm.applied_position}
                  onChange={(e) => updateCandidateField("applied_position", e.target.value)}
                />
              </Field>
              <Field label="Notice period" htmlFor="notice_period">
                <Input
                  id="notice_period"
                  value={candidateForm.notice_period}
                  onChange={(e) => updateCandidateField("notice_period", e.target.value)}
                />
              </Field>

              <Field label="Experience" htmlFor="experience">
                <Input
                  id="experience"
                  value={candidateForm.experience}
                  onChange={(e) => updateCandidateField("experience", e.target.value)}
                />
              </Field>
              <Field label="Education" htmlFor="education">
                <Input
                  id="education"
                  value={candidateForm.education}
                  onChange={(e) => updateCandidateField("education", e.target.value)}
                />
              </Field>

              <Field label="School" htmlFor="school">
                <Input
                  id="school"
                  value={candidateForm.school}
                  onChange={(e) => updateCandidateField("school", e.target.value)}
                />
              </Field>
              <Field label="Starting stage" htmlFor="status">
                <select
                  id="status"
                  value={candidateForm.status}
                  onChange={(e) => updateCandidateField("status", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {orderedStages.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Skills" htmlFor="skills" hint="Comma-separated">
              <Input
                id="skills"
                value={candidateForm.skills}
                onChange={(e) => updateCandidateField("skills", e.target.value)}
                placeholder="React, Figma, SQL"
              />
            </Field>

            <Field label="Resume link" htmlFor="resume_path" hint="URL or storage path">
              <Input
                id="resume_path"
                value={candidateForm.resume_path}
                onChange={(e) => updateCandidateField("resume_path", e.target.value)}
                placeholder="https://…/resume.pdf"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <CheckboxField
                id="is_18_plus"
                label="18 or older"
                checked={candidateForm.is_18_plus}
                onChange={(v) => updateCandidateField("is_18_plus", v)}
              />
              <CheckboxField
                id="legal_right_to_work"
                label="Legal right to work"
                checked={candidateForm.legal_right_to_work}
                onChange={(v) => updateCandidateField("legal_right_to_work", v)}
              />
              <CheckboxField
                id="former_current_mattel_employee"
                label="Former/current employee"
                checked={candidateForm.former_current_mattel_employee}
                onChange={(v) => updateCandidateField("former_current_mattel_employee", v)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAddCandidateOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" className="gap-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Add candidate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule interview dialog — shown when a candidate is dropped into
          any stage whose name contains "interview". Confirming writes both
          a candidate_tracking row and an interview_schedule row. */}
      <Dialog
        open={!!interviewPrompt}
        onOpenChange={(open) => {
          if (!open) handleSkipInterviewTime();
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
                  {interviewPrompt.candidate.first_name} {interviewPrompt.candidate.last_name} was
                  moved to <span className="font-medium">{interviewPrompt.stageName}</span>. When is
                  it scheduled for?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmInterview} className="space-y-4">
            <Field label="Start" htmlFor="interviewDateTime">
              <Input
                id="interviewDateTime"
                type="datetime-local"
                value={interviewDateTime}
                onChange={(e) => setInterviewDateTime(e.target.value)}
              />
            </Field>
            <Field label="End time" htmlFor="interviewEndTime" hint="optional">
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
                disabled={sendingEmail || !interviewPrompt?.candidate.email}
              >
                {sendingEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Email candidate
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={handleSkipInterviewTime}
                disabled={schedulingInterview}
              >
                Skip for now
              </Button>
              <Button type="submit" className="gap-2" disabled={schedulingInterview}>
                {schedulingInterview && <Loader2 className="h-4 w-4 animate-spin" />}
                Save time
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </>
  );
};

export default RecruitmentBoard;

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const StatCard: FC<{
  icon: FC<{ className?: string }>;
  label: string;
  value: number;
  sub: string;
}> = ({ icon: Icon, label, value, sub }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium">{label}</CardTitle>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold">{value}</div>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </CardContent>
  </Card>
);

const Field: FC<{
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, required, hint, children }) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor} className="text-xs font-medium">
      {label}
      {required && <span className="text-destructive"> *</span>}
      {hint && <span className="ml-1 font-normal text-muted-foreground">({hint})</span>}
    </Label>
    {children}
  </div>
);

const CheckboxField: FC<{
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ id, label, checked, onChange }) => (
  <label
    htmlFor={id}
    className="flex cursor-pointer items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
  >
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-input accent-primary"
    />
    {label}
  </label>
);

interface StageColumnProps {
  stage: Stage;
  candidates: CandidateRecord[];
  viewMode: ViewMode;
  isSystem?: boolean;
  onDelete?: () => void;

  visibleCount: number;
  onShowMore: () => void;
  onShowLess: () => void;

  searchValue: string;
  onSearchChange: (value: string) => void;

  onOpenCandidate: (candidate: CandidateRecord) => void;

  filters: {
    position: string;
    city: string;
    education: string;
    noticePeriod: string;
    mattel: "all" | "yes" | "no";
    ageMin: string;
    ageMax: string;
  };

  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
}

const StageColumn: FC<StageColumnProps> = ({
  stage,
  candidates,
  viewMode,
  isSystem,
  onDelete,
  visibleCount,
  onShowMore,
  onShowLess,
  searchValue,
  onSearchChange,
  onOpenCandidate,
  filters,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}) => {
  const filteredCandidates = useMemo(() => {
    const minAge = filters.ageMin.trim() ? Number(filters.ageMin) : null;
    const maxAge = filters.ageMax.trim() ? Number(filters.ageMax) : null;

    return candidates.filter((c) => {
      const matchesSearch = matchesCandidateSearch(c, searchValue);

      const matchesPosition = filters.position === "all" || c.applied_position === filters.position;
      const matchesCity = filters.city === "all" || c.city === filters.city;
      const matchesEducation = filters.education === "all" || c.education === filters.education;
      const matchesNotice =
        filters.noticePeriod === "all" || c.notice_period === filters.noticePeriod;
      const matchesMattel =
        filters.mattel === "all" ||
        (filters.mattel === "yes"
          ? !!c.former_current_mattel_employee
          : !c.former_current_mattel_employee);

      const age = c.age ?? null;
      const matchesAgeMin = minAge === null || (age !== null && age >= minAge);
      const matchesAgeMax = maxAge === null || (age !== null && age <= maxAge);

      return (
        matchesSearch &&
        matchesPosition &&
        matchesCity &&
        matchesEducation &&
        matchesNotice &&
        matchesMattel &&
        matchesAgeMin &&
        matchesAgeMax
      );
    });
  }, [candidates, searchValue, filters]);

  const visibleCandidates = filteredCandidates.slice(0, visibleCount);
  const remaining = filteredCandidates.length - visibleCandidates.length;
  const isExpanded = visibleCount > 10;
  const isFiltering = searchValue.trim().length > 0;

  return (
    <div className="w-72 shrink-0 rounded-xl border bg-muted/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="truncate font-semibold">{stage.name}</h3>
          <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs">
            {isFiltering ? `${filteredCandidates.length}/${candidates.length}` : candidates.length}
          </span>
        </div>
        {!isSystem && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search candidates…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {filteredCandidates.length > 0 && (
          <button
            onClick={() => onSelectAll(filteredCandidates.map((c) => c.id))}
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Select all
          </button>
        )}
      </div>

      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex min-h-[420px] flex-col gap-2 rounded-lg p-1 transition-colors",
              snapshot.isDraggingOver && "bg-primary/5"
            )}
          >
            {visibleCandidates.length === 0 && (
              <div className="flex h-full min-h-[100px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                {isFiltering ? "No matches" : "No candidates"}
              </div>
            )}

            {visibleCandidates.map((candidate, index) => (
              <Draggable key={candidate.id} draggableId={candidate.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={cn(dragSnapshot.isDragging && "opacity-90")}
                  >
                    {viewMode === "card" ? (
                      <CandidateCard
                        candidate={candidate}
                        onOpen={() => onOpenCandidate(candidate)}
                        dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                        selected={selectedIds.has(candidate.id)}
                        onToggleSelect={() => onToggleSelect(candidate.id)}
                      />
                    ) : (
                      <CandidateListItem
                        candidate={candidate}
                        onOpen={() => onOpenCandidate(candidate)}
                        dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                        selected={selectedIds.has(candidate.id)}
                        onToggleSelect={() => onToggleSelect(candidate.id)}
                      />
                    )}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {remaining > 0 && (
        <button
          onClick={onShowMore}
          className="mt-2 w-full rounded-lg border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
        >
          Show 10 more ({remaining} left)
        </button>
      )}
      {isExpanded && remaining === 0 && filteredCandidates.length > 10 && (
        <button
          onClick={onShowLess}
          className="mt-2 w-full rounded-lg border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
        >
          Show less
        </button>
      )}
    </div>
  );
};

const CandidateCard: FC<{
  candidate: CandidateRecord;
  onOpen: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  selected: boolean;
  onToggleSelect: () => void;
}> = ({ candidate, onOpen, dragHandleProps, selected, onToggleSelect }) => {
  const skills = candidate.skills
    ? candidate.skills.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "rounded-lg border bg-background p-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40",
        selected && "border-primary/50 bg-primary/5"
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 shrink-0 rounded border-input accent-primary"
          />
          <p className="truncate font-medium leading-tight">
            {candidate.first_name} {candidate.last_name}
          </p>
        </div>
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{candidate.applied_position}</p>

      <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        {candidate.city && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {candidate.city}
          </span>
        )}
        {candidate.email && (
          <span className="flex items-center gap-1 truncate">
            <Mail className="h-3 w-3" /> {candidate.email}
          </span>
        )}
        {candidate.phone_number && (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" /> {candidate.phone_number}
          </span>
        )}
      </div>

      {skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {skills.slice(0, 3).map((skill) => (
            <Badge key={skill} variant="secondary" className="text-[10px] font-normal">
              {skill}
            </Badge>
          ))}
          {skills.length > 3 && (
            <Badge variant="outline" className="text-[10px] font-normal">
              +{skills.length - 3}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};

const CandidateListItem: FC<{
  candidate: CandidateRecord;
  onOpen: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  selected: boolean;
  onToggleSelect: () => void;
}> = ({ candidate, onOpen, dragHandleProps, selected, onToggleSelect }) => (
  <div
    onClick={onOpen}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "Enter") onOpen();
    }}
    className={cn(
      "flex items-center gap-3 rounded-lg border bg-background px-3 py-2 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40",
      selected && "border-primary/50 bg-primary/5"
    )}
  >
    <input
      type="checkbox"
      checked={selected}
      onChange={onToggleSelect}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 shrink-0 rounded border-input accent-primary"
    />
    <div {...dragHandleProps} className="shrink-0 cursor-grab active:cursor-grabbing">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">
        {candidate.first_name} {candidate.last_name}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {candidate.applied_position} {candidate.city ? `· ${candidate.city}` : ""}
      </p>
    </div>
    {candidate.notice_period && (
      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
        {candidate.notice_period}
      </Badge>
    )}
  </div>
);