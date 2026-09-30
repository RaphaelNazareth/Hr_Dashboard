import { type FC, useEffect, useCallback, useMemo, useState } from "react";
import { Users, UserPlus, UserMinus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type EmployeeStatus = "Active" | "On Leave" | "Terminated";
type TerminationType = "Resigned" | "Terminated" | "Contract Ended" | "Retired";

interface Employee {
  id: string;
  candidate_id: string | null;
  employee_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string;
  department: string | null;
  employment_type: string;
  start_date: string;
  status: EmployeeStatus;
  termination_date: string | null;
  termination_type: TerminationType | null;
  termination_reason: string | null;
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
  applied_position: pick(r, ["applied_position", "applied_position", "position_applied", "job_title"]),
});

const FILTERS: (EmployeeStatus | "All")[] = ["All", "Active", "On Leave", "Terminated"];

const statusStyle: Record<EmployeeStatus, string> = {
  Active: "bg-emerald-100 text-emerald-800",
  "On Leave": "bg-amber-100 text-amber-800",
  Terminated: "bg-red-100 text-red-800",
};

const field =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export const PeoplePage: FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [hired, setHired] = useState<HiredCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [query, setQuery] = useState("");

  const [onboarding, setOnboarding] = useState<HiredCandidate | null>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [terminating, setTerminating] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [empRes, candRes] = await Promise.all([
      supabase.from("employees").select("*").order("created_at", { ascending: false }),
      supabase.from("candidates").select("*").eq("status", "Hired"),
    ]);
    if (empRes.error) setError(empRes.error.message);
    else setEmployees(empRes.data as Employee[]);
    if (!candRes.error) {
      const taken = new Set((empRes.data ?? []).map((e: Employee) => e.candidate_id));
      setHired((candRes.data ?? []).map(toHired).filter((c: HiredCandidate) => !taken.has(c.id)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(
      (e) =>
        (filter === "All" || e.status === filter) &&
        (!q ||
          e.full_name.toLowerCase().includes(q) ||
          e.job_title.toLowerCase().includes(q) ||
          (e.department ?? "").toLowerCase().includes(q) ||
          e.employee_number.toLowerCase().includes(q)),
    );
  }, [employees, filter, query]);

  const counts = useMemo(
    () => ({
      active: employees.filter((e) => e.status === "Active").length,
      leave: employees.filter((e) => e.status === "On Leave").length,
      gone: employees.filter((e) => e.status === "Terminated").length,
    }),
    [employees],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">People</h1>
          <p className="text-sm text-muted-foreground">
            {counts.active} active · {counts.leave} on leave · {counts.gone} terminated
          </p>
        </div>
        <Button
          onClick={() => {
            setOnboarding(null);
            setOnboardOpen(true);
          }}
          disabled={hired.length === 0}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add hired candidate{hired.length > 0 && ` (${hired.length})`}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, title, department"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                filter === f ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">Could not load employees: {error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Start date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 h-8 w-8" />
                  {employees.length === 0
                    ? "No employees yet. Move a candidate to Hired, then add them here."
                    : "No employees match this filter."}
                </td>
              </tr>
            ) : (
              visible.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{e.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.employee_number}
                      {e.email && ` · ${e.email}`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{e.job_title}</div>
                    <div className="text-xs text-muted-foreground">{e.department ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">{e.employment_type}</td>
                  <td className="px-4 py-3">{e.start_date}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusStyle[e.status])}>
                      {e.status}
                    </span>
                    {e.status === "Terminated" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {e.termination_type} · {e.termination_date}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.status !== "Terminated" && (
                      <Button variant="ghost" size="sm" onClick={() => setTerminating(e)}>
                        <UserMinus className="mr-1.5 h-4 w-4" />
                        Terminate
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <OnboardDialog
        open={onboardOpen}
        onOpenChange={setOnboardOpen}
        candidates={hired}
        selected={onboarding}
        onSelect={setOnboarding}
        onDone={load}
      />
      <TerminateDialog employee={terminating} onClose={() => setTerminating(null)} onDone={load} />
    </div>
  );
};

/* ---------- Add a hired candidate as an employee ---------- */

const OnboardDialog: FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidates: HiredCandidate[];
  selected: HiredCandidate | null;
  onSelect: (c: HiredCandidate | null) => void;
  onDone: () => void;
}> = ({ open, onOpenChange, candidates, selected, onSelect, onDone }) => {
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [type, setType] = useState("Full-time");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pre-fill job title from candidate's applied_position when selected
  useEffect(() => {
    if (selected?.applied_position) {
      setJobTitle(selected.applied_position);
    }
  }, [selected?.id]);

  const submit = async () => {
    if (!selected || !jobTitle.trim()) return;
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("employees").insert({
      candidate_id: selected.id,
      full_name: selected.full_name,
      email: selected.email,
      phone: selected.phone,
      job_title: jobTitle.trim(),
      department: department.trim() || null,
      employment_type: type,
      start_date: startDate,
    });
    setSaving(false);
    if (error) return setErr(error.message);
    setJobTitle("");
    setDepartment("");
    onSelect(null);
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add hired candidate</DialogTitle>
          <DialogDescription>Candidates at the Hired stage who aren't employees yet.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <select
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
          <input className={field} placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          <input className={field} placeholder="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
          <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
            {["Full-time", "Part-time", "Contract", "Intern"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || !selected || !jobTitle.trim()}>
            {saving ? "Saving…" : "Add employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---------- Terminate ---------- */

const TerminateDialog: FC<{
  employee: Employee | null;
  onClose: () => void;
  onDone: () => void;
}> = ({ employee, onClose, onDone }) => {
  const [type, setType] = useState<TerminationType>("Resigned");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!employee) return;
    setSaving(true);
    setErr(null);
    const { error } = await supabase
      .from("employees")
      .update({
        status: "Terminated",
        termination_type: type,
        termination_date: date,
        termination_reason: reason.trim() || null,
      })
      .eq("id", employee.id);
    setSaving(false);
    if (error) return setErr(error.message);
    setReason("");
    onClose();
    onDone();
  };

  return (
    <Dialog open={!!employee} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Terminate {employee?.full_name}?</DialogTitle>
          <DialogDescription>
            The record stays in the directory as Terminated. This can't be undone from this page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <select className={field} value={type} onChange={(e) => setType(e.target.value as TerminationType)}>
            {["Resigned", "Terminated", "Contract Ended", "Retired"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
          <textarea className={field} rows={3} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-red-600 text-white hover:bg-red-700">
            {saving ? "Saving…" : "Confirm termination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PeoplePage;