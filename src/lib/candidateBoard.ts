import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
// Reads from Vite env vars — set these in your .env:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const CANDIDATES_TABLE = "candidates";
export const TRACKING_TABLE = "candidate_tracking";
export const INTERVIEW_TABLE = "interview_schedule";
export const JOBS_TABLE = "jobs";

// ---------------------------------------------------------------------------
// Stage / status constants — these mirror the `candidates.status` CHECK
// constraint exactly, so anything written back to the DB stays valid.
// ---------------------------------------------------------------------------
export const DEFAULT_STAGE_NAMES = [
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
] as const;

export type CandidateStatus = (typeof DEFAULT_STAGE_NAMES)[number];

export function isInterviewStage(stageName: string) {
  return stageName.toLowerCase().includes("interview");
}

// ---------------------------------------------------------------------------
// Types — these map 1:1 onto public.candidates. Only the columns the board
// actually touches are listed; add more as the UI needs them.
// ---------------------------------------------------------------------------
export type Gender = "Laki-laki (Male)" | "Perempuan (Female)";
export type MaritalStatus =
  | "Single / Belum Menikah"
  | "Married / Menikah"
  | "Widowed / Janda / Duda";
export type YesNo = "Yes" | "No";

export interface CandidateRecord {
  id: string;
  candidate_code: string | null;
  first_name: string;
  last_name: string;
  age: number | null;
  gender: Gender | null;
  place_of_birth: string | null;
  date_of_birth: string | null;
  email: string;
  phone_number: string | null;
  mobile_phone_wa: string | null;
  identity_card_number: string | null;
  family_card_number: string | null;
  religion: string | null;
  marital_status: MaritalStatus | null;
  city: string | null;
  applied_position: string | null;
  job_id: string | null;
  experience: string | null;
  education: string | null;
  school: string | null;
  skills: string | null;
  certificates: string | null;
  languages: string | null;
  notice_period: string | null;
  status: CandidateStatus;
  is_18_plus: boolean;
  legal_right_to_work: boolean;
  former_current_mattel_employee: boolean;
  consent_data_collection: boolean;
  consent_data_usage: boolean;
  consent_data_retention: boolean;
  resume_path: string | null;
  ktp_path: string | null;
  applied_at: string;
  created_at: string;
  updated_at: string;
}

export type NewCandidateInput = Omit<
  CandidateRecord,
  "id" | "applied_at" | "created_at" | "updated_at"
>;

// What the Apply form actually builds — resume_path/ktp_path are filled in
// automatically by submitApplication() once the files are uploaded, so
// callers don't pass them directly.
export type CandidateApplicationInput = Omit<NewCandidateInput, "resume_path" | "ktp_path">;

export interface TrackingRecord {
  id: string;
  candidate_id: string;
  stage: string;
  moved_at: string;
  notes: string | null;
  created_at: string;
  // Snapshot of the job title the candidate applied for at the time this
  // stage entry was written. Lives on candidate_tracking (not just on
  // candidates) so the history stays accurate even if the candidate later
  // applies to something else or the job's title changes.
  Position_Applied: string | null;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
export interface JobRecord {
  id: string;
  job_title: string;
  job_description: string | null;
  requirements: string | null;
  status: "Open" | "Closed";
  created_at: string;
  updated_at: string;
}

export type NewJobInput = Pick<JobRecord, "job_title" | "job_description" | "requirements" | "status">;

export async function fetchJobs(): Promise<JobRecord[]> {
  const { data, error } = await supabase
    .from(JOBS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as JobRecord[];
}

export async function createJob(input: NewJobInput): Promise<JobRecord> {
  const { data, error } = await supabase.from(JOBS_TABLE).insert(input).select().single();
  if (error) throw error;
  return data as JobRecord;
}

export async function updateJobStatus(jobId: string, status: JobRecord["status"]): Promise<JobRecord> {
  const { data, error } = await supabase
    .from(JOBS_TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw error;
  return data as JobRecord;
}

export async function deleteJob(jobId: string): Promise<void> {
  const { error } = await supabase.from(JOBS_TABLE).delete().eq("id", jobId);
  if (error) throw error;
}

// Keeps a Jobs page in sync in real time — mirrors the old PocketBase
// `subscribe("*", ...)` pattern using Supabase's postgres_changes channel.
// Call the returned function to unsubscribe (e.g. in a useEffect cleanup).
export function subscribeToJobs(handlers: {
  onInsert?: (job: JobRecord) => void;
  onUpdate?: (job: JobRecord) => void;
  onDelete?: (jobId: string) => void;
}) {
  const channel = supabase
    .channel("jobs-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: JOBS_TABLE },
      (payload) => handlers.onInsert?.(payload.new as JobRecord)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: JOBS_TABLE },
      (payload) => handlers.onUpdate?.(payload.new as JobRecord)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: JOBS_TABLE },
      (payload) => handlers.onDelete?.((payload.old as { id: string }).id)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}


export async function fetchJobById(id: string): Promise<JobRecord> {
  const { data, error } = await supabase.from(JOBS_TABLE).select("*").eq("id", id).single();
  if (error) throw error;
  return data as JobRecord;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function fetchCandidates(): Promise<CandidateRecord[]> {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .order("applied_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CandidateRecord[];
}

export async function fetchCandidateById(id: string): Promise<CandidateRecord> {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as CandidateRecord;
}

// Free-text search across the columns a recruiter would actually type into
// the search box. Each whitespace-separated term must match at least one of
// these columns (terms are ANDed together, fields within a term are ORed) —
// same behavior as the old PocketBase filter string.
export async function searchCandidates(rawQuery: string, limit = 50): Promise<CandidateRecord[]> {
  let q = supabase
    .from(CANDIDATES_TABLE)
    .select("*")
    .order("applied_at", { ascending: false })
    .limit(limit);

  const terms = rawQuery.trim().split(/\s+/).filter(Boolean);
  for (const term of terms) {
    const t = term.replace(/[%,]/g, ""); // strip chars that would break the ilike/or syntax
    if (!t) continue;
    q = q.or(
      `first_name.ilike.%${t}%,last_name.ilike.%${t}%,email.ilike.%${t}%,applied_position.ilike.%${t}%,candidate_code.ilike.%${t}%`
    );
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CandidateRecord[];
}

export async function fetchTrackingHistory(candidateId: string): Promise<TrackingRecord[]> {
  const { data, error } = await supabase
    .from(TRACKING_TABLE)
    .select("*")
    .eq("candidate_id", candidateId)
    .order("moved_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TrackingRecord[];
}

// ---------------------------------------------------------------------------
// Recent activity — pipeline movement across ALL candidates, newest first.
// Powers the dashboard feed. The candidate is embedded because the feed needs
// a display name and the role applied for; note that `applied_position` lives
// on `candidates`, not on the tracking row itself.
// ---------------------------------------------------------------------------
export type RecentActivityCandidate = Pick<
  CandidateRecord,
  "id" | "first_name" | "last_name" | "applied_position"
>;

export interface RecentActivityEntry extends TrackingRecord {
  candidate: RecentActivityCandidate | null;
}

export async function fetchRecentActivity(
  limit: number
): Promise<{ entries: RecentActivityEntry[]; total: number }> {
  const { data, error, count } = await supabase
    .from(TRACKING_TABLE)
    .select(
      "id, candidate_id, stage, moved_at, notes, created_at, Position_Applied, candidate:candidates(id, first_name, last_name, applied_position)",
      { count: "exact" }
    )
    .order("moved_at", { ascending: false })
    .order("created_at", { ascending: false }) // stable tiebreak when moved_at is date-only
    .limit(limit);

  if (error) throw error;

  // PostgREST can type a many-to-one embed as an array; normalise to one row.
  const entries = (data ?? []).map((row) => {
    const { candidate, ...rest } = row as TrackingRecord & {
      candidate: RecentActivityCandidate | RecentActivityCandidate[] | null;
    };
    return {
      ...rest,
      candidate: Array.isArray(candidate) ? candidate[0] ?? null : candidate ?? null,
    };
  }) as RecentActivityEntry[];

  // `count` is the total number of tracking rows, not just the page we fetched.
  return { entries, total: count ?? entries.length };
}

// There's no free-text `notes` column on candidates in the schema, so notes
// are modeled as their own append-only entries in candidate_tracking
// (stage = "Note"). This keeps every note timestamped and attributable
// without requiring a schema change.
export const NOTE_STAGE = "Note";

export async function addCandidateNote(candidateId: string, note: string): Promise<TrackingRecord> {
  return logTrackingEvent({ candidateId, stage: NOTE_STAGE, notes: note });
}

// ---------------------------------------------------------------------------
// Search / filtering helpers
// ---------------------------------------------------------------------------
export function matchesCandidateSearch(candidate: CandidateRecord, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    `${candidate.first_name} ${candidate.last_name}`.toLowerCase().includes(q) ||
    (candidate.email ?? "").toLowerCase().includes(q) ||
    (candidate.applied_position ?? "").toLowerCase().includes(q) ||
    (candidate.city ?? "").toLowerCase().includes(q) ||
    (candidate.skills ?? "").toLowerCase().includes(q)
  );
}

// ---------------------------------------------------------------------------
// Writes — status changes always land in `candidates.status` (board position)
// AND get a matching row in `candidate_tracking` (history log), per schema.
// ---------------------------------------------------------------------------
interface LogTrackingEventArgs {
  candidateId: string;
  stage: string;
  date?: string;
  notes?: string;
  // The job title this stage entry belongs to. Optional because most
  // existing call sites (board drag-drop, notes) aren't necessarily tied to
  // a specific application; submitApplication() passes it explicitly.
  positionApplied?: string | null;
}

export async function logTrackingEvent({
  candidateId,
  stage,
  date,
  notes,
  positionApplied,
}: LogTrackingEventArgs): Promise<TrackingRecord> {
  const { data, error } = await supabase
    .from(TRACKING_TABLE)
    .insert({
      candidate_id: candidateId,
      stage,
      moved_at: date ?? new Date().toISOString(),
      notes: notes ?? null,
      Position_Applied: positionApplied ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TrackingRecord;
}

interface CreateInterviewScheduleArgs {
  candidateId: string;
  trackingId?: string | null;
  stage: string;
  startTime: string; // ISO
  endTime: string; // ISO
  interviewer?: string;
  notes?: string;
}

export async function createInterviewSchedule({
  candidateId,
  trackingId,
  stage,
  startTime,
  endTime,
  interviewer,
  notes,
}: CreateInterviewScheduleArgs) {
  const { data, error } = await supabase
    .from(INTERVIEW_TABLE)
    .insert({
      candidate_id: candidateId,
      tracking_id: trackingId ?? null,
      stage,
      start_time: startTime,
      end_time: endTime,
      interviewer: interviewer ?? null,
      notes: notes ?? null,
      status: "Scheduled",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCandidateStatus(candidateId: string, status: string) {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", candidateId)
    .select()
    .single();

  if (error) throw error;
  return data as CandidateRecord;
}

export async function createCandidate(input: NewCandidateInput): Promise<CandidateRecord> {
  const { data, error } = await supabase
    .from(CANDIDATES_TABLE)
    .insert({ ...input, applied_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw error;
  return data as CandidateRecord;
}

// Bulk move used by the multi-select toolbar. Updates `status` for every
// candidate, then best-effort logs a tracking entry for each one — a failed
// history log never rolls back the status move itself.
export async function moveCandidates(candidates: CandidateRecord[], targetStatus: string) {
  const succeeded: CandidateRecord[] = [];
  const failed: CandidateRecord[] = [];

  for (const candidate of candidates) {
    try {
      const updated = await updateCandidateStatus(candidate.id, targetStatus);
      succeeded.push(updated);
      try {
        await logTrackingEvent({
          candidateId: candidate.id,
          stage: targetStatus,
          positionApplied: candidate.applied_position,
        });
      } catch (err) {
        console.error("Status moved but history log failed", err);
      }
    } catch (err) {
      console.error("Failed to move candidate", candidate.id, err);
      failed.push(candidate);
    }
  }

  return { succeeded, failed };
}

// ---------------------------------------------------------------------------
// Application submission — the Apply form writes across nearly every table
// in the schema: candidates (core row) plus one-to-one/one-to-many detail
// tables keyed by candidate_id. Files go to Supabase Storage first, and the
// resulting paths are stored on the candidate row.
// ---------------------------------------------------------------------------

export const RESUME_BUCKET = "resumes";
export const KTP_BUCKET = "ktp-documents";

// Requires "resumes" and "ktp-documents" buckets to exist in Supabase
// Storage (Storage → New bucket). KTP images contain national ID numbers,
// so that bucket should be private with signed-URL access in production —
// this helper uses getPublicUrl() for simplicity; swap in
// createSignedUrl() if the bucket isn't public.
async function uploadCandidateFile(bucket: string, file: File, candidateCode: string) {
  const ext = file.name.split(".").pop() ?? "dat";
  const path = `${candidateCode}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function insertRow(table: string, row: Record<string, unknown>) {
  const { error } = await supabase.from(table).insert(row);
  if (error) throw error;
}

async function insertRows(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
}

export interface CandidateAddressInput {
  ktp_address?: string | null;
  rt?: string | null;
  rw?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  kota_kabupaten?: string | null;
  provinsi?: string | null;
  zip_code?: string | null;
  present_address_same_as_ktp: boolean;
  present_address?: string | null;
  present_address_city?: string | null;
  present_address_province?: string | null;
  present_address_zip_code?: string | null;
}

export interface CandidateEmergencyContactInput {
  name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  address_same_as_me: boolean;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  zip_code?: string | null;
}

export type EducationLevel = "SMA/SMK" | "D3" | "S1" | "S2" | "S3";

export interface CandidateEducationInput {
  level: EducationLevel;
  institution_name?: string | null;
  location?: string | null;
  major?: string | null;
  graduation_year?: string | null;
}

export interface CandidateEmploymentHistoryInput {
  company_name?: string | null;
  last_position?: string | null;
  business_type?: string | null;
  job_description?: string | null;
  start_date?: string | null; // YYYY-MM-DD
  still_working: boolean;
  finish_date?: string | null;
  reason_for_leaving?: string | null;
  recent_gross_monthly_salary?: number | null;
  employer_supervisor_name?: string | null;
  employer_supervisor_position?: string | null;
  employer_supervisor_phone?: string | null;
  period_known_of_employer?: string | null;
}

export interface CandidateFamilyInput {
  spouse_name?: string | null;
  spouse_date_of_birth?: string | null;
  spouse_gender?: Gender | null;
  spouse_education?: string | null;
  number_of_child: number;
}

export interface CandidateChildInput {
  child_name?: string | null;
  child_gender?: Gender | null;
  child_date_of_birth?: string | null;
  child_education?: string | null;
}

export interface CandidateApplicationHistoryInput {
  previously_applied?: YesNo | null;
  previous_application_date?: string | null;
  previous_position_applied?: string | null;
  objection_to_reference_check?: YesNo | null;
  acquaintance_at_mattel?: YesNo | null;
  acquaintance_name?: string | null;
  acquaintance_relationship?: string | null;
}

export interface CandidateOfferDetailsInput {
  expected_gross_monthly_salary?: number | null;
  available_start_date?: string | null;
  uniform_size?: string | null;
}

export interface SubmitApplicationInput {
  candidate: CandidateApplicationInput;
  address: CandidateAddressInput;
  emergencyContact: CandidateEmergencyContactInput;
  education: CandidateEducationInput[];
  employmentHistory?: CandidateEmploymentHistoryInput | null;
  family?: CandidateFamilyInput | null;
  children?: CandidateChildInput[];
  applicationHistory: CandidateApplicationHistoryInput;
  offerDetails: CandidateOfferDetailsInput;
  resumeFile?: File | null;
  ktpFile?: File | null;
}

// Writes the whole application. The core `candidates` row is created first
// and is the source of truth for whether the application "happened" — if a
// detail-table insert below fails, it's collected and surfaced rather than
// thrown, so the applicant doesn't see a false failure after their main
// record was already saved. Returns both the created candidate and any
// section names that failed to save, so the caller can decide how to warn.
export async function submitApplication(
  input: SubmitApplicationInput
): Promise<{ candidate: CandidateRecord; failedSections: string[] }> {
  const candidateCode = input.candidate.candidate_code ?? `CAND-${Date.now()}`;

  let resume_path: string | null = null;
  let ktp_path: string | null = null;
  if (input.resumeFile) {
    resume_path = await uploadCandidateFile(RESUME_BUCKET, input.resumeFile, candidateCode);
  }
  if (input.ktpFile) {
    ktp_path = await uploadCandidateFile(KTP_BUCKET, input.ktpFile, candidateCode);
  }

  const candidate = await createCandidate({
    ...input.candidate,
    candidate_code: candidateCode,
    resume_path,
    ktp_path,
  });

  const failedSections: string[] = [];

  try {
    await insertRow("candidate_address", { candidate_id: candidate.id, ...input.address });
  } catch (err) {
    console.error("Failed to save address", err);
    failedSections.push("address");
  }

  try {
    await insertRow("candidate_emergency_contact", {
      candidate_id: candidate.id,
      ...input.emergencyContact,
    });
  } catch (err) {
    console.error("Failed to save emergency contact", err);
    failedSections.push("emergency contact");
  }

  try {
    await insertRows(
      "candidate_education",
      input.education.map((e) => ({ candidate_id: candidate.id, ...e }))
    );
  } catch (err) {
    console.error("Failed to save education", err);
    failedSections.push("education");
  }

  if (input.employmentHistory) {
    try {
      await insertRow("candidate_employment_history", {
        candidate_id: candidate.id,
        ...input.employmentHistory,
      });
    } catch (err) {
      console.error("Failed to save employment history", err);
      failedSections.push("employment history");
    }
  }

  if (input.family) {
    try {
      await insertRow("candidate_family", { candidate_id: candidate.id, ...input.family });
      if (input.children?.length) {
        await insertRows(
          "candidate_children",
          input.children.map((c) => ({ candidate_id: candidate.id, ...c }))
        );
      }
    } catch (err) {
      console.error("Failed to save family details", err);
      failedSections.push("family details");
    }
  }

  try {
    await insertRow("candidate_application_history", {
      candidate_id: candidate.id,
      ...input.applicationHistory,
    });
  } catch (err) {
    console.error("Failed to save application history", err);
    failedSections.push("application history");
  }

  try {
    await insertRow("candidate_offer_details", { candidate_id: candidate.id, ...input.offerDetails });
  } catch (err) {
    console.error("Failed to save offer details", err);
    failedSections.push("offer details");
  }

  try {
    await logTrackingEvent({
      candidateId: candidate.id,
      stage: candidate.status,
      notes: "Application submitted.",
      positionApplied: candidate.applied_position,
    });
  } catch (err) {
    console.error("Failed to seed tracking history", err);
    failedSections.push("tracking history");
  }

  return { candidate, failedSections };
}