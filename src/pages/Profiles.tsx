import { useEffect, useMemo, useState, useRef } from 'react';
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

// Supabase-backed data layer
import {
  fetchCandidateById,
  searchCandidates,
  fetchTrackingHistory,
  addCandidateNote,
  NOTE_STAGE,
} from '@/lib/candidateBoard';
import type { CandidateRecord, TrackingRecord } from '@/lib/candidateBoard';

type TabKey = 'about' | 'resume' | 'notes' | 'history' | 'interview';

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
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<CandidateRecord | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('about');
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);

  // Notes are modeled as append-only candidate_tracking entries
  // (stage = "Note") since the schema has no free-text notes column.
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSavedAt, setNoteSavedAt] = useState<number | null>(null);

  const [trackingLogs, setTrackingLogs] = useState<TrackingRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoadingList(true);
      try {
        const results = await searchCandidates(query);
        if (!cancelled) {
          setCandidates(results);
          if (selected) {
            const stillThere = results.find((c) => c.id === selected.id);
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

  function selectCandidate(candidate: CandidateRecord) {
    setSelected(candidate);
    setActiveTab('about');
    setNoteDraft('');
    setNoteSavedAt(null);
  }

  // Pull the stage-change / note / interview log for whichever candidate is
  // open — this feeds the History, Notes, and Interview tabs below.
  useEffect(() => {
    if (!selected) {
      setTrackingLogs([]);
      return;
    }

    let cancelled = false;
    setLoadingLogs(true);
    setLogsError(null);

    fetchTrackingHistory(selected.id)
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
  //
  // NOTE on the loading-state bug: previously this effect gated
  // `setDeepLinkLoading(false)` behind `if (!cancelled)`. Under React 18
  // StrictMode (dev only), effects mount -> cleanup -> mount again. The
  // `lastFetchedCandidateId` ref caused the *second* mount to bail out
  // immediately (since the id hadn't actually changed), so nothing was left
  // to reset the loading flag except the *first* mount's async callback —
  // but by the time that resolved, its own `cancelled` had already been
  // flipped to true by the StrictMode cleanup, so the `if (!cancelled)`
  // check silently skipped the reset and the spinner never went away.
  //
  // Fix: always reset `deepLinkLoading` in `finally`, regardless of
  // `cancelled`. We still gate the *data* writes (candidate list, selection,
  // query, error) behind `cancelled` so a superseded request can't clobber
  // state from a newer one — but the loading indicator itself should always
  // reflect "this particular async call is done," not "...and it wasn't
  // preempted."
  const lastFetchedCandidateId = useRef<string | null>(null);
  useEffect(() => {
    const candidateId = searchParams.get('candidateId');
    if (!candidateId) return;
    if (lastFetchedCandidateId.current === candidateId) return;
    lastFetchedCandidateId.current = candidateId;
    let cancelled = false;

    setDeepLinkLoading(true);
    setDeepLinkError(null);

    (async () => {
      try {
        const candidate = await fetchCandidateById(candidateId);

        if (cancelled) return;

        setCandidates((prev) => (prev.some((c) => c.id === candidate.id) ? prev : [candidate, ...prev]));
        selectCandidate(candidate);
        setQuery(`${candidate.first_name} ${candidate.last_name}`.trim());

        // Strip the param so it doesn't re-trigger on subsequent renders/back-nav.
        const next = new URLSearchParams(searchParams);
        next.delete('candidateId');
        setSearchParams(next, { replace: true });
      } catch (err) {
        console.error('Failed to load candidate from link', err);
        if (!cancelled) setDeepLinkError("Couldn't load that candidate — please search manually.");
      } finally {
        // Always clear the spinner for THIS call, even if it was
        // superseded/cancelled — see note above.
        setDeepLinkLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function saveNote() {
    if (!selected || !noteDraft.trim()) return;
    setSavingNote(true);
    try {
      const entry = await addCandidateNote(selected.id, noteDraft.trim());
      setTrackingLogs((prev) => [entry, ...prev]);
      setNoteDraft('');
      setNoteSavedAt(Date.now());
    } catch (err) {
      console.error('Failed to save note', err);
    } finally {
      setSavingNote(false);
    }
  }

  const listCount = useMemo(() => candidates.length, [candidates]);

  const noteEntries = useMemo(
    () => trackingLogs.filter((entry) => entry.stage === NOTE_STAGE),
    [trackingLogs]
  );
  const stageHistory = useMemo(
    () => trackingLogs.filter((entry) => entry.stage !== NOTE_STAGE),
    [trackingLogs]
  );
  const interviewLogs = useMemo(
    () => stageHistory.filter((entry) => entry.stage.toLowerCase().includes('interview')),
    [stageHistory]
  );

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
              {deepLinkError && (
                <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {deepLinkError}
                </div>
              )}
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
                          {initials(c.first_name, c.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {c.first_name} {c.last_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.applied_position}
                        </p>
                      </div>
                      <Badge
                        className={cn(
                          'shrink-0 border-0 text-[10px] font-medium',
                          statusVariantClass(c.status)
                        )}
                      >
                        {c.status || '—'}
                      </Badge>
                    </button>
                  );
                })}
            </div>
          </Card>

          {/* Right: candidate detail */}
          <Card className="h-[calc(100vh-14rem)] overflow-y-auto">
            {!selected && deepLinkLoading && (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="mb-3 h-10 w-10 animate-spin" />
                <p className="text-sm">Loading candidate profile...</p>
              </div>
            )}
            {!selected && !deepLinkLoading && (
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
                      {initials(selected.first_name, selected.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold text-foreground">
                        {selected.first_name} {selected.last_name}
                      </h2>
                      <Badge className={cn('border-0 font-medium', statusVariantClass(selected.status))}>
                        {selected.status || 'Unknown'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{selected.applied_position}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" /> {selected.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {selected.phone_number}
                      </span>
                      {selected.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {selected.city}
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
                      <p className="text-sm text-muted-foreground">{selected.experience || '—'}</p>
                    </section>

                    <section>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                        <GraduationCap className="h-4 w-4" /> Education
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {selected.education || '—'}
                        {selected.school ? ` · ${selected.school}` : ''}
                      </p>
                    </section>

                    <section>
                      <h3 className="mb-2 text-sm font-semibold text-foreground">Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {(selected.skills || '')
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((skill) => (
                            <Badge key={skill} variant="secondary" className="font-normal">
                              {skill}
                            </Badge>
                          ))}
                        {!selected.skills && (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </section>

                    <section className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Age</p>
                        <p className="font-medium text-foreground">{selected.age ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Notice Period</p>
                        <p className="font-medium text-foreground">
                          {selected.notice_period || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">18+ Confirmed</p>
                        <p className="font-medium text-foreground">
                          {selected.is_18_plus ? 'Yes' : 'No'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Legal Right to Work</p>
                        <p className="font-medium text-foreground">
                          {selected.legal_right_to_work ? 'Yes' : 'No'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Former/Current Mattel Employee</p>
                        <p className="font-medium text-foreground">
                          {selected.former_current_mattel_employee ? 'Yes' : 'No'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Applied On</p>
                        <p className="font-medium text-foreground">
                          {selected.applied_at ? new Date(selected.applied_at).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </section>
                  </TabsContent>

                  <TabsContent value="resume">
                    <div className="rounded-lg border p-4">
                      {selected.resume_path ? (
                        <a
                          href={selected.resume_path}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary underline underline-offset-2"
                        >
                          View resume file
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No resume on file.
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="notes">
                    <Textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Add a note about this candidate..."
                      rows={4}
                    />
                    <div className="mt-3 flex items-center gap-3">
                      <Button
                        onClick={saveNote}
                        disabled={savingNote || !noteDraft.trim()}
                        size="sm"
                        className="gap-1.5"
                      >
                        {savingNote ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Add Note
                      </Button>
                      {savingNote && (
                        <span className="text-xs text-muted-foreground">Saving…</span>
                      )}
                      {!savingNote && noteSavedAt && (
                        <span className="text-xs text-muted-foreground">Note added</span>
                      )}
                    </div>

                    <div className="mt-6 space-y-4">
                      {loadingLogs ? (
                        <div className="flex items-center justify-center py-6 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : noteEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No notes yet.</p>
                      ) : (
                        noteEntries.map((entry) => (
                          <div key={entry.id} className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(entry.moved_at)}
                            </p>
                            <p className="mt-1 text-sm text-foreground">{entry.notes}</p>
                          </div>
                        ))
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
                    ) : stageHistory.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                        No history yet. This will populate as the candidate moves through the
                        pipeline.
                      </div>
                    ) : (
                      <ol className="relative space-y-6 border-l pl-6">
                        {stageHistory.map((entry) => (
                          <li key={entry.id} className="relative">
                            <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{entry.stage || 'Unknown stage'}</p>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(entry.moved_at)}
                              </span>
                            </div>
                            {entry.notes && (
                              <p className="mt-1 text-sm text-muted-foreground">{entry.notes}</p>
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
                    ) : interviewLogs.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                        No interview scheduled yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {interviewLogs.map((entry) => (
                          <div key={entry.id} className="rounded-lg border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">{entry.stage}</p>
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarClock className="h-3.5 w-3.5" />
                                {formatDateTime(entry.moved_at)}
                              </span>
                            </div>
                            {entry.notes && (
                              <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
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