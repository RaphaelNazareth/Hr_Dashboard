import { type FC, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, GitBranch, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LOCKED_STAGES,
  deleteProcess,
  fetchProcesses,
  saveProcess,
  type HiringProcess,
  type ProcessDraft,
} from "@/lib/Hiringprocesses";

const NEW_DRAFT: ProcessDraft = {
  name: "",
  stages: [
    { name: "Applied", is_interview: false },
    { name: "Hired", is_interview: false },
    { name: "Rejected", is_interview: false },
  ],
};

function toDraft(p: HiringProcess): ProcessDraft {
  return {
    id: p.id,
    name: p.name,
    stages: p.stages.map((s) => ({ id: s.id, name: s.name, is_interview: s.is_interview })),
  };
}

export const HiringProcessesPage: FC = () => {
  const [processes, setProcesses] = useState<HiringProcess[]>([]);
  const [draft, setDraft] = useState<ProcessDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(selectId?: string) {
    setLoading(true);
    try {
      const list = await fetchProcesses();
      setProcesses(list);
      const pick = list.find((p) => p.id === (selectId ?? draft?.id));
      if (pick) setDraft(toDraft(pick));
    } catch (err) {
      console.error(err);
      setError("Couldn't load hiring processes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateStage(i: number, patch: Partial<ProcessDraft["stages"][number]>) {
    setDraft((d) => d && { ...d, stages: d.stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  }

  // New stages are inserted just before the locked tail (Hired / Rejected).
  function addStage() {
    setDraft((d) => {
      if (!d) return d;
      const tailStart = d.stages.findIndex((s) => s.name === "Hired" || s.name === "Rejected");
      const at = tailStart === -1 ? d.stages.length : tailStart;
      const stages = [...d.stages];
      stages.splice(at, 0, { name: "", is_interview: false });
      return { ...d, stages };
    });
  }

  function move(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 1 || j >= d.stages.length) return d; // keep Applied first
      const stages = [...d.stages];
      [stages[i], stages[j]] = [stages[j], stages[i]];
      return { ...d, stages };
    });
  }

  async function handleSave() {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Give this process a name.");
    if (draft.stages.some((s) => !s.name.trim())) return setError("Every stage needs a name.");
    const names = draft.stages.map((s) => s.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) return setError("Stage names must be unique.");

    setSaving(true);
    setError(null);
    try {
      const id = await saveProcess(draft);
      await load(id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't save this process.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft?.id) return setDraft(null);
    if (!window.confirm(`Delete "${draft.name}"? Jobs using it will fall back to the default stages.`)) return;
    try {
      await deleteProcess(draft.id);
      setDraft(null);
      await load();
    } catch (err) {
      console.error(err);
      setError("Couldn't delete this process.");
    }
  }

  return (
    <>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Hiring Stage Template</h1>
        <p className="mb-6 mt-1 text-muted-foreground">
          Build a pipeline per role type, then pick it when creating a job.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* List */}
          <Card>
            <CardContent className="space-y-1 p-3">
              <Button
                className="mb-2 w-full gap-2"
                onClick={() => {
                  setError(null);
                  setDraft(structuredClone(NEW_DRAFT));
                }}
              >
                <Plus className="h-4 w-4" /> New Template
              </Button>
              {loading ? (
                <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />
              ) : processes.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">No processes yet.</p>
              ) : (
                processes.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setError(null);
                      setDraft(toDraft(p));
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                      draft?.id === p.id && "bg-primary/10 font-medium"
                    )}
                  >
                    <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{p.stages.length}</span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Editor */}
          <Card>
            <CardContent className="p-6">
              {!draft ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
                  <GitBranch className="h-10 w-10" />
                  <p className="text-sm">Select a process or create a new one.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Process name</label>
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="e.g. Software Engineering"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Stages</h3>
                      <span className="text-xs text-muted-foreground">
                        Tick "Interview" to prompt for a schedule when candidates enter that stage.
                      </span>
                    </div>

                    <ol className="space-y-2">
                      {draft.stages.map((s, i) => {
                        const locked = LOCKED_STAGES.includes(s.name);
                        const fixedPos = i === 0 || locked;
                        return (
                          <li key={s.id ?? i} className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2">
                            <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                            <Input
                              value={s.name}
                              disabled={locked}
                              onChange={(e) => updateStage(i, { name: e.target.value })}
                              placeholder="Stage name, e.g. Technical Interview"
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
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i <= 1}>
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => move(i, 1)}
                                  disabled={fixedPos ? true : LOCKED_STAGES.includes(draft.stages[i + 1]?.name)}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() =>
                                    setDraft({ ...draft, stages: draft.stages.filter((_, idx) => idx !== i) })
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>

                    <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={addStage}>
                      <Plus className="h-4 w-4" /> Add stage
                    </Button>
                  </div>

                  <div className="flex justify-between border-t pt-4">
                    <Button variant="ghost" className="gap-1.5 text-destructive" onClick={handleDelete}>
                      <Trash2 className="h-4 w-4" />
                      {draft.id ? "Delete process" : "Discard"}
                    </Button>
                    <Button className="gap-2" onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save process
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
};

export default HiringProcessesPage;