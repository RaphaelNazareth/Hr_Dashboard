import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CandidateRecord, JobRecord } from "@/lib/candidateBoard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIRecommendation = "strong_fit" | "potential_fit" | "weak_fit";
export type AIStatus = "pending" | "completed" | "failed";

export interface CandidateAIAnalysis {
  id: string;
  candidate_id: string;
  job_id: string | null;
  score: number | null;
  recommendation: AIRecommendation | null;
  summary: string | null;
  strengths: string[];
  concerns: string[];
  status: AIStatus;
  error: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
}

/** What the analysis backend (or the placeholder below) must return. */
export interface AIAnalysisResult {
  score: number; // 0-100
  recommendation: AIRecommendation;
  summary: string;
  strengths: string[];
  concerns: string[];
  model: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * TEMPLATE MODE: while true, analyses are produced by a simple placeholder
 * (scores filled-in profile fields) so the UI works end to end.
 *
 * To switch to Gemini: implement POST {AI_API_URL}/api/analyze-candidate in
 * FastAPI (contract in `requestFromBackend` below) and set this to false.
 */
export const USE_PLACEHOLDER_AI = true;
export const AI_API_URL = "http://127.0.0.1:8000";
export const AI_PROMPT_VERSION = "v0-template";

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export const RECOMMENDATION_META: Record<
  AIRecommendation,
  { label: string; badge: string; bar: string }
> = {
  strong_fit: {
    label: "Strong fit",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "text-emerald-500",
  },
  potential_fit: {
    label: "Potential fit",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "text-amber-500",
  },
  weak_fit: {
    label: "Weak fit",
    badge: "bg-red-500/10 text-red-600 dark:text-red-400",
    bar: "text-red-500",
  },
};

export function recommendationFromScore(score: number): AIRecommendation {
  if (score >= 75) return "strong_fit";
  if (score >= 50) return "potential_fit";
  return "weak_fit";
}

/** Rank = position by score (highest = #1). Ties share a rank. */
export function buildRankMap(analyses: CandidateAIAnalysis[]): Map<string, number> {
  const scored = analyses
    .filter((a) => a.status === "completed" && a.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const map = new Map<string, number>();
  let lastScore: number | null = null;
  let lastRank = 0;
  scored.forEach((a, i) => {
    const rank = a.score === lastScore ? lastRank : i + 1;
    map.set(a.candidate_id, rank);
    lastScore = a.score;
    lastRank = rank;
  });
  return map;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function normalise(row: any): CandidateAIAnalysis {
  return {
    ...row,
    strengths: Array.isArray(row.strengths) ? row.strengths : [],
    concerns: Array.isArray(row.concerns) ? row.concerns : [],
  };
}

export async function fetchAnalysesForJob(jobId: string): Promise<CandidateAIAnalysis[]> {
  const { data, error } = await supabase
    .from("candidate_ai_analyses")
    .select("*")
    .eq("job_id", jobId);
  if (error) throw error;
  return (data ?? []).map(normalise);
}

/** Latest analysis per candidate (any job). Used by the Candidates table. */
export async function fetchLatestAnalysisMap(): Promise<Map<string, CandidateAIAnalysis>> {
  const { data, error } = await supabase
    .from("candidate_ai_analyses")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const map = new Map<string, CandidateAIAnalysis>();
  (data ?? []).forEach((row) => {
    if (!map.has(row.candidate_id)) map.set(row.candidate_id, normalise(row));
  });
  return map;
}

export async function fetchLatestAnalysis(candidateId: string): Promise<CandidateAIAnalysis | null> {
  const { data, error } = await supabase
    .from("candidate_ai_analyses")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? normalise(data) : null;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function splitSkills(skills: string | null | undefined) {
  return (skills ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Placeholder scorer — replace with Gemini via the backend. */
function placeholderAnalysis(c: CandidateRecord, job: JobRecord | null): AIAnalysisResult {
  const skills = splitSkills(c.skills);
  const strengths: string[] = [];
  const concerns: string[] = [];
  let score = 30;

  if (skills.length) {
    score += Math.min(skills.length, 8) * 4;
    strengths.push(`Lists ${skills.length} skill${skills.length === 1 ? "" : "s"}: ${skills.slice(0, 4).join(", ")}.`);
  } else concerns.push("No skills listed.");

  if (c.experience) {
    score += 15;
    strengths.push("Has work experience on file.");
  } else concerns.push("No experience details provided.");

  if (c.education) {
    score += 8;
    strengths.push(`Education: ${c.education}${c.school ? ` (${c.school})` : ""}.`);
  } else concerns.push("Education not provided.");

  if (c.legal_right_to_work) score += 5;
  else concerns.push("Legal right to work not confirmed.");

  if (c.is_18_plus === false) concerns.push("Not confirmed as 18+.");
  if (c.notice_period) {
    strengths.push(`Notice period: ${c.notice_period}.`);
  } else concerns.push("Notice period unknown.");

  score = Math.max(0, Math.min(100, score));
  const name = `${c.first_name} ${c.last_name}`.trim();
  const role = job?.job_title ?? c.applied_position ?? "this role";

  return {
    score,
    recommendation: recommendationFromScore(score),
    summary:
      `${name} applied for ${role}. ` +
      `This is a placeholder summary based on how complete the profile is — ` +
      `connect the Gemini backend to get a real assessment.`,
    strengths,
    concerns,
    model: "placeholder-heuristic",
  };
}

/**
 * Backend contract (FastAPI):
 *   POST {AI_API_URL}/api/analyze-candidate
 *   body:    { candidateId: string, jobId: string | null }
 *   returns: AIAnalysisResult  (score 0-100, recommendation, summary,
 *                               strengths[], concerns[], model)
 * The backend can read the candidate + job from Supabase itself.
 */
async function requestFromBackend(candidateId: string, jobId: string | null): Promise<AIAnalysisResult> {
  const res = await fetch(`${AI_API_URL}/api/analyze-candidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateId, jobId }),
  });
  if (!res.ok) throw new Error(`AI service returned ${res.status}`);
  return (await res.json()) as AIAnalysisResult;
}

async function resolveJob(candidate: CandidateRecord, job?: JobRecord | null): Promise<JobRecord | null> {
  if (job !== undefined) return job;
  if (!candidate.applied_position) return null;
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .ilike("job_title", candidate.applied_position.trim())
    .limit(1)
    .maybeSingle();
  return (data as JobRecord | null) ?? null;
}

/**
 * Analyse one candidate and save the result (overwrites the previous run for
 * the same candidate + job). Pass `job` from a job page; leave it undefined
 * elsewhere and it is looked up from the candidate's applied position.
 */
export async function analyzeCandidate(
  candidate: CandidateRecord,
  job?: JobRecord | null
): Promise<CandidateAIAnalysis> {
  const resolvedJob = await resolveJob(candidate, job);
  const jobId = resolvedJob?.id ?? null;

  try {
    const result = USE_PLACEHOLDER_AI
      ? placeholderAnalysis(candidate, resolvedJob)
      : await requestFromBackend(candidate.id, jobId);

    const score = Math.max(0, Math.min(100, Math.round(result.score)));
    const { data, error } = await supabase
      .from("candidate_ai_analyses")
      .upsert(
        {
          candidate_id: candidate.id,
          job_id: jobId,
          score,
          recommendation: result.recommendation ?? recommendationFromScore(score),
          summary: result.summary,
          strengths: result.strengths ?? [],
          concerns: result.concerns ?? [],
          status: "completed",
          error: null,
          model: result.model,
          prompt_version: AI_PROMPT_VERSION,
        },
        { onConflict: "candidate_id,job_id" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return normalise(data);
  } catch (err) {
    // Record the failure so the UI can show it instead of silently doing nothing.
    await supabase.from("candidate_ai_analyses").upsert(
      {
        candidate_id: candidate.id,
        job_id: jobId,
        status: "failed",
        error: err instanceof Error ? err.message : "Analysis failed",
        prompt_version: AI_PROMPT_VERSION,
      },
      { onConflict: "candidate_id,job_id" }
    );
    throw err;
  }
}

/** Analyse many candidates with limited concurrency. Returns the fresh rows. */
export async function analyzeMany(
  candidates: CandidateRecord[],
  job: JobRecord | null,
  onProgress?: (done: number, total: number) => void,
  concurrency = 2
): Promise<CandidateAIAnalysis[]> {
  const results: CandidateAIAnalysis[] = [];
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < candidates.length) {
      const c = candidates[next++];
      try {
        results.push(await analyzeCandidate(c, job));
      } catch (err) {
        console.error("AI analysis failed for", c.id, err);
      }
      onProgress?.(++done, candidates.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Hook: latest analysis for one candidate (used by the Profiles page)
// ---------------------------------------------------------------------------

export function useCandidateAI(candidate: CandidateRecord | null) {
  const [analysis, setAnalysis] = useState<CandidateAIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = candidate?.id;

  useEffect(() => {
    setAnalysis(null);
    setError(null);
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetchLatestAnalysis(id)
      .then((a) => !cancelled && setAnalysis(a))
      .catch((err) => {
        console.error("Failed to load AI analysis", err);
        if (!cancelled) setError("Couldn't load the AI analysis.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const generate = useCallback(async () => {
    if (!candidate) return;
    setGenerating(true);
    setError(null);
    try {
      setAnalysis(await analyzeCandidate(candidate));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't generate the analysis.");
    } finally {
      setGenerating(false);
    }
  }, [candidate]);

  return { analysis, loading, generating, error, generate };
}