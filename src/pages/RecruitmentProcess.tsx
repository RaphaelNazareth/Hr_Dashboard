import {
  type FC,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import PocketBase from "pocketbase";
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
} from "lucide-react";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090"
);
pb.autoCancellation(false);

const OPERATOR_COLLECTION = "Operator_dataset";
const TRACKING_COLLECTION = "Candidate_Tracking";

const UNASSIGNED_ID = "__unassigned__";

interface OperatorRecord {
  id: string;
  created: string;
  updated: string;

  Candidate_ID: string;
  First_Name: string;
  Last_Name: string;
  Age: number;
  email: string;
  Phone_Number: string;
  City: string;
  Applied_Position: string;
  Experience: string;
  Education: string;
  School: string;
  Skills: string;
  Resume_Input: string;
  Notice_Period: string;
  Status: string;
  Is_18_Plus: boolean;
  Legal_Right_To_Work: boolean;
  Former_Current_Mattel_Employee: boolean;
  date: string;
}

interface Stage {
  id: string;
  name: string;
  order: number;
}

// Stages are a fixed set — columns can only be created from this list.
const DEFAULT_STAGE_NAMES = [
  "Applied",
  "CV Screening",
  "Phone Screening",
  "Psychotest",
  "FGD",
  "Interview HR",
  "Interview User",
  "Interview Manager",
  "MCU",
  "Offering",
  "Hired",
  "Rejected",
];

function buildDefaultStages(): Stage[] {
  return DEFAULT_STAGE_NAMES.map((name, i) => ({
    id: `local-${i}`,
    name,
    order: i,
  }));
}

type ViewMode = "card" | "list";

// Fields collected in the "New Candidate" form. These map 1:1 to the
// Operator_dataset columns (minus the ones we derive automatically:
// id / created / updated / Candidate_ID / date).
interface CandidateFormState {
  First_Name: string;
  Last_Name: string;
  Age: string;
  email: string;
  Phone_Number: string;
  City: string;
  Applied_Position: string;
  Experience: string;
  Education: string;
  School: string;
  Skills: string;
  Resume_Input: string;
  Notice_Period: string;
  Status: string;
  Is_18_Plus: boolean;
  Legal_Right_To_Work: boolean;
  Former_Current_Mattel_Employee: boolean;
}

function buildEmptyCandidateForm(defaultStatus: string): CandidateFormState {
  return {
    First_Name: "",
    Last_Name: "",
    Age: "",
    email: "",
    Phone_Number: "",
    City: "",
    Applied_Position: "",
    Experience: "",
    Education: "",
    School: "",
    Skills: "",
    Resume_Input: "",
    Notice_Period: "",
    Status: defaultStatus,
    Is_18_Plus: false,
    Legal_Right_To_Work: false,
    Former_Current_Mattel_Employee: false,
  };
}

// A pending drag-into-an-interview-stage move, waiting on the user to give
// (or skip) a scheduled time before we write the Candidate_Tracking entry.
interface InterviewPrompt {
  candidate: OperatorRecord;
  stageName: string;
}

// Any stage whose name contains "interview" triggers the scheduling prompt.
function isInterviewStage(stageName: string) {
  return stageName.toLowerCase().includes("interview");
}

// Writes one row to Candidate_Tracking — this is what feeds the History and
// Interview tabs on the candidate's profile.
function formatGCalDate(dateTimeLocal: string) {
  // "2026-08-05T10:00" -> "20260805T100000"
  return `${dateTimeLocal.replace(/[-:]/g, "")}00`;
}

function buildGoogleCalendarUrl(
  candidate: OperatorRecord,
  stageName: string,
  startDateTime: string,
  endTime: string,
  notes: string
) {
  const title = encodeURIComponent(
    `${stageName} - ${candidate.First_Name} ${candidate.Last_Name}`
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

async function logTrackingEvent(params: {
  candidateId: string;
  position: string;
  stage: string;
  date: string; // ISO datetime
  notes?: string;
}) {
  await pb.collection(TRACKING_COLLECTION).create({
    candidate_id: params.candidateId,
    Applied_Position: params.position,
    Stage: params.stage,
    Date: params.date,
    Notes: params.notes ?? "",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RecruitmentBoard: FC = () => {
  const navigate = useNavigate();

  const [stages, setStages] = useState<Stage[]>([]);
  const [columns, setColumns] = useState<Record<string, OperatorRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  const DEFAULT_VISIBLE_COUNT = 10;
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  // Per-column search queries, keyed by stage id (UNASSIGNED_ID included).
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});

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

  function openCandidateProfile(candidate: OperatorRecord) {
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
      const candidateRecords = await pb
        .collection(OPERATOR_COLLECTION)
        .getFullList<OperatorRecord>({ sort: "-date" });

      const localStages = buildDefaultStages();

      const grouped: Record<string, OperatorRecord[]> = {};
      localStages.forEach((s) => (grouped[s.id] = []));
      grouped[UNASSIGNED_ID] = [];

      for (const candidate of candidateRecords) {
        const match = localStages.find((s) => s.name === candidate.Status);
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
      setError("Couldn't load the recruitment board. Check your PocketBase connection.");
    } finally {
      setLoading(false);
    }
  }

  // -- Derived -----------------------------------------------------------

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
  );

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
      .forEach((c) => c.Applied_Position && positions.add(c.Applied_Position));
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
    const movingCandidate = (columns[sourceId] ?? [])[source.index];
    const destStage = orderedStages.find((s) => s.id === destId);

    setColumns((prev) => {
      const sourceItems = Array.from(prev[sourceId] ?? []);
      const [moved] = sourceItems.splice(source.index, 1);
      if (!moved) return prev;

      const destItems =
        sourceId === destId ? sourceItems : Array.from(prev[destId] ?? []);
      destItems.splice(destination.index, 0, moved);

      return {
        ...prev,
        [sourceId]: sourceItems,
        [destId]: destItems,
      };
    });

    if (sourceId !== destId && destId !== UNASSIGNED_ID && destStage && movingCandidate) {
      pb.collection(OPERATOR_COLLECTION)
        .update(draggableId, { Status: destStage.name })
        .catch((err) => {
          console.error("Failed to update candidate status", err);
          setError("Couldn't save that move — please refresh and try again.");
        });

      if (isInterviewStage(destStage.name)) {
        // Hold off on the tracking entry until we know when the interview
        // is scheduled for.
        setInterviewDateTime("");
        setInterviewEndTime("");
        setInterviewNotes("");
        setInterviewPrompt({ candidate: movingCandidate, stageName: destStage.name });
        
      } else {
        logTrackingEvent({
          candidateId: movingCandidate.id,
          position: movingCandidate.Applied_Position,
          stage: destStage.name,
          date: new Date().toISOString(),
        }).catch((err) => {
          console.error("Failed to log tracking event", err);
          setError("Couldn't record that stage change in the candidate's history.");
        });
      }
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
  async function handleConfirmInterview(e: FormEvent) {
  e.preventDefault();
  if (!interviewPrompt) return;

  setSchedulingInterview(true);
  try {
    await logTrackingEvent({
      candidateId: interviewPrompt.candidate.id,
      position: interviewPrompt.candidate.Applied_Position,
      stage: interviewPrompt.stageName,
      date: interviewDateTime
        ? new Date(interviewDateTime).toISOString()
        : new Date().toISOString(),
      notes: buildInterviewNotes(interviewNotes.trim()),
    });
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
  logTrackingEvent({
    candidateId: interviewPrompt.candidate.id,
    position: interviewPrompt.candidate.Applied_Position,
    stage: interviewPrompt.stageName,
    date: interviewDateTime
      ? new Date(interviewDateTime).toISOString()
      : new Date().toISOString(),
    notes: buildInterviewNotes(interviewNotes.trim()),
  }).catch((err) => {
    console.error("Failed to log tracking event", err);
    setError("Couldn't record that stage change in the candidate's history.");
  });
  setInterviewPrompt(null);
}
const [sendingEmail, setSendingEmail] = useState(false);

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
        candidateName: `${candidate.First_Name} ${candidate.Last_Name}`,
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
    const order = DEFAULT_STAGE_NAMES.indexOf(newColumnName);
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

    if (!candidateForm.First_Name.trim() || !candidateForm.Last_Name.trim()) {
      setFormError("First name and last name are required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      Candidate_ID: `CAND-${Date.now()}`,
      First_Name: candidateForm.First_Name.trim(),
      Last_Name: candidateForm.Last_Name.trim(),
      Age: Number(candidateForm.Age) || 0,
      email: candidateForm.email.trim(),
      Phone_Number: candidateForm.Phone_Number.trim(),
      City: candidateForm.City.trim(),
      Applied_Position: candidateForm.Applied_Position.trim(),
      Experience: candidateForm.Experience.trim(),
      Education: candidateForm.Education.trim(),
      School: candidateForm.School.trim(),
      Skills: candidateForm.Skills.trim(),
      Resume_Input: candidateForm.Resume_Input.trim(),
      Notice_Period: candidateForm.Notice_Period.trim(),
      Status: candidateForm.Status,
      Is_18_Plus: candidateForm.Is_18_Plus,
      Legal_Right_To_Work: candidateForm.Legal_Right_To_Work,
      Former_Current_Mattel_Employee: candidateForm.Former_Current_Mattel_Employee,
      date: new Date().toISOString(),
    };

    try {
      const created = await pb
        .collection(OPERATOR_COLLECTION)
        .create<OperatorRecord>(payload);

      const targetStage = orderedStages.find((s) => s.name === created.Status);
      const bucketId = targetStage ? targetStage.id : UNASSIGNED_ID;

      setColumns((prev) => ({
        ...prev,
        [bucketId]: [created, ...(prev[bucketId] ?? [])],
      }));

      // Seed the candidate's history with their starting stage.
      logTrackingEvent({
        candidateId: created.id,
        position: created.Applied_Position,
        stage: created.Status,
        date: created.date,
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
              Fields map directly to the Operator_dataset columns.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCandidate} className="space-y-5">
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="First_Name" required>
                <Input
                  id="First_Name"
                  value={candidateForm.First_Name}
                  onChange={(e) => updateCandidateField("First_Name", e.target.value)}
                  required
                />
              </Field>
              <Field label="Last name" htmlFor="Last_Name" required>
                <Input
                  id="Last_Name"
                  value={candidateForm.Last_Name}
                  onChange={(e) => updateCandidateField("Last_Name", e.target.value)}
                  required
                />
              </Field>

              <Field label="Age" htmlFor="Age">
                <Input
                  id="Age"
                  type="number"
                  min={0}
                  value={candidateForm.Age}
                  onChange={(e) => updateCandidateField("Age", e.target.value)}
                />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={candidateForm.email}
                  onChange={(e) => updateCandidateField("email", e.target.value)}
                />
              </Field>

              <Field label="Phone number" htmlFor="Phone_Number">
                <Input
                  id="Phone_Number"
                  value={candidateForm.Phone_Number}
                  onChange={(e) => updateCandidateField("Phone_Number", e.target.value)}
                />
              </Field>
              <Field label="City" htmlFor="City">
                <Input
                  id="City"
                  value={candidateForm.City}
                  onChange={(e) => updateCandidateField("City", e.target.value)}
                />
              </Field>

              <Field label="Applied position" htmlFor="Applied_Position">
                <Input
                  id="Applied_Position"
                  value={candidateForm.Applied_Position}
                  onChange={(e) => updateCandidateField("Applied_Position", e.target.value)}
                />
              </Field>
              <Field label="Notice period" htmlFor="Notice_Period">
                <Input
                  id="Notice_Period"
                  value={candidateForm.Notice_Period}
                  onChange={(e) => updateCandidateField("Notice_Period", e.target.value)}
                />
              </Field>

              <Field label="Experience" htmlFor="Experience">
                <Input
                  id="Experience"
                  value={candidateForm.Experience}
                  onChange={(e) => updateCandidateField("Experience", e.target.value)}
                />
              </Field>
              <Field label="Education" htmlFor="Education">
                <Input
                  id="Education"
                  value={candidateForm.Education}
                  onChange={(e) => updateCandidateField("Education", e.target.value)}
                />
              </Field>

              <Field label="School" htmlFor="School">
                <Input
                  id="School"
                  value={candidateForm.School}
                  onChange={(e) => updateCandidateField("School", e.target.value)}
                />
              </Field>
              <Field label="Starting stage" htmlFor="Status">
                <select
                  id="Status"
                  value={candidateForm.Status}
                  onChange={(e) => updateCandidateField("Status", e.target.value)}
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

            <Field label="Skills" htmlFor="Skills" hint="Comma-separated">
              <Input
                id="Skills"
                value={candidateForm.Skills}
                onChange={(e) => updateCandidateField("Skills", e.target.value)}
                placeholder="React, Figma, SQL"
              />
            </Field>

            <Field label="Resume notes" htmlFor="Resume_Input">
              <Textarea
                id="Resume_Input"
                rows={4}
                value={candidateForm.Resume_Input}
                onChange={(e) => updateCandidateField("Resume_Input", e.target.value)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <CheckboxField
                id="Is_18_Plus"
                label="18 or older"
                checked={candidateForm.Is_18_Plus}
                onChange={(v) => updateCandidateField("Is_18_Plus", v)}
              />
              <CheckboxField
                id="Legal_Right_To_Work"
                label="Legal right to work"
                checked={candidateForm.Legal_Right_To_Work}
                onChange={(v) => updateCandidateField("Legal_Right_To_Work", v)}
              />
              <CheckboxField
                id="Former_Current_Mattel_Employee"
                label="Former/current employee"
                checked={candidateForm.Former_Current_Mattel_Employee}
                onChange={(v) => updateCandidateField("Former_Current_Mattel_Employee", v)}
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
          any stage whose name contains "interview". */}
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
                  {interviewPrompt.candidate.First_Name} {interviewPrompt.candidate.Last_Name} was
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
  candidates: OperatorRecord[];
  viewMode: ViewMode;
  isSystem?: boolean;
  onDelete?: () => void;

  visibleCount: number;
  onShowMore: () => void;
  onShowLess: () => void;

  searchValue: string;
  onSearchChange: (value: string) => void;

  onOpenCandidate: (candidate: OperatorRecord) => void;
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
}) => {
  const filteredCandidates = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return candidates;

    return candidates.filter((c) => {
      const haystack = [
        c.First_Name,
        c.Last_Name,
        c.Applied_Position,
        c.City,
        c.email,
        c.Skills,
        c.Phone_Number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [candidates, searchValue]);

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

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search candidates…"
          className="h-8 pl-8 text-sm"
        />
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
                    {...dragProvided.dragHandleProps}
                    className={cn(dragSnapshot.isDragging && "opacity-90")}
                  >
                    {viewMode === "card" ? (
                      <CandidateCard
                        candidate={candidate}
                        onOpen={() => onOpenCandidate(candidate)}
                      />
                    ) : (
                      <CandidateListItem
                        candidate={candidate}
                        onOpen={() => onOpenCandidate(candidate)}
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

const CandidateCard: FC<{ candidate: OperatorRecord; onOpen: () => void }> = ({
  candidate,
  onOpen,
}) => {
  const skills = candidate.Skills
    ? candidate.Skills.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="cursor-grab rounded-lg border bg-background p-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 active:cursor-grabbing"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-medium leading-tight">
          {candidate.First_Name} {candidate.Last_Name}
        </p>
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{candidate.Applied_Position}</p>

      <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        {candidate.City && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {candidate.City}
          </span>
        )}
        {candidate.email && (
          <span className="flex items-center gap-1 truncate">
            <Mail className="h-3 w-3" /> {candidate.email}
          </span>
        )}
        {candidate.Phone_Number && (
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" /> {candidate.Phone_Number}
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

const CandidateListItem: FC<{ candidate: OperatorRecord; onOpen: () => void }> = ({
  candidate,
  onOpen,
}) => (
  <div
    onClick={onOpen}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "Enter") onOpen();
    }}
    className="flex cursor-grab items-center gap-3 rounded-lg border bg-background px-3 py-2 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 active:cursor-grabbing"
  >
    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">
        {candidate.First_Name} {candidate.Last_Name}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {candidate.Applied_Position} {candidate.City ? `· ${candidate.City}` : ""}
      </p>
    </div>
    {candidate.Notice_Period && (
      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
        {candidate.Notice_Period}
      </Badge>
    )}
  </div>
);