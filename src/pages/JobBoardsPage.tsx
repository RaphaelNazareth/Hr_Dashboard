import { type FC, useEffect, useMemo, useState, useCallback } from "react";
import { Clock, CheckCircle, Trash2, UserPlus, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PageWrapper, PageSection } from "@/components/PageWrapper";

interface OnboardingTask {
  id: string;
  candidate_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  created_at: string;
  candidates?: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
  };
}

// Robust helper to pick the first non-null value from multiple possible keys
const pick = (row: Record<string, any>, keys: string[]) =>
  keys.map((k) => row[k]).find((v) => v) ?? null;

// Maps any candidate row to the HiredCandidate interface regardless of column naming
interface HiredCandidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  applied_position: string | null;
}

const toHired = (r: Record<string, any>): HiredCandidate => ({
  id: r.id,
  full_name:
    pick(r, ["full_name", "name", "candidate_name"]) ??
    ([r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed"),
  email: pick(r, ["email", "email_address"]),
  phone: pick(r, ["phone", "phone_number", "mobile", "mobile_number", "whatsapp"]),
  applied_position: pick(r, ["applied_position", "position_applied", "job_title"]),
});

export const JobBoardsPage: FC = () => {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [hired, setHired] = useState<HiredCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [onboardingCandidate, setOnboardingCandidate] = useState<HiredCandidate | null>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);

  const loadOnboardingTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, candRes] = await Promise.all([
        supabase
          .from("onboarding_tasks")
          .select("*, candidates(first_name, last_name, email, phone_number)")
          .neq("status", "cancelled")
          .order("start_time", { ascending: true }),
        supabase.from("candidates").select("*").eq("status", "Hired"),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      setTasks(tasksRes.data as OnboardingTask[]);
      
      // Get hired candidates that don't have onboarding tasks yet
      if (!candRes.error) {
        const taskedCandidateIds = new Set((tasksRes.data ?? []).map((t: OnboardingTask) => t.candidate_id));
        setHired((candRes.data ?? []).map(toHired).filter((c: HiredCandidate) => !taskedCandidateIds.has(c.id)));
      }
    } catch (err) {
      console.error("Failed to load onboarding tasks", err);
      setError("Couldn't load onboarding schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOnboardingTasks();
  }, [loadOnboardingTasks]);

  const completedTasks = useMemo(() => {
    return tasks.filter((t) => t.status === "completed");
  }, [tasks]);

  const pendingTasks = useMemo(() => {
    return tasks.filter((t) => t.status === "scheduled");
  }, [tasks]);

  const handleComplete = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("onboarding_tasks")
        .update({ status: "completed" })
        .eq("id", taskId);

      if (error) throw error;
      void loadOnboardingTasks();
    } catch (err) {
      console.error("Failed to complete task", err);
      setError("Couldn't update task status.");
    }
  };

  const handleReset = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("onboarding_tasks")
        .update({ status: "scheduled" })
        .eq("id", taskId);

      if (error) throw error;
      void loadOnboardingTasks();
    } catch (err) {
      console.error("Failed to reset task", err);
      setError("Couldn't reset task status.");
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to delete this onboarding task?")) return;

    try {
      const { error } = await supabase.from("onboarding_tasks").delete().eq("id", taskId);

      if (error) throw error;
      void loadOnboardingTasks();
    } catch (err) {
      console.error("Failed to delete task", err);
      setError("Couldn't delete task.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageWrapper className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <PageSection index={0} className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Onboarding</h1>
              <p className="text-muted-foreground">
                Manage onboarding meetings and tasks for newly hired candidates
              </p>
            </div>
            <Button
              onClick={() => {
                setOnboardingCandidate(null);
                setOnboardOpen(true);
              }}
              disabled={hired.length === 0}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Onboard candidate{hired.length > 0 && ` (${hired.length})`}
            </Button>
          </div>
        </PageSection>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Stats */}
        <PageSection index={1}>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-2xl font-semibold">{pendingTasks.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-2xl font-semibold">{completedTasks.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </PageSection>

        {/* Pending Tasks */}
        <PageSection index={2}>
          <Card className="mb-6">
            <CardContent className="p-0">
              <div className="border-b bg-muted/30 px-4 py-3">
                <h3 className="font-medium">Pending Onboarding Meetings</h3>
              </div>
              {loading ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground">
                  <Clock className="h-5 w-5 animate-spin" />
                </div>
              ) : pendingTasks.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                  <Clock className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No pending onboarding meetings</p>
                </div>
              ) : (
                <div className="divide-y">
                  {pendingTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex flex-col items-center gap-1 pt-1 min-w-[60px]">
                        <span className="text-sm font-medium">
                          {new Date(task.start_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(task.start_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{task.candidates?.first_name} {task.candidates?.last_name}</h3>
                          <Badge className="shrink-0 border-0 text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            {task.title}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate mb-1">
                          {task.candidates?.email}
                        </p>
                        {task.notes && <p className="text-sm text-muted-foreground line-clamp-1">{task.notes}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleComplete(task.id)}
                            className="text-xs"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Done
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(task.id)}
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </PageSection>

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <PageSection index={3}>
            <Card className="mb-6">
              <CardContent className="p-0">
                <div className="border-b bg-muted/30 px-4 py-3">
                  <h3 className="font-medium">Completed Onboarding</h3>
                </div>
                <div className="divide-y">
                  {completedTasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors opacity-60">
                      <div className="flex flex-col items-center gap-1 pt-1 min-w-[60px]">
                        <span className="text-sm font-medium">
                          {new Date(task.start_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(task.start_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{task.candidates?.first_name} {task.candidates?.last_name}</h3>
                          <Badge className="shrink-0 border-0 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            {task.title}
                          </Badge>
                          <Badge className="shrink-0 border-0 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Completed
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate mb-1">
                          {task.candidates?.email}
                        </p>
                        {task.notes && <p className="text-sm text-muted-foreground line-clamp-1">{task.notes}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReset(task.id)}
                            className="text-xs"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reset
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(task.id)}
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </PageSection>
        )}

        <OnboardDialog
          open={onboardOpen}
          onOpenChange={setOnboardOpen}
          candidates={hired}
          selected={onboardingCandidate}
          onSelect={setOnboardingCandidate}
          onDone={loadOnboardingTasks}
        />
      </PageWrapper>
    </div>
  );
};

/* ---------- Schedule onboarding for a hired candidate ---------- */

const field =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

const OnboardDialog: FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidates: HiredCandidate[];
  selected: HiredCandidate | null;
  onSelect: (c: HiredCandidate | null) => void;
  onDone: () => void;
}> = ({ open, onOpenChange, candidates, selected, onSelect, onDone }) => {
  const [title, setTitle] = useState("Onboarding");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pre-fill title when selected
  useEffect(() => {
    if (selected) {
      setTitle("Onboarding");
      // Set default date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setStartDate(tomorrow.toISOString().slice(0, 10));
      setStartTime("09:00");
      setEndTime("17:00");
    }
  }, [selected?.id]);

  const resetForm = () => {
    setTitle("Onboarding");
    setStartDate("");
    setStartTime("");
    setEndTime("");
    setNotes("");
    setErr(null);
  };

  const buildEndIso = (date: string, endTimeStr: string) => {
    if (!date || !endTimeStr) return null;
    const d = new Date(date);
    const [h, m] = endTimeStr.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const submit = async () => {
    if (!selected || !title.trim() || !startDate || !startTime) return;
    setSaving(true);
    setErr(null);
    
    try {
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const { error } = await supabase.from("onboarding_tasks").insert({
        candidate_id: selected.id,
        title: title.trim(),
        start_time: startDateTime.toISOString(),
        end_time: buildEndIso(startDate, endTime),
        notes: notes.trim() || null,
        status: "scheduled",
      });
      
      if (error) throw error;
      
      setTitle("Onboarding");
      setStartDate("");
      setStartTime("");
      setEndTime("");
      setNotes("");
      onSelect(null);
      onOpenChange(false);
      onDone();
    } catch (error: any) {
      setErr(error.message || "Failed to schedule onboarding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Onboarding</DialogTitle>
          <DialogDescription>Select a hired candidate and schedule their onboarding session.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="candidate" className="text-sm font-medium mb-1.5 block">
              Candidate
            </Label>
            <select
              id="candidate"
              className={field}
              value={selected?.id ?? ""}
              onChange={(e) => onSelect(candidates.find((c) => c.id === e.target.value) ?? null)}
            >
              <option value="">Select candidate…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <Label htmlFor="title" className="text-sm font-medium mb-1.5 block">
              Title
            </Label>
            <input
              id="title"
              className={field}
              placeholder="Onboarding, Orientation, etc."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="startDate" className="text-sm font-medium mb-1.5 block">
                Date
              </Label>
              <input
                id="startDate"
                type="date"
                className={field}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="startTime" className="text-sm font-medium mb-1.5 block">
                Start Time
              </Label>
              <input
                id="startTime"
                type="time"
                className={field}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="endTime" className="text-sm font-medium mb-1.5 block">
              End Time (Optional)
            </Label>
            <input
              id="endTime"
              type="time"
              className={field}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="notes" className="text-sm font-medium mb-1.5 block">
              Notes (Optional)
            </Label>
            <textarea
              id="notes"
              className={field}
              rows={3}
              placeholder="Additional information about the onboarding session..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <DialogFooter className="flex justify-between items-center">
          <Button 
            type="button" 
            variant="outline" 
            onClick={resetForm}
            disabled={saving}
            className="mr-auto"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || !selected || !title.trim() || !startDate || !startTime}>
              {saving ? "Scheduling…" : "Schedule onboarding"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JobBoardsPage;
