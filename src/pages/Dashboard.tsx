import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Briefcase, Calendar, CheckCircle2, ClipboardList, Users, AlertCircle, Clock, FileText, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isInterviewStage } from '@/lib/candidateBoard';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
  icon: FC<{ className?: string }>;
  value: number;
  label: string;
  subtext?: string;
  loading: boolean;
  onClick: () => void;
}> = ({ icon: Icon, value, label, subtext, loading, onClick }) => (
  <Card className="cursor-pointer transition-all hover:shadow-md" onClick={onClick}>
    <CardContent className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-3xl font-bold tabular-nums">
            {loading ? '—' : value}
          </p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{label}</p>
          {subtext && <p className="mt-0.5 text-xs text-muted-foreground">{subtext}</p>}
        </div>
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </CardContent>
  </Card>
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
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const byId = new Map(candidates.map((c) => [c.id, c]));

    const openJobs = jobs.length;
    const newJobsThisMonth = jobs.filter(j => j.id).length; // Simplified for demo
    
    const totalCandidates = candidates.length;
    const newCandidatesThisWeek = candidates.filter(c => 
      c.created_at && new Date(c.created_at) >= startOfWeek
    ).length;

    const awaitingScreening = candidates.filter((c) => c.status === 'Applied').length;
    const inInterview = candidates.filter((c) => c.status.toLowerCase().includes('interview')).length;
    const offers = candidates.filter((c) => c.status === 'Offering').length;

    const needScheduling = candidates.filter(
      (c) =>
        isInterviewStage(c.status) &&
        !interviews.some((iv) => iv.candidate_id === c.id && iv.stage === c.status)
    ).length;

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
    const nearestInterview = todayInterviews.length === 0
      ? interviews
          .filter((iv) => new Date(iv.start_time) >= now)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
          .slice(0, 1)
          .map((iv) => ({ ...iv, candidate: iv.candidate_id ? byId.get(iv.candidate_id) : undefined }))
      : [];

    const displayInterviews = todayInterviews.length > 0 ? todayInterviews : nearestInterview;

    const recentActivity = candidates
      .filter(c => c.created_at)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 3)
      .map(c => ({
        text: `${c.first_name} ${c.last_name} applied for ${c.applied_position || 'a position'}`,
        time: c.created_at || '',
      }));

    const upcomingOnboarding = onboarding
      .filter(o => new Date(o.start_time) >= now)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .slice(0, 2);

    const topJobs = jobs.slice(0, 3);

    return {
      openJobs,
      newJobsThisMonth,
      totalCandidates,
      newCandidatesThisWeek,
      awaitingScreening,
      inInterview,
      offers,
      needScheduling,
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
    day: 'numeric' 
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{greeting()}, HR team 👋</h1>
          <p className="text-sm text-muted-foreground">Here's what's happening with your recruitment today.</p>
        </div>
        <div className="text-sm text-muted-foreground">{today}</div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          ⚠ Some data couldn't load: {error}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Briefcase}
          value={derived.openJobs}
          label="Open Jobs"
          subtext={`+${derived.newJobsThisMonth} this month`}
          loading={loading}
          onClick={() => navigate('/recruitment/jobs')}
        />
        <StatCard
          icon={Users}
          value={derived.totalCandidates}
          label="Candidates"
          subtext={`+${derived.newCandidatesThisWeek} this week`}
          loading={loading}
          onClick={() => navigate('/recruitment/candidates')}
        />
        <StatCard
          icon={Calendar}
          value={derived.todayInterviews.length}
          label="Interviews"
          subtext="Today"
          loading={loading}
          onClick={() => navigate('/calendar')}
        />
        <StatCard
          icon={ClipboardList}
          value={derived.upcomingOnboarding.length}
          label="Onboarding"
          subtext="Scheduled"
          loading={loading}
          onClick={() => navigate('/recruitment/job-boards')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Pipeline */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recruitment Pipeline</CardTitle>
                <button
                  onClick={() => navigate('/recruitment/hiring-processes')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View pipeline →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => navigate('/recruitment/candidates?status=Applied')}
                  className="rounded-lg border bg-muted/50 p-4 text-left transition-colors hover:bg-muted"
                >
                  <div className="text-2xl font-bold">{derived.awaitingScreening}</div>
                  <div className="text-sm text-muted-foreground">Applied</div>
                </button>
                <button
                  onClick={() => navigate('/recruitment/candidates')}
                  className="rounded-lg border bg-muted/50 p-4 text-left transition-colors hover:bg-muted"
                >
                  <div className="text-2xl font-bold">{derived.awaitingScreening}</div>
                  <div className="text-sm text-muted-foreground">Screening</div>
                </button>
                <button
                  onClick={() => navigate('/recruitment/candidates?status=Interview HR,Interview User,Interview Manager')}
                  className="rounded-lg border bg-muted/50 p-4 text-left transition-colors hover:bg-muted"
                >
                  <div className="text-2xl font-bold">{derived.inInterview}</div>
                  <div className="text-sm text-muted-foreground">Interview</div>
                </button>
                <button
                  onClick={() => navigate('/recruitment/candidates?status=Offering')}
                  className="rounded-lg border bg-muted/50 p-4 text-left transition-colors hover:bg-muted"
                >
                  <div className="text-2xl font-bold">{derived.offers}</div>
                  <div className="text-sm text-muted-foreground">Offer</div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Today's Schedule */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {derived.todayInterviews.length > 0 ? "Today's Schedule" : "Nearest Interview"}
                </CardTitle>
                <button
                  onClick={() => navigate('/recruitment/calendar')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View calendar →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : derived.displayInterviews.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center text-sm text-muted-foreground">
                  <Clock className="mb-2 h-8 w-8 opacity-50" />
                  No interviews scheduled
                </div>
              ) : (
                <div className="space-y-3">
                  {derived.displayInterviews.slice(0, 4).map((iv) => (
                    <button
                      key={iv.id}
                      onClick={() => {
                        if (iv.candidate?.applied_position) {
                          // Navigate to the job detail page for the position they applied to
                          const job = jobs.find(j => j.job_title === iv.candidate?.applied_position);
                          if (job) {
                            navigate(`/recruitment/jobs/${job.id}?candidateId=${iv.candidate_id}`);
                          } else {
                            navigate('/recruitment/candidates');
                          }
                        } else {
                          navigate('/recruitment/calendar');
                        }
                      }}
                      className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 shrink-0 text-sm font-semibold">
                          {timeLabel(iv.start_time)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">Interview</div>
                          <div className="text-sm text-muted-foreground">
                            {iv.candidate ? `${iv.candidate.first_name} ${iv.candidate.last_name}` : 'Candidate'}
                            {iv.candidate?.applied_position && ` · ${iv.candidate.applied_position}`}
                          </div>
                          {derived.todayInterviews.length === 0 && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {dateLabel(iv.start_time)}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Activity</CardTitle>
                <button
                  onClick={() => navigate('/recruitment/candidates')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View all activity →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : derived.recentActivity.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No recent activity</div>
              ) : (
                <div className="space-y-3">
                  {derived.recentActivity.map((activity, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div className="flex-1">
                        <div className="text-sm">{activity.text}</div>
                        <div className="text-xs text-muted-foreground">Recently</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Needs Your Action */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Needs Your Action</CardTitle>
                <button
                  onClick={() => navigate('/recruitment/candidates')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View all tasks →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : (
                <div className="space-y-2">
                  {derived.awaitingScreening > 0 && (
                    <button
                      onClick={() => navigate('/recruitment/candidates?status=Applied')}
                      className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100"
                    >
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium">
                        {derived.awaitingScreening} Need screening
                      </span>
                    </button>
                  )}
                  {derived.feedbackPending > 0 && (
                    <button
                      onClick={() => navigate('/recruitment/hiring-processes')}
                      className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100"
                    >
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium">
                        {derived.feedbackPending} Feedback pending
                      </span>
                    </button>
                  )}
                  {derived.offers > 0 && (
                    <button
                      onClick={() => navigate('/recruitment/candidates?status=Offering')}
                      className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100"
                    >
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium">
                        {derived.offers} Offer approval
                      </span>
                    </button>
                  )}
                  {derived.awaitingScreening === 0 && derived.feedbackPending === 0 && derived.offers === 0 && (
                    <div className="flex flex-col items-center py-8 text-center">
                      <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                      <p className="text-sm text-muted-foreground">You're all caught up!</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Job Openings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Job Openings</CardTitle>
                <button
                  onClick={() => navigate('/recruitment/jobs')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View all jobs →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : derived.topJobs.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No open jobs</div>
              ) : (
                <div className="space-y-3">
                  {derived.topJobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => navigate(`/recruitment/jobs/${job.id}`)}
                      className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{job.job_title}</div>
                          <div className="text-xs text-muted-foreground">
                            {candidates.filter(c => c.applied_position === job.job_title).length} applicants
                          </div>
                        </div>
                        <Badge className="ml-2 shrink-0">OPEN</Badge>
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => navigate('/recruitment/jobs/new')}
                    className="w-full rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground transition-colors hover:bg-muted"
                  >
                    + Create Job
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Onboarding */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Upcoming Onboarding</CardTitle>
                <button
                  onClick={() => navigate('/recruitment/job-boards')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View onboarding →
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : derived.upcomingOnboarding.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No upcoming onboarding</div>
              ) : (
                <div className="space-y-3">
                  {derived.upcomingOnboarding.map((onb) => (
                    <div key={onb.id} className="rounded-lg border p-3">
                      <div className="text-sm font-medium">
                        {onb.candidates?.first_name} {onb.candidates?.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">{onb.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Starts {dateLabel(onb.start_time)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;