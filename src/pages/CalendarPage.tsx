import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageWrapper, PageSection } from '@/components/PageWrapper';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState, useEffect, type FC } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export const CalendarPage: FC = () => {
  interface ScheduleItem {
    id: string;
    kind: "Interview" | "Onboarding";
    label: string;
    name: string;
    start_time: string;
    originalId: string; // Store the actual database ID
  }

  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadSchedule = async () => {
    const now = new Date().toISOString();
    const [iv, ob] = await Promise.all([
      supabase
        .from("interview_schedule")
        .select("id, stage, start_time, candidates(first_name, last_name)")
        .gte("start_time", now),
      supabase
        .from("onboarding_tasks")
        .select("id, title, start_time, candidates(first_name, last_name)")
        .gte("start_time", now),
    ]);

    const toName = (r: any) => `${r.candidates?.first_name ?? ""} ${r.candidates?.last_name ?? ""}`.trim() || "Candidate";

    const merged: ScheduleItem[] = [
      ...((iv.data as any[]) ?? []).map((r) => ({
        id: `iv-${r.id}`,
        originalId: r.id,
        kind: "Interview" as const,
        label: r.stage,
        name: toName(r),
        start_time: r.start_time,
      })),
      ...((ob.data as any[]) ?? []).map((r) => ({
        id: `ob-${r.id}`,
        originalId: r.id,
        kind: "Onboarding" as const,
        label: r.title,
        name: toName(r),
        start_time: r.start_time,
      })),
    ].sort((a, b) => a.start_time.localeCompare(b.start_time));

    setItems(merged);
  };

  useEffect(() => {
    loadSchedule();
  }, []);

  const handleDelete = async (item: ScheduleItem) => {
    if (!confirm(`Delete this ${item.kind.toLowerCase()} schedule?`)) return;
    
    setDeleting(item.id);
    try {
      const table = item.kind === "Interview" ? "interview_schedule" : "onboarding_tasks";
      const { error } = await supabase.from(table).delete().eq("id", item.originalId);
      
      if (error) throw error;
      
      // Reload the schedule
      await loadSchedule();
    } catch (err) {
      console.error("Failed to delete schedule", err);
      alert("Failed to delete schedule. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageWrapper className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <PageSection index={0} className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Team Calendar</h1>
            <p className="text-muted-foreground">View company calendar, holidays, and events</p>
          </div>
        </PageSection>

        <PageSection index={1}>
          <Card className="mb-6">
            <CardContent className="p-0">
              <iframe
                src="https://calendar.google.com/calendar/embed?src=en-gb.indonesian%23holiday%40group.v.calendar.google.com&ctz=Asia%2FJakarta"
                className="w-full h-[600px] border-0"
                title="Google Calendar"
              />
            </CardContent>
          </Card>
        </PageSection>

        {/* Upcoming schedule */}
        <PageSection index={2}>
          <Card className="mb-6">
            <CardContent className="space-y-2 p-4">
              <h3 className="text-sm font-medium">Upcoming schedule</h3>
              {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
              {items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={
                        i.kind === "Interview"
                          ? "shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] text-blue-700 dark:text-blue-300"
                          : "shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      {i.kind}
                    </span>
                    <span className="truncate">{i.name} · {i.label}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{new Date(i.start_time).toLocaleString("en-GB")}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(i)}
                      disabled={deleting === i.id}
                      className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </PageSection>
      </PageWrapper>
    </div>
  );
};

export default CalendarPage;
