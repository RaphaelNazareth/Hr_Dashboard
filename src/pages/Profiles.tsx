import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  GraduationCap,
  FileText,
  StickyNote,
  History as HistoryIcon,
  CalendarClock,
  User as UserIcon,
  Save,
  Loader2,
} from 'lucide-react';
// Layout
import { Header } from '@/components/Header';
import { PageWrapper, PageSection } from '@/components/PageWrapper';

// UI
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// Only keep these if they actually exist in your project
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Utilities
import { cn } from '@/lib/utils';

// PocketBase
import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090"
);

const TRACKING_COLLECTION = 'Candidate_Tracking';

// ---- Types -----------------------------------------------------------

interface Candidate extends RecordModel {
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
  Notes?: string;
  date: string;
}

type TabKey = 'about' | 'resume' | 'notes' | 'history' | 'interview';

// A row from the Candidate_Tracking collection — one entry per stage change,
// linked back to this candidate via the candidate_id relation.
interface TrackingEntry extends RecordModel {
  candidate_id: string;
  Applied_Position: string;
  Stage: string;
  Date: string;
  Notes: string;
}

const TABS: { key: TabKey; label: string; icon: typeof UserIcon }[] = [
  { key: 'about', label: 'About', icon: UserIcon },
  { key: 'resume', label: 'Resume', icon: FileText },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'interview', label: 'Interview', icon: CalendarClock },
];

// ---- Helpers -----------------------------------------------------------

function initials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function formatDateTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function buildCandidateSearchFilter(rawQuery: string) {
  const terms = rawQuery
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return '';

  const escape = (term: string) => term.replace(/"/g, '\\"');

  const termClauses = terms.map((term) => {
    const t = escape(term);
    return `(First_Name ~ "${t}" || Last_Name ~ "${t}" || email ~ "${t}" || Applied_Position ~ "${t}" || Candidate_ID ~ "${t}")`;
  });

  return termClauses.join(' && ');
}
function statusVariantClass(status: string) {
  const s = (status || '').toLowerCase();
  if (s.includes('reject'))
    return 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/10';
  if (s.includes('hire') || s.includes('offer'))
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10';
  if (s.includes('interview'))
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10';
  if (s.includes('review') || s.includes('pending'))
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10';
  return 'bg-muted text-muted-foreground hover:bg-muted';
}

// ---- Component -----------------------------------------------------------

export function ProfilesPage() {
  // Populated when arriving here via a Candidates row click
  // (e.g. /profiles?candidateId=abc123). Read once on mount to auto-select
  // and surface that candidate, same pattern as the Dashboard → Candidates links.
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('about');

  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);

  const [trackingLogs, setTrackingLogs] = useState<TrackingEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoadingList(true);
      try {
        const filter = buildCandidateSearchFilter(query);
        const result = await pb.collection('Operator_dataset').getList<Candidate>(1, 50, {
          filter,
          sort: '-date',
        });
        if (!cancelled) {
          setCandidates(result.items);
          if (selected) {
            const stillThere = result.items.find((c) => c.id === selected.id);
            if (stillThere) setSelected(stillThere);
          }
        }
      } catch (err) {
        console.error('Failed to load candidates', err);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function selectCandidate(candidate: Candidate) {
    setSelected(candidate);
    setActiveTab('about');
    setNotesDraft(candidate.Notes ?? '');
    setNotesSavedAt(null);
  }

  // Pull the stage-change / interview log for whichever candidate is open —
  // this feeds both the History tab and the Interview tab below.
  useEffect(() => {
    if (!selected) {
      setTrackingLogs([]);
      return;
    }

    let cancelled = false;
    setLoadingLogs(true);
    setLogsError(null);

    pb.collection(TRACKING_COLLECTION)
      .getFullList<TrackingEntry>({
        filter: `candidate_id = "${selected.id}"`,
        sort: '-Date',
      })
      .then((entries) => {
        if (!cancelled) setTrackingLogs(entries);
      })
      .catch((err) => {
        console.error('Failed to load candidate tracking history', err);
        if (!cancelled) setLogsError("Couldn't load this candidate's history.");
      })
      .finally(() => {
        if (!cancelled) setLoadingLogs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  // Deep link from Candidates: fetch the exact record by id, drop it into the
  // list (in case it isn't among the current search results), select it, and
  // seed the search box with their name so it's visible in context.
  useEffect(() => {
    const candidateId = searchParams.get('candidateId');
    if (!candidateId) return;

    let cancelled = false;

    (async () => {
      try {
        const candidate = await pb.collection('Operator_dataset').getOne<Candidate>(candidateId);
        if (cancelled) return;

        setCandidates((prev) => (prev.some((c) => c.id === candidate.id) ? prev : [candidate, ...prev]));
        selectCandidate(candidate);
        setQuery(`${candidate.First_Name} ${candidate.Last_Name}`.trim());

        // Strip the param so it doesn't re-trigger on subsequent renders/back-nav.
        const next = new URLSearchParams(searchParams);
        next.delete('candidateId');
        setSearchParams(next, { replace: true });
      } catch (err) {
        console.error('Failed to load candidate from link', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function saveNotes() {
    if (!selected) return;
    setSavingNotes(true);
    try {
      const updated = await pb
        .collection('Operator_dataset')
        .update<Candidate>(selected.id, { Notes: notesDraft });
      setSelected(updated);
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setNotesSavedAt(Date.now());
    } catch (err) {
      console.error('Failed to save notes', err);
    } finally {
      setSavingNotes(false);
    }
  }

  // Autosave: once the HR user pauses typing for a beat, persist the note to
  // the database automatically so it's never lost just because "Save" wasn't
  // clicked. A blur-triggered save (below, on the Textarea) covers the case
  // where they click away immediately after typing.
  useEffect(() => {
    if (!selected) return;
    if (notesDraft === (selected.Notes ?? '')) return;

    const handle = setTimeout(() => {
      saveNotes();
    }, 1200);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDraft, selected?.id]);

  const listCount = useMemo(() => candidates.length, [candidates]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <PageWrapper className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <PageSection index={0} className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profiles</h1>
          <p className="text-sm text-muted-foreground">
            Search candidates and review their full profile.
          </p>
        </PageSection>

        <PageSection index={1} className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          {/* Left: search + list */}
          <Card className="flex h-[calc(100vh-14rem)] flex-col overflow-hidden">
            <div className="border-b p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search candidates..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingList && (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}

              {!loadingList && listCount === 0 && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No candidates found.
                </div>
              )}

              {!loadingList &&
                candidates.map((c) => {
                  const isActive = selected?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectCandidate(c)}
                      className={cn(
                        'flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60',
                        isActive && 'bg-primary/10 hover:bg-primary/10'
                      )}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="text-sm font-medium">
                          {initials(c.First_Name, c.Last_Name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {c.First_Name} {c.Last_Name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.Applied_Position}
                        </p>
                      </div>
                      <Badge
                        className={cn(
                          'shrink-0 border-0 text-[10px] font-medium',
                          statusVariantClass(c.Status)
                        )}
                      >
                        {c.Status || '—'}
                      </Badge>
                    </button>
                  );
                })}
            </div>
          </Card>

          {/* Right: candidate detail */}
          <Card className="h-[calc(100vh-14rem)] overflow-y-auto">
            {!selected && (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <UserIcon className="mb-3 h-10 w-10" />
                <p className="text-sm">Select a candidate to view their profile</p>
              </div>
            )}

            {selected && (
              <CardContent className="p-6">
                {/* Header */}
                <div className="mb-6 flex items-start gap-4">
                  <Avatar className="h-16 w-16 shrink-0">
                    <AvatarFallback className="text-xl font-semibold">
                      {initials(selected.First_Name, selected.Last_Name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold text-foreground">
                        {selected.First_Name} {selected.Last_Name}
                      </h2>
                      <Badge className={cn('border-0 font-medium', statusVariantClass(selected.Status))}>
                        {selected.Status || 'Unknown'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{selected.Applied_Position}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" /> {selected.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {selected.Phone_Number}
                      </span>
                      {selected.City && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {selected.City}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
                  <TabsList className="mb-6">
                    {TABS.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
                          <Icon className="h-4 w-4" />
                          {tab.label}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  <TabsContent value="about" className="space-y-6">
                    <section>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Briefcase className="h-4 w-4" /> Experience
                      </h3>
                      <p className="text-sm text-muted-foreground">{selected.Experience || '—'}</p>
                    </section>

                    <section>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                        <GraduationCap className="h-4 w-4" /> Education
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {selected.Education || '—'}
                        {selected.School ? ` · ${selected.School}` : ''}
                      </p>
                    </section>

                    <section>
                      <h3 className="mb-2 text-sm font-semibold text-foreground">Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {(selected.Skills || '')
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((skill) => (
                            <Badge key={skill} variant="secondary" className="font-normal">
                              {skill}
                            </Badge>
                          ))}
                        {!selected.Skills && (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </section>

                    <section className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Age</p>
                        <p className="font-medium text-foreground">{selected.Age ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Notice Period</p>
                        <p className="font-medium text-foreground">
                          {selected.Notice_Period || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">18+ Confirmed</p>
                        <p className="font-medium text-foreground">
                          {selected.Is_18_Plus ? 'Yes' : 'No'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Legal Right to Work</p>
                        <p className="font-medium text-foreground">
                          {selected.Legal_Right_To_Work ? 'Yes' : 'No'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Former/Current Mattel Employee</p>
                        <p className="font-medium text-foreground">
                          {selected.Former_Current_Mattel_Employee ? 'Yes' : 'No'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Applied On</p>
                        <p className="font-medium text-foreground">
                          {selected.date ? new Date(selected.date).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </section>
                  </TabsContent>

                  <TabsContent value="resume">
                    <div className="rounded-lg border p-4">
                      {selected.Resume_Input ? (
                        <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
                          {selected.Resume_Input}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No resume content on file.
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="notes">
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      onBlur={() => {
                        if (selected && notesDraft !== (selected.Notes ?? '')) saveNotes();
                      }}
                      placeholder="Add notes about this candidate..."
                      rows={8}
                    />
                    <div className="mt-3 flex items-center gap-3">
                      <Button onClick={saveNotes} disabled={savingNotes} size="sm" className="gap-1.5">
                        {savingNotes ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Save Notes
                      </Button>
                      {savingNotes && (
                        <span className="text-xs text-muted-foreground">Saving…</span>
                      )}
                      {!savingNotes && notesSavedAt && (
                        <span className="text-xs text-muted-foreground">
                          Saved — this will show up next time you open this profile
                        </span>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="history">
                    {loadingLogs ? (
                      <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : logsError ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-destructive">
                        {logsError}
                      </div>
                    ) : trackingLogs.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                        No history yet. This will populate as the candidate moves through the
                        pipeline.
                      </div>
                    ) : (
                      <ol className="relative space-y-6 border-l pl-6">
                        {trackingLogs.map((entry) => (
                          <li key={entry.id} className="relative">
                            <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{entry.Stage || 'Unknown stage'}</p>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(entry.Date)}
                              </span>
                            </div>
                            {entry.Applied_Position && (
                              <p className="text-xs text-muted-foreground">{entry.Applied_Position}</p>
                            )}
                            {entry.Notes && (
                              <p className="mt-1 text-sm text-muted-foreground">{entry.Notes}</p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </TabsContent>

                  <TabsContent value="interview">
                    {loadingLogs ? (
                      <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : (
                      (() => {
                        const interviewLogs = trackingLogs.filter((entry) =>
                          (entry.Stage || '').toLowerCase().includes('interview')
                        );
                        if (interviewLogs.length === 0) {
                          return (
                            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                              No interview scheduled yet.
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-3">
                            {interviewLogs.map((entry) => (
                              <div key={entry.id} className="rounded-lg border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-foreground">{entry.Stage}</p>
                                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <CalendarClock className="h-3.5 w-3.5" />
                                    {formatDateTime(entry.Date)}
                                  </span>
                                </div>
                                {entry.Notes && (
                                  <p className="mt-2 text-sm text-muted-foreground">{entry.Notes}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            )}
          </Card>
        </PageSection>
      </PageWrapper>
    </div>
  );
}