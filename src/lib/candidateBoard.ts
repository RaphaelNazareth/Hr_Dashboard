import PocketBase from "pocketbase";

// ---------------------------------------------------------------------------
// Setup — moved here from RecruitmentProcess.tsx so both pages share one
// client and one set of collection/stage constants.
// ---------------------------------------------------------------------------

export const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090"
);
pb.autoCancellation(false);

export const OPERATOR_COLLECTION = "Operator_dataset";
export const TRACKING_COLLECTION = "Candidate_Tracking";

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
];

export interface OperatorRecord {
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

// Any stage whose name contains "interview" triggers scheduling UI on a
// single drag. For bulk moves we currently skip scheduling entirely (see
// moveCandidates below) but still use this to leave a useful note.
export function isInterviewStage(stageName: string) {
  return stageName.toLowerCase().includes("interview");
}

export async function logTrackingEvent(params: {
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

// Shared search matcher — used by both the Candidates table search and the
// per-column search boxes on the recruitment board, so "what counts as a
// match" never drifts between the two pages.
export function matchesCandidateSearch(candidate: OperatorRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    candidate.First_Name,
    candidate.Last_Name,
    candidate.Applied_Position,
    candidate.City,
    candidate.email,
    candidate.Skills,
    candidate.Phone_Number,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

// ---------------------------------------------------------------------------
// Bulk move — the one function both pages call.
// ---------------------------------------------------------------------------

export interface MoveResult {
  succeeded: OperatorRecord[];
  failed: { id: string; error: unknown }[];
}

/**
 * Moves each candidate to `destinationStageName`: updates Status in
 * PocketBase, then logs a Candidate_Tracking entry.
 *
 * Intentionally does NOT touch any React state — callers apply
 * `succeeded`/`failed` to their own local state shape afterward, since
 * RecruitmentProcess.tsx and Candidates.tsx store candidates differently.
 *
 * Runs sequentially (not Promise.all) on purpose: keeps load on PocketBase
 * predictable for larger bulk selections, and means a failure on one
 * candidate can't leave others in a half-updated race.
 *
 * Bulk moves into an interview stage currently skip time scheduling — they
 * just log the stage change with a note. Scheduling per-candidate can be
 * added later without changing this function's signature.
 */
export async function moveCandidates(
  candidates: OperatorRecord[],
  destinationStageName: string
): Promise<MoveResult> {
  const succeeded: OperatorRecord[] = [];
  const failed: { id: string; error: unknown }[] = [];

  for (const candidate of candidates) {
    try {
      await pb.collection(OPERATOR_COLLECTION).update(candidate.id, {
        Status: destinationStageName,
      });
      await logTrackingEvent({
        candidateId: candidate.id,
        position: candidate.Applied_Position,
        stage: destinationStageName,
        date: new Date().toISOString(),
        notes: isInterviewStage(destinationStageName)
          ? "Moved in bulk — interview time not yet scheduled."
          : "",
      });
      succeeded.push({ ...candidate, Status: destinationStageName });
    } catch (err) {
      console.error(`Failed to move candidate ${candidate.id}`, err);
      failed.push({ id: candidate.id, error: err });
    }
  }

  return { succeeded, failed };
}