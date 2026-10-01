import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Plus,
  Search,
  Users,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isInterviewStage } from '@/lib/candidateBoard';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Icon = FC<{ className?: string }>;

interface CandidateRow {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  applied_position: string | null;
  created_at?: string;
}

interface InterviewRow {
  id: string;
  candidate_id: string | null;
  stage: string;
  start_time: string;
}

interface JobRow {
  id: string;
  job_title: string;
  status: string;
}

interface OnboardingRow {
  id: string;
  candidate_id: string;
  title: string;
  start_time: string;
  candidates?: {
    first_name: string;
    last_name: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function useDashboardData() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [jobsRes, candRes, ivRes, onbRes] = await Promise.all([
        supabase.from('jobs').select('id, job_title, status').eq('status', 'Open'),
        supabase.from('candidates').select('id, first_name, last_name, status, applied_position, created_at'),
        supabase.from('interview_schedule').select('id, candidate_id, stage, start_time'),
        supabase.from('onboarding_tasks').select('id, candidate_id, title, start_time, candidates(first_name, last_name)').eq('status', 'scheduled'),
      ]);
      if (cancelled) return;

      const firstError = jobsRes.error ?? candRes.error ?? ivRes.error ?? onbRes.error;
      if (firstError) setError(firstError.message);

      setJobs((jobsRes.data as JobRow[]) ?? []);
      setCandidates((candRes.data as CandidateRow[]) ?? []);
      setInterviews((ivRes.data as InterviewRow[]) ?? []);
      setOnboarding((onbRes.data as OnboardingRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { jobs, candidates, interviews, onboarding, loading, error };
}

// ---------------------------------------------------------------------------
// UI pieces
// ---------------------------------------------------------------------------

const StatCard: FC<{
  icon: Icon;
  value: number;
  label: string;
  subtext?: string;
  tone: string;
  loading: boolean;
  onClick: () => void;
}> = ({ icon: Icon, value, label, subtext, tone, loading, onClick }) => (
  <Card className="cursor-pointer transition-all hover:shadow-lg" onClick={onClick}>
    <CardContent className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-4xl font-bold tabular-nums">{loading ? '—' : value}</p>
          <p className="mt-3 text-base font-semibold">{label}</p>
          {subtext && <p className="mt-1 text-sm text-muted-foreground">{subtext}</p>}
        </div>
        <div className={cn('rounded-2xl p-3', tone)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const Section: FC<{
  title: string;
  action: string;
  onAction: () => void;
  children: ReactNode;
}> = ({ title, action, onAction, children }) => (
  <Card>
    <CardHeader className="p-6 pb-4">
      <div className="flex items-center justify-between gap-4">
        <CardTitle className="text-xl">{title}</CardTitle>
        <button
          onClick={onAction}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </CardHeader>
    <CardContent className="max-h-[26rem] overflow-y-auto p-6 pt-2">{children}</CardContent>
  </Card>
);

const Empty: FC<{ children: ReactNode; icon?: Icon }> = ({ children, icon: Icon }) => (
  <div className="flex flex-col items-center py-10 text-center text-sm text-muted-foreground">
    {Icon && <Icon className="mb-3 h-8 w-8 opacity-50" />}
    {children}
  </div>
);

const PipelineTile: FC<{
  icon: Icon;
  label: string;
  value: number;
  tone: string;
  onClick: () => void;
}> = ({ icon: Icon, label, value, tone, onClick }) => (
  <button
    onClick={onClick}
    className="group flex items-center gap-4 rounded-2xl border bg-muted/40 p-5 text-left transition-all hover:-translate-y-0.5 hover:bg-muted hover:shadow-md"
  >
    <div className={cn('rounded-2xl p-3 transition-transform group-hover:scale-105', tone)}>
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-sm font-medium text-muted-foreground">{label}</div>
    </div>
  </button>
);

const ActionRow: FC<{ text: string; onClick: () => void }> = ({ text, onClick }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left transition-colors hover:bg-amber-100"
  >
    <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
    <span className="flex-1 text-sm font-medium">{text}</span>
    <ChevronRight className="h-4 w-4 text-amber-600" />
  </button>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const Dashboard: FC = () => {
  const navigate = useNavigate();
  const { jobs, candidates, interviews, onboarding, loading, error } = useDashboardData();

  const derived = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

    const byId = new Map(candidates.map((c) => [c.id, c]));

    const openJobs = jobs.length;
    const newJobsThisMonth = jobs.filter((j) => j.id).length; // Simplified for demo

    const totalCandidates = candidates.length;
    const newCandidatesThisWeek = candidates.filter(
      (c) => c.created_at && new Date(c.created_at) >= startOfWeek
    ).length;

    const applied = candidates.filter((c) => c.status === 'Applied').length;
    const screening = candidates.filter((c) => c.status === 'Screening').length;
    const inInterview = candidates.filter((c) => c.status.toLowerCase().includes('interview')).length;
    const offers = candidates.filter((c) => c.status === 'Offering').length;

    const feedbackPending = new Set(
      interviews
        .filter((iv) => new Date(iv.start_time) < now && iv.candidate_id && byId.get(iv.candidate_id)?.status === iv.stage)
        .map((iv) => iv.candidate_id)
    ).size;

    const todayInterviews = interviews
      .filter((iv) => {
        const t = new Date(iv.start_time);
        return t >= startOfToday && t < endOfToday;
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((iv) => ({ ...iv, candidate: iv.candidate_id ? byId.get(iv.candidate_id) : undefined }));

    // If no interviews today, find the nearest upcoming interview
    const nearestInterview =
      todayInterviews.length === 0
        ? interviews
            .filter((iv) => new Date(iv.start_time) >= now)
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .slice(0, 1)
            .map((iv) => ({ ...iv, candidate: iv.candidate_id ? byId.get(iv.candidate_id) : undefined }))
        : [];

    const displayInterviews = todayInterviews.length > 0 ? todayInterviews : nearestInterview;

    const recentActivity = candidates
      .filter((c) => c.created_at)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 3)
      .map((c) => ({
        text: `${c.first_name} ${c.last_name} applied for ${c.applied_position || 'a position'}`,
        time: c.created_at || '',
      }));

    const upcomingOnboarding = onboarding
      .filter((o) => new Date(o.start_time) >= now)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .slice(0, 2);

    const topJobs = jobs.slice(0, 3);

    return {
      openJobs,
      newJobsThisMonth,
      totalCandidates,
      newCandidatesThisWeek,
      applied,
      screening,
      inInterview,
      offers,
      feedbackPending,
      todayInterviews,
      displayInterviews,
      recentActivity,
      upcomingOnboarding,
      topJobs,
    };
  }, [jobs, candidates, interviews, onboarding]);

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const nothingToDo = derived.applied === 0 && derived.feedbackPending === 0 && derived.offers === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{greeting()}, HR team 👋</h1>
          <p className="mt-2 text-base text-muted-foreground">Here's what's happening with your recruitment today.</p>
        </div>
        <div className="rounded-full border bg-muted/50 px-5 py-2 text-sm font-medium text-muted-foreground">
          {today}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-sm text-destructive">
          ⚠ Some data couldn't load: {error}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Briefcase}
          value={derived.openJobs}
          label="Open Jobs"
          subtext={`+${derived.newJobsThisMonth} this month`}
          tone="bg-blue-100 text-blue-600"
          loading={loading}
          onClick={() => navigate('/recruitment/jobs')}
        />
        <StatCard
          icon={Users}
          value={derived.totalCandidates}
          label="Candidates"
          subtext={`+${derived.newCandidatesThisWeek} this week`}
          tone="bg-violet-100 text-violet-600"
          loading={loading}
          onClick={() => navigate('/recruitment/candidates')}
        />
        <StatCard
          icon={Calendar}
          value={derived.todayInterviews.length}
          label="Interviews"
          subtext="Today"
          tone="bg-emerald-100 text-emerald-600"
          loading={loading}
          onClick={() => navigate('/calendar')}
        />
        <StatCard
          icon={ClipboardList}
          value={derived.upcomingOnboarding.length}
          label="Onboarding"
          subtext="Scheduled"
          tone="bg-amber-100 text-amber-600"
          loading={loading}
          onClick={() => navigate('/recruitment/job-boards')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="min-w-0 space-y-6">
          {/* Pipeline */}
          <Section
            title="Recruitment Pipeline"
            action="View pipeline"
            onAction={() => navigate('/recruitment/hiring-processes')}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PipelineTile
                icon={FileText}
                label="Applied"
                value={derived.applied}
                tone="bg-blue-100 text-blue-600"
                onClick={() => navigate('/recruitment/candidates?status=Applied')}
              />
              <PipelineTile
                icon={Search}
                label="Screening"
                value={derived.screening}
                tone="bg-amber-100 text-amber-600"
                onClick={() => navigate('/recruitment/candidates?status=Screening')}
              />
              <PipelineTile
                icon={Users}
                label="Interview"
                value={derived.inInterview}
                tone="bg-violet-100 text-violet-600"
                onClick={() => navigate('/recruitment/candidates?status=Interview HR,Interview User,Interview Manager')}
              />
              <PipelineTile
                icon={Award}
                label="Offer"
                value={derived.offers}
                tone="bg-emerald-100 text-emerald-600"
                onClick={() => navigate('/recruitment/candidates?status=Offering')}
              />
            </div>
          </Section>

          {/* Today's Schedule */}
          <Section
            title={derived.todayInterviews.length > 0 ? "Today's Schedule" : 'Nearest Interview'}
            action="View calendar"
            onAction={() => navigate('/recruitment/calendar')}
          >
            {loading ? (
              <Empty>Loading...</Empty>
            ) : derived.displayInterviews.length === 0 ? (
              <Empty icon={Clock}>No interviews scheduled</Empty>
            ) : (
              <div className="space-y-4">
                {derived.displayInterviews.slice(0, 4).map((iv) => (
                  <button
                    key={iv.id}
                    onClick={() => {
                      if (iv.candidate?.applied_position) {
                        const job = jobs.find((j) => j.job_title === iv.candidate?.applied_position);
                        if (job) {
                          navigate(`/recruitment/jobs/${job.id}?candidateId=${iv.candidate_id}`);
                        } else {
                          navigate('/recruitment/candidates');
                        }
                      } else {
                        navigate('/recruitment/calendar');
                      }
                    }}
                    className="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors hover:bg-muted"
                  >
                    <div className="rounded-xl bg-emerald-100 px-4 py-3 text-center text-emerald-700">
                      <div className="text-base font-bold tabular-nums">{timeLabel(iv.start_time)}</div>
                      {derived.todayInterviews.length === 0 && (
                        <div className="text-xs font-medium">{dateLabel(iv.start_time)}</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold">
                        {iv.candidate ? `${iv.candidate.first_name} ${iv.candidate.last_name}` : 'Candidate'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Interview{iv.candidate?.applied_position && ` · ${iv.candidate.applied_position}`}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Recent Activity */}
          <Section
            title="Recent Activity"
            action="View all activity"
            onAction={() => navigate('/recruitment/candidates')}
          >
            {loading ? (
              <Empty>Loading...</Empty>
            ) : derived.recentActivity.length === 0 ? (
              <Empty>No recent activity</Empty>
            ) : (
              <div className="space-y-4">
                {derived.recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="mt-0.5 rounded-full bg-primary/10 p-2">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{activity.text}</div>
                      <div className="text-sm text-muted-foreground">
                        {activity.time ? dateLabel(activity.time) : 'Recently'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Right Column */}
        <div className="min-w-0 space-y-6">
          {/* Needs Your Action */}
          <Section
            title="Needs Your Action"
            action="View all tasks"
            onAction={() => navigate('/recruitment/candidates')}
          >
            {loading ? (
              <Empty>Loading...</Empty>
            ) : (
              <div className="space-y-3">
                {derived.applied > 0 && (
                  <ActionRow
                    text={`${derived.applied} Need screening`}
                    onClick={() => navigate('/recruitment/candidates?status=Applied')}
                  />
                )}
                {derived.feedbackPending > 0 && (
                  <ActionRow
                    text={`${derived.feedbackPending} Feedback pending`}
                    onClick={() => navigate('/recruitment/hiring-processes')}
                  />
                )}
                {derived.offers > 0 && (
                  <ActionRow
                    text={`${derived.offers} Offer approval`}
                    onClick={() => navigate('/recruitment/candidates?status=Offering')}
                  />
                )}
                {nothingToDo && (
                  <div className="flex flex-col items-center py-10 text-center">
                    <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" />
                    <p className="text-sm text-muted-foreground">You're all caught up!</p>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Job Openings */}
          <Section title="Job Openings" action="View all jobs" onAction={() => navigate('/recruitment/jobs')}>
            {loading ? (
              <Empty>Loading...</Empty>
            ) : derived.topJobs.length === 0 ? (
              <Empty>No open jobs</Empty>
            ) : (
              <div className="space-y-4">
                {derived.topJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/recruitment/jobs/${job.id}`)}
                    className="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors hover:bg-muted"
                  >
                    <div className="rounded-xl bg-blue-100 p-3 text-blue-600">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold">{job.job_title}</div>
                      <div className="text-sm text-muted-foreground">
                        {candidates.filter((c) => c.applied_position === job.job_title).length} applicants
                      </div>
                    </div>
                    <Badge className="shrink-0 px-3 py-1 text-sm">OPEN</Badge>
                  </button>
                ))}
                <button
                  onClick={() => navigate('/recruitment/jobs/new')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  Create Job
                </button>
              </div>
            )}
          </Section>

          {/* Upcoming Onboarding */}
          <Section
            title="Upcoming Onboarding"
            action="View onboarding"
            onAction={() => navigate('/recruitment/job-boards')}
          >
            {loading ? (
              <Empty>Loading...</Empty>
            ) : derived.upcomingOnboarding.length === 0 ? (
              <Empty>No upcoming onboarding</Empty>
            ) : (
              <div className="space-y-4">
                {derived.upcomingOnboarding.map((onb) => (
                  <div key={onb.id} className="flex items-center gap-4 rounded-2xl border p-4">
                    <div className="rounded-xl bg-amber-100 p-3 text-amber-600">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold">
                        {onb.candidates?.first_name} {onb.candidates?.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">{onb.title}</div>
                    </div>
                    <div className="shrink-0 text-sm font-medium text-muted-foreground">
                      Starts {dateLabel(onb.start_time)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;