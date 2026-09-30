import { supabase } from "@/lib/candidateBoard";
import { DEFAULT_STAGE_NAMES } from "@/lib/candidateBoard";

export interface HiringStage {
  id?: string;
  name: string;
  position: number;
  is_interview: boolean;
}

export interface HiringProcess {
  id: string;
  name: string;
  stages: HiringStage[];
}

export interface ProcessDraft {
  id?: string;
  name: string;
  stages: { id?: string; name: string; is_interview: boolean }[];
}

// Stages that every process must keep (jobs table + stats depend on them).
export const LOCKED_STAGES = ["Applied", "Hired", "Rejected"];

/** Used for jobs that have no hiring_process_id. */
export function defaultStages(): HiringStage[] {
  return DEFAULT_STAGE_NAMES.map((name, i) => ({
    name,
    position: i,
    is_interview: name.toLowerCase().includes("interview"),
  }));
}

export async function fetchProcesses(): Promise<HiringProcess[]> {
  const { data, error } = await supabase
    .from("hiring_processes")
    .select("id, name, stages:hiring_process_stages(id, name, position, is_interview)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    stages: [...p.stages].sort((a: HiringStage, b: HiringStage) => a.position - b.position),
  }));
}

export async function fetchProcessStages(processId: string | null | undefined): Promise<HiringStage[]> {
  if (!processId) return defaultStages();
  const { data, error } = await supabase
    .from("hiring_process_stages")
    .select("id, name, position, is_interview")
    .eq("process_id", processId)
    .order("position");
  if (error) throw error;
  return data && data.length ? (data as HiringStage[]) : defaultStages();
}

export async function saveProcess(input: ProcessDraft): Promise<string> {
  const { data: proc, error } = await supabase
    .from("hiring_processes")
    .upsert({ ...(input.id ? { id: input.id } : {}), name: input.name.trim() })
    .select("id")
    .single();
  if (error) throw error;

  const processId = proc.id as string;

  const { data: existing } = await supabase
    .from("hiring_process_stages")
    .select("id, name")
    .eq("process_id", processId);

  const { data: jobsUsing } = await supabase
    .from("jobs")
    .select("id")
    .eq("hiring_process_id", processId);
  const jobIds = (jobsUsing ?? []).map((j: { id: string }) => j.id);

  // 1. Block removing stages that still hold candidates.
  const keepIds = input.stages.map((s) => s.id).filter(Boolean);
  const removed = (existing ?? []).filter((s: any) => !keepIds.includes(s.id));
  if (jobIds.length) {
    for (const s of removed) {
      const { count } = await supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .in("job_id", jobIds)
        .eq("status", s.name);
      if (count) throw new Error(`Move the candidates out of "${s.name}" before deleting it.`);
    }
  }
  if (removed.length) {
    await supabase
      .from("hiring_process_stages")
      .delete()
      .in("id", removed.map((s: any) => s.id));
  }

  // 2. Renamed stages: carry candidates over to the new name.
  if (jobIds.length) {
    for (const s of input.stages) {
      const old = (existing ?? []).find((e: any) => e.id === s.id);
      if (old && old.name !== s.name) {
        await supabase
          .from("candidates")
          .update({ status: s.name })
          .in("job_id", jobIds)
          .eq("status", old.name);
      }
    }
  }

  // 3. Upsert stages in their new order.
  const rows = input.stages.map((s, i) => ({
    ...(s.id ? { id: s.id } : {}),
    process_id: processId,
    name: s.name.trim(),
    position: i,
    is_interview: s.is_interview,
  }));
  const { error: stageErr } = await supabase.from("hiring_process_stages").upsert(rows);
  if (stageErr) throw stageErr;

  return processId;
}

export async function deleteProcess(id: string) {
  const { error } = await supabase.from("hiring_processes").delete().eq("id", id);
  if (error) throw error;
}