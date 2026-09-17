import { Header } from '@/components/Header';
import { DraggableCard } from '@/components/DraggableCard';
import { QuickLinks } from '@/components/QuickLinks';
import { RecentActivity } from '@/components/RecentActivity';
import { WelcomeChecklist } from '@/components/WelcomeChecklist';
import { useFocusMode } from '@/contexts/FocusModeContext';
import { storage } from '@/lib/utils';
import { useState, useEffect, useMemo, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

const CANDIDATES_TABLE = 'candidates';

// Columns pulled from public.candidates — only what the dashboard aggregates need.
const CANDIDATES_SELECT = [
  'id',
  'age',
  'city',
  'education',
  'school',
  'skills',
  'applied_position',
  'experience',
  'notice_period',
  'status',
  'is_18_plus',
  'legal_right_to_work',
  'former_current_mattel_employee',
  'applied_at',
  'created_at',
].join(', ');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CandidateRecord {
  id: string;
  age: number | null;
  city: string | null;
  education: string | null;
  school: string | null;
  skills: string | null; // comma-separated in this schema, no native array type
  applied_position: string | null;
  experience: string | number | null;
  notice_period: string | null;
  status: string;
  is_18_plus: boolean;
  legal_right_to_work: boolean;
  former_current_mattel_employee: boolean;
  applied_at: string; // ISO timestamp
  created_at: string;
}

type DateRangePreset = 'this_month' | 'last_month' | 'quarter' | 'custom';

interface DateRange {
  from: Date;
  to: Date;
  preset: DateRangePreset;
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getPresetRange(preset: DateRangePreset, custom?: { from: Date; to: Date }): DateRange {
  const now = new Date();

  if (preset === 'custom' && custom) {
    return { from: custom.from, to: custom.to, preset };
  }

  if (preset === 'last_month') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth), preset };
  }

  if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const from = new Date(now.getFullYear(), quarterStartMonth, 1);
    const to = new Date(now.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999);
    return { from, to, preset };
  }

  return { from: startOfMonth(now), to: endOfMonth(now), preset };
}

function formatDMY(d: Date) {
  return d.toLocaleDateString('en-GB');
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

function toArray(skills: string | null | undefined): string[] {
  if (!skills) return [];
  return skills.split(',').map((s) => s.trim()).filter(Boolean);
}

function bucketAge(age: number): string {
  if (age < 18) return '<18';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  return '55+';
}

function countBy<T>(items: T[], key: (item: T) => string | null | undefined): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item) || 'Unspecified';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// useRecruitmentData hook — fetches from Supabase and computes all aggregates
// ---------------------------------------------------------------------------

function useRecruitmentData(range: DateRange) {
  const [records, setRecords] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fromStr = range.from.toISOString();
    const toStr = range.to.toISOString();

    supabase
      .from(CANDIDATES_TABLE)
      .select(CANDIDATES_SELECT)
      .gte('applied_at', fromStr)
      .lte('applied_at', toStr)
      .order('applied_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message || 'Failed to load recruitment data');
          return;
        }
        setRecords((data as unknown as CandidateRecord[]) || []);
      });

    return () => {
      cancelled = true;
    };
  }, [range.from.getTime(), range.to.getTime()]);

  useEffect(() => {
    if (!error) return;
    setLoading(false);
  }, [error]);

  useEffect(() => {
    setLoading(false);
  }, [records]);

  const aggregates = useMemo(() => {
    const total = records.length;

    const eligibleCount = records.filter((r) => r.is_18_plus).length;
    const rightToWorkCount = records.filter((r) => r.legal_right_to_work).length;
    const formerEmployeeCount = records.filter((r) => r.former_current_mattel_employee).length;

    const statusFunnel = countBy(records, (r) => r.status).map((s) => ({ stage: s.label, count: s.count }));

    const trendMap = new Map<string, number>();
    for (const r of records) {
      if (!r.applied_at) continue;
      const day = r.applied_at.slice(0, 10);
      trendMap.set(day, (trendMap.get(day) || 0) + 1);
    }
    const trend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count }));

    const positionBreakdown = countBy(records, (r) => r.applied_position).map((p) => ({
      position: p.label,
      count: p.count,
    }));

    const ageMap = new Map<string, number>();
    const bucketOrder = ['<18', '18-24', '25-34', '35-44', '45-54', '55+'];
    for (const r of records) {
      if (typeof r.age !== 'number' || Number.isNaN(r.age)) continue;
      const b = bucketAge(r.age);
      ageMap.set(b, (ageMap.get(b) || 0) + 1);
    }
    const ageBuckets = bucketOrder.filter((b) => ageMap.has(b)).map((b) => ({ bucket: b, count: ageMap.get(b)! }));

    const cityBreakdown = countBy(records, (r) => r.city)
      .slice(0, 8)
      .map((c) => ({ city: c.label, count: c.count }));

    const educationBreakdown = countBy(records, (r) => r.education).map((e) => ({
      education: e.label,
      count: e.count,
    }));

    const skillsMap = new Map<string, number>();
    for (const r of records) {
      for (const skill of toArray(r.skills)) {
        skillsMap.set(skill, (skillsMap.get(skill) || 0) + 1);
      }
    }
    const topSkills = Array.from(skillsMap.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const noticePeriodBreakdown = countBy(records, (r) => r.notice_period).map((n) => ({
      period: n.label,
      count: n.count,
    }));

    return {
      total,
      eligiblePct: total ? Math.round((eligibleCount / total) * 100) : 0,
      rightToWorkPct: total ? Math.round((rightToWorkCount / total) * 100) : 0,
      formerEmployeeCount,
      statusFunnel,
      trend,
      positionBreakdown,
      ageBuckets,
      cityBreakdown,
      educationBreakdown,
      topSkills,
      noticePeriodBreakdown,
    };
  }, [records]);

  return { records, loading, error, ...aggregates };
}

// ---------------------------------------------------------------------------
// UI: Date range filter bar
// ---------------------------------------------------------------------------

const PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'quarter', label: 'Quarter' },
];

const DateRangeFilter: FC<{ range: DateRange; onChange: (range: DateRange) => void }> = ({ range, onChange }) => {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 sm:p-3">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(getPresetRange(p.key))}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              range.preset === p.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="date"
          value={range.from.toISOString().slice(0, 10)}
          onChange={(e) => onChange(getPresetRange('custom', { from: new Date(e.target.value), to: range.to }))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <span>→</span>
        <input
          type="date"
          value={range.to.toISOString().slice(0, 10)}
          onChange={(e) => onChange(getPresetRange('custom', { from: range.from, to: new Date(e.target.value) }))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
      </div>

      <span className="hidden text-xs text-muted-foreground sm:inline">
        {formatDMY(range.from)} – {formatDMY(range.to)}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UI: Stat cards
// ---------------------------------------------------------------------------

const StatCard: FC<{ label: string; value: string; hint: string; loading: boolean }> = ({
  label,
  value,
  hint,
  loading,
}) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 text-3xl font-semibold tabular-nums">
      {loading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted" /> : value}
    </p>
    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
  </div>
);

const StatsOverview: FC<{
  total: number;
  eligiblePct: number;
  rightToWorkPct: number;
  formerEmployeeCount: number;
  loading: boolean;
}> = ({ total, eligiblePct, rightToWorkPct, formerEmployeeCount, loading }) => (
  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
    <StatCard label="Total Applicants" value={String(total)} hint="In selected period" loading={loading} />
    <StatCard label="18+ Eligible" value={`${eligiblePct}%`} hint="Of total applicants" loading={loading} />
    <StatCard label="Legal Right to Work" value={`${rightToWorkPct}%`} hint="Of total applicants" loading={loading} />
    <StatCard
      label="Former / Current Employees"
      value={String(formerEmployeeCount)}
      hint="mattel affiliation flagged"
      loading={loading}
    />
  </div>
);

// ---------------------------------------------------------------------------
// UI: Status funnel
// ---------------------------------------------------------------------------

const FUNNEL_COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#4f46e5', '#4338ca', '#3730a3'];

const StatusFunnel: FC<{
  data: { stage: string; count: number }[];
  loading: boolean;
  onSegmentClick?: (stage: string) => void;
}> = ({ data, loading, onSegmentClick }) => (
  <div className="rounded-lg border bg-card p-4">
    <h3 className="text-sm font-medium">Application Status</h3>
    <p className="text-xs text-muted-foreground">Candidates per stage in selected period — click a bar to filter candidates</p>
    <div className="mt-4 h-64">
      {loading ? (
        <div className="h-full w-full animate-pulse rounded bg-muted" />
      ) : data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No status data</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="stage" width={100} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]}
                  cursor="pointer"
                  onClick={() => onSegmentClick?.(entry.stage)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// UI: Applications trend
// ---------------------------------------------------------------------------

const ApplicationsTrend: FC<{ data: { label: string; count: number }[]; loading: boolean }> = ({
  data,
  loading,
}) => (
  <div className="rounded-lg border bg-card p-4">
    <h3 className="text-sm font-medium">Applications Over Time</h3>
    <p className="text-xs text-muted-foreground">Daily submissions in selected period</p>
    <div className="mt-4 h-64">
      {loading ? (
        <div className="h-full w-full animate-pulse rounded bg-muted" />
      ) : data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No applications in this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -16, right: 12 }}>
            <defs>
              <linearGradient id="applicationsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#applicationsFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// UI: Applied position breakdown
// ---------------------------------------------------------------------------

const PositionBreakdown: FC<{
  data: { position: string; count: number }[];
  loading: boolean;
  onSegmentClick?: (position: string) => void;
}> = ({ data, loading, onSegmentClick }) => (
  <div className="rounded-lg border bg-card p-4">
    <h3 className="text-sm font-medium">Applied Positions</h3>
    <p className="text-xs text-muted-foreground">Applicant volume per role — click a bar to filter candidates</p>
    <div className="mt-4 h-64">
      {loading ? (
        <div className="h-full w-full animate-pulse rounded bg-muted" />
      ) : data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No position data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -16, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="position" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar
              dataKey="count"
              fill="#0ea5e9"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(entry: any) => onSegmentClick?.(entry.position)}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// UI: Demographics (age + city)
// ---------------------------------------------------------------------------

const Demographics: FC<{
  ageBuckets: { bucket: string; count: number }[];
  cityBreakdown: { city: string; count: number }[];
  loading: boolean;
  onCityClick?: (city: string) => void;
}> = ({ ageBuckets, cityBreakdown, loading, onCityClick }) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium">Age Distribution</h3>
      <p className="text-xs text-muted-foreground">Applicants by age bracket</p>
      <div className="mt-4 h-56">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded bg-muted" />
        ) : ageBuckets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No age data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ageBuckets} margin={{ left: -16, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>

    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium">Top Cities</h3>
      <p className="text-xs text-muted-foreground">Where applicants are based — click a bar to filter candidates</p>
      <div className="mt-4 h-56">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded bg-muted" />
        ) : cityBreakdown.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No city data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cityBreakdown} layout="vertical" margin={{ left: 12, right: 24 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="city" width={90} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {cityBreakdown.map((entry, i) => (
                  <Cell
                    key={i}
                    fill="#f59e0b"
                    cursor="pointer"
                    onClick={() => onCityClick?.(entry.city)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// UI: Education + skills
// ---------------------------------------------------------------------------

const PIE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const EducationSkills: FC<{
  educationBreakdown: { education: string; count: number }[];
  topSkills: { skill: string; count: number }[];
  loading: boolean;
  onEducationClick?: (education: string) => void;
  onSkillClick?: (skill: string) => void;
}> = ({ educationBreakdown, topSkills, loading, onEducationClick, onSkillClick }) => {
  const maxSkillCount = Math.max(1, ...topSkills.map((s) => s.count));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-medium">Education Level</h3>
        <p className="text-xs text-muted-foreground">Applicant qualifications — click a slice to filter candidates</p>
        <div className="mt-4 h-56">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded bg-muted" />
          ) : educationBreakdown.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No education data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={educationBreakdown}
                  dataKey="count"
                  nameKey="education"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {educationBreakdown.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                      cursor="pointer"
                      onClick={() => onEducationClick?.(entry.education)}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-medium">Top Skills</h3>
        <p className="text-xs text-muted-foreground">Most common skills listed — click a skill to filter candidates</p>
        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="h-56 w-full animate-pulse rounded bg-muted" />
          ) : topSkills.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No skills data</div>
          ) : (
            topSkills.map((s) => (
              <button
                key={s.skill}
                type="button"
                onClick={() => onSkillClick?.(s.skill)}
                className="flex w-full items-center gap-2 rounded-md py-0.5 text-left hover:bg-muted/40"
              >
                <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{s.skill}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${(s.count / maxSkillCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{s.count}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UI: Notice period
// ---------------------------------------------------------------------------

const NoticePeriod: FC<{
  data: { period: string; count: number }[];
  loading: boolean;
  onSegmentClick?: (period: string) => void;
}> = ({ data, loading, onSegmentClick }) => (
  <div className="rounded-lg border bg-card p-4">
    <h3 className="text-sm font-medium">Notice Period</h3>
    <p className="text-xs text-muted-foreground">Availability of applicants — click a bar to filter candidates</p>
    <div className="mt-4 h-56">
      {loading ? (
        <div className="h-full w-full animate-pulse rounded bg-muted" />
      ) : data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No notice period data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -16, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar
              dataKey="count"
              fill="#ef4444"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(entry: any) => onSegmentClick?.(entry.period)}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export const Dashboard: FC = () => {
  const { isFocusMode } = useFocusMode();
  const navigate = useNavigate();
  const [showWelcome, setShowWelcome] = useState(false);

  const defaultSidebarCards = ['quick-links', 'team-calendar'];
  const [sidebarCardOrder, setSidebarCardOrder] = useState<string[]>(defaultSidebarCards);

  const [dateRange, setDateRange] = useState(() => getPresetRange('this_month'));
  const {
    loading,
    total,
    eligiblePct,
    rightToWorkPct,
    formerEmployeeCount,
    statusFunnel,
    trend,
    positionBreakdown,
    ageBuckets,
    cityBreakdown,
    educationBreakdown,
    topSkills,
    noticePeriodBreakdown,
  } = useRecruitmentData(dateRange);

  useEffect(() => {
    const currentAppVersion = '1.0.0';
    storage.checkAppVersion(currentAppVersion);

    setShowWelcome(!storage.isOnboarded());

    const savedSidebarOrder = localStorage.getItem('dashboard-sidebar-card-order');
    if (savedSidebarOrder) {
      try {
        setSidebarCardOrder(JSON.parse(savedSidebarOrder));
      } catch (error) {
        console.error('Error parsing saved sidebar card order:', error);
      }
    }
  }, []);

  const handleWelcomeDismiss = () => {
    setShowWelcome(false);
  };

  const handleSidebarCardReorder = (draggedId: string, targetId: string) => {
    const newOrder = [...sidebarCardOrder];
    const draggedIndex = newOrder.indexOf(draggedId);
    const targetIndex = newOrder.indexOf(targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedId);
      setSidebarCardOrder(newOrder);
      localStorage.setItem('dashboard-sidebar-card-order', JSON.stringify(newOrder));
    }
  };

  const renderSidebarCard = (cardId: string) => {
    switch (cardId) {
      case 'quick-links':
        return <QuickLinks />;
      case 'team-calendar':
        return <RecentActivity />;
      default:
        return null;
    }
  };

  // -------------------------------------------------------------------------
  // Chart → Candidates navigation
  // Clicking a chart segment routes to /candidates with the relevant filter
  // pre-applied via query params, which Candidates.tsx reads on mount.
  // (Unchanged — same param names as before: status, position, city,
  //  education, search, noticePeriod.)
  // -------------------------------------------------------------------------
  const goToCandidates = (filters: Record<string, string>) => {
    const params = new URLSearchParams(filters);
    navigate(`/candidates?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div
          className={`grid gap-4 sm:gap-6 transition-all duration-300 ${
            isFocusMode ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'
          }`}
        >
          {/* Main Content - Left Column: Recruitment Dashboard */}
          <div className={`space-y-4 sm:space-y-6 ${isFocusMode ? 'col-span-1' : 'lg:col-span-8'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-semibold">Recruitment Dashboard</h1>
              <DateRangeFilter range={dateRange} onChange={setDateRange} />
            </div>

            <StatsOverview
              total={total}
              eligiblePct={eligiblePct}
              rightToWorkPct={rightToWorkPct}
              formerEmployeeCount={formerEmployeeCount}
              loading={loading}
            />

            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
              <StatusFunnel
                data={statusFunnel}
                loading={loading}
                onSegmentClick={(stage) => goToCandidates({ status: stage })}
              />
              <ApplicationsTrend data={trend} loading={loading} />
            </div>

            <PositionBreakdown
              data={positionBreakdown}
              loading={loading}
              onSegmentClick={(position) => goToCandidates({ position })}
            />

            <Demographics
              ageBuckets={ageBuckets}
              cityBreakdown={cityBreakdown}
              loading={loading}
              onCityClick={(city) => goToCandidates({ city })}
            />

            <EducationSkills
              educationBreakdown={educationBreakdown}
              topSkills={topSkills}
              loading={loading}
              onEducationClick={(education) => goToCandidates({ education })}
              onSkillClick={(skill) => goToCandidates({ search: skill })}
            />

            <NoticePeriod
              data={noticePeriodBreakdown}
              loading={loading}
              onSegmentClick={(period) => goToCandidates({ noticePeriod: period })}
            />
          </div>

          {/* Sidebar - Right Column - Hidden in focus mode */}
          {!isFocusMode && (
            <div className="lg:col-span-4">
              <div className="sticky top-32 space-y-4 sm:space-y-6">
                {showWelcome && <WelcomeChecklist onDismiss={handleWelcomeDismiss} />}

                {sidebarCardOrder.map((cardId) => {
                  const card = renderSidebarCard(cardId);
                  return card ? (
                    <DraggableCard key={cardId} id={cardId} onReorder={handleSidebarCardReorder}>
                      {card}
                    </DraggableCard>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};