import { Header } from '@/components/Header';
import { PageWrapper } from '@/components/PageWrapper';
import { useState, useEffect, useMemo, type FC } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  fetchCandidates,
  DEFAULT_STAGE_NAMES,
  moveCandidates,
} from '@/lib/candidateBoard';
import type { CandidateRecord, CandidateStatus } from '@/lib/candidateBoard';

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortKey =
  | 'first_name'
  | 'age'
  | 'city'
  | 'applied_position'
  | 'experience'
  | 'notice_period'
  | 'status'
  | 'applied_at';

export type SortDir = 'asc' | 'desc';
export type TriState = 'all' | 'yes' | 'no';

const PER_PAGE = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSkillsArray(skills: string | null | undefined): string[] {
  if (!skills) return [];
  return skills.split(',').map((s) => s.trim()).filter(Boolean);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB');
}

function matchesTriState(value: boolean, filter: TriState) {
  if (filter === 'all') return true;
  return filter === 'yes' ? !!value : !value;
}

// Matches the `status` CHECK constraint on public.candidates.
const STATUS_STYLES: Record<string, string> = {
  Applied: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
  'CV Screening': 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
  'Phone Screening': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400',
  Psychotest: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  FGD: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  'Interview HR': 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
  'Interview User': 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
  'Interview Manager': 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
  MCU: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400',
  Offering: 'bg-teal-100 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400',
  Hired: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status || 'Unspecified'}
    </span>
  );
}

function FlagDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-400'}`}
      title={ok ? 'Yes' : 'No'}
    />
  );
}

// ---------------------------------------------------------------------------
// Candidates page
// ---------------------------------------------------------------------------

export const Candidates: FC = () => {
  const [records, setRecords] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Query params — populated when arriving here via a Dashboard chart click
  // (e.g. /candidates?status=Interview%20HR, /candidates?position=Warehouse%20Ops,
  // /candidates?city=Jakarta). Read once on mount to seed initial filter state.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [educationFilter, setEducationFilter] = useState<string>('all');
  const [ageMin, setAgeMin] = useState<string>('');
  const [ageMax, setAgeMax] = useState<string>('');
  const [mattelFilter, setMattelFilter] = useState<TriState>('all');
  const [noticePeriodFilter, setNoticePeriodFilter] = useState<string>('all');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStageTarget, setBulkStageTarget] = useState<CandidateStatus>(DEFAULT_STAGE_NAMES[0]);
  const [bulkMoving, setBulkMoving] = useState(false);

  const [showFilters, setShowFilters] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('applied_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  // Seed filters from URL query params on first load (chart-click deep links)
  useEffect(() => {
    const statusParam = searchParams.get('status');
    const positionParam = searchParams.get('position');
    const cityParam = searchParams.get('city');
    const educationParam = searchParams.get('education');
    const ageMinParam = searchParams.get('ageMin');
    const ageMaxParam = searchParams.get('ageMax');
    const mattelParam = searchParams.get('mattel') as TriState | null;
    const searchParam = searchParams.get('search');
    const noticePeriodParam = searchParams.get('noticePeriod');

    if (statusParam) setStatusFilter(statusParam);
    if (positionParam) setPositionFilter(positionParam);
    if (cityParam) setCityFilter(cityParam);
    if (educationParam) setEducationFilter(educationParam);
    if (ageMinParam) setAgeMin(ageMinParam);
    if (ageMaxParam) setAgeMax(ageMaxParam);
    if (mattelParam) setMattelFilter(mattelParam);
    if (searchParam) setSearch(searchParam);
    if (noticePeriodParam) setNoticePeriodFilter(noticePeriodParam);

    if (
      statusParam ||
      positionParam ||
      cityParam ||
      educationParam ||
      ageMinParam ||
      ageMaxParam ||
      mattelParam ||
      noticePeriodParam
    ) {
      setShowFilters(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCandidates()
      .then((result) => {
        if (!cancelled) setRecords(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load candidates');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const statusOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.status).filter(Boolean))).sort(),
    [records]
  );
  const positionOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.applied_position).filter(Boolean))).sort() as string[],
    [records]
  );
  const cityOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.city).filter(Boolean))).sort() as string[],
    [records]
  );
  const educationOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.education).filter(Boolean))).sort() as string[],
    [records]
  );
  const noticePeriodOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.notice_period).filter(Boolean))).sort() as string[],
    [records]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minAge = ageMin.trim() ? Number(ageMin) : null;
    const maxAge = ageMax.trim() ? Number(ageMax) : null;

    let rows = records.filter((r) => {
      const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim();

      const matchesSearch =
        !q ||
        fullName.toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.applied_position || '').toLowerCase().includes(q) ||
        toSkillsArray(r.skills).some((s) => s.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesPosition = positionFilter === 'all' || r.applied_position === positionFilter;
      const matchesCity = cityFilter === 'all' || r.city === cityFilter;
      const matchesEducation = educationFilter === 'all' || r.education === educationFilter;
      const matchesNoticePeriod = noticePeriodFilter === 'all' || r.notice_period === noticePeriodFilter;

      const age = r.age ?? null;
      const matchesAgeMin = minAge === null || (age !== null && age >= minAge);
      const matchesAgeMax = maxAge === null || (age !== null && age <= maxAge);

      const matchesMattel = matchesTriState(!!r.former_current_mattel_employee, mattelFilter);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPosition &&
        matchesCity &&
        matchesEducation &&
        matchesNoticePeriod &&
        matchesAgeMin &&
        matchesAgeMax &&
        matchesMattel
      );
    });

    rows = rows.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';

      switch (sortKey) {
        case 'age':
          av = a.age ?? 0;
          bv = b.age ?? 0;
          break;
        case 'applied_at':
          av = a.applied_at ? new Date(a.applied_at).getTime() : 0;
          bv = b.applied_at ? new Date(b.applied_at).getTime() : 0;
          break;
        case 'first_name':
          av = `${a.first_name || ''} ${a.last_name || ''}`.trim();
          bv = `${b.first_name || ''} ${b.last_name || ''}`.trim();
          break;
        default:
          av = (a[sortKey] as string) || '';
          bv = (b[sortKey] as string) || '';
      }

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [
    records,
    search,
    statusFilter,
    positionFilter,
    cityFilter,
    educationFilter,
    noticePeriodFilter,
    ageMin,
    ageMax,
    mattelFilter,
    sortKey,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, statusFilter, positionFilter, cityFilter, educationFilter, noticePeriodFilter, ageMin, ageMax, mattelFilter]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      paged.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filtered.map((r) => r.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkMove() {
    if (selectedIds.size === 0) return;
    setBulkMoving(true);
    setError(null);
    try {
      const toMove = records.filter((r) => selectedIds.has(r.id));
      const { succeeded, failed } = await moveCandidates(toMove, bulkStageTarget);
      if (succeeded.length) {
        const succeededById = new Map(succeeded.map((r) => [r.id, r]));
        setRecords((prev) => prev.map((r) => succeededById.get(r.id) ?? r));
      }
      if (failed.length) {
        setError(`Couldn't move ${failed.length} candidate(s). Please try again.`);
      }
    } finally {
      setSelectedIds(new Set());
      setBulkMoving(false);
    }
  }

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  type FilterKey = 'status' | 'position' | 'city' | 'education' | 'age' | 'mattel' | 'search' | 'noticePeriod';

  // Clearing a filter also strips it from the URL so a page refresh doesn't
  // resurrect a filter the user just removed.
  const clearFilter = (key: FilterKey) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'age') {
      next.delete('ageMin');
      next.delete('ageMax');
    } else {
      next.delete(key);
    }
    setSearchParams(next);

    if (key === 'status') setStatusFilter('all');
    if (key === 'position') setPositionFilter('all');
    if (key === 'city') setCityFilter('all');
    if (key === 'education') setEducationFilter('all');
    if (key === 'age') {
      setAgeMin('');
      setAgeMax('');
    }
    if (key === 'mattel') setMattelFilter('all');
    if (key === 'search') setSearch('');
    if (key === 'noticePeriod') setNoticePeriodFilter('all');
  };

  const clearAllFilters = () => {
    setSearchParams({});
    setSearch('');
    setStatusFilter('all');
    setPositionFilter('all');
    setCityFilter('all');
    setEducationFilter('all');
    setAgeMin('');
    setAgeMax('');
    setMattelFilter('all');
    setNoticePeriodFilter('all');
  };

  const mattelLabel = mattelFilter === 'yes' ? 'Yes' : 'No';
  const ageLabel =
    ageMin && ageMax ? `${ageMin}–${ageMax}` : ageMin ? `${ageMin}+` : ageMax ? `≤${ageMax}` : '';

  const activeFilters = [
    statusFilter !== 'all' ? { key: 'status' as const, label: `Status: ${statusFilter}` } : null,
    positionFilter !== 'all' ? { key: 'position' as const, label: `Position: ${positionFilter}` } : null,
    cityFilter !== 'all' ? { key: 'city' as const, label: `City: ${cityFilter}` } : null,
    educationFilter !== 'all' ? { key: 'education' as const, label: `Education: ${educationFilter}` } : null,
    noticePeriodFilter !== 'all' ? { key: 'noticePeriod' as const, label: `Notice Period: ${noticePeriodFilter}` } : null,
    ageMin || ageMax ? { key: 'age' as const, label: `Age: ${ageLabel}` } : null,
    mattelFilter !== 'all' ? { key: 'mattel' as const, label: `Mattel Employee: ${mattelLabel}` } : null,
  ].filter(Boolean) as { key: FilterKey; label: string }[];

  // Clicking a row opens that candidate's profile on the Profiles page,
  // where ProfilesPage picks up ?candidateId= and auto-selects/searches them.
  const goToProfile = (candidateId: string) => {
    navigate(`/profiles?candidateId=${encodeURIComponent(candidateId)}`);
  };

  const SortHeader: FC<{ label: string; sortKeyName: SortKey; className?: string }> = ({
    label,
    sortKeyName,
    className,
  }) => (
    <th
      onClick={() => handleSort(sortKeyName)}
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground ${className || ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyName && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <PageWrapper className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Candidates</h1>
            <p className="text-muted-foreground">Manage your candidates and their applications.</p>
          </div>
        </div>

        {/* Search + filter toggle — simplified default view */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, city, position, skills…"
            className="min-w-[220px] flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
          />

          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
              showFilters ? 'bg-primary/10 text-primary border-primary/30' : 'bg-card hover:bg-muted/40'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilters.length > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {activeFilters.length}
              </span>
            )}
          </button>

          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} candidate{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {f.label}
                <button
                  onClick={() => clearFilter(f.key)}
                  className="rounded-full hover:bg-primary/20"
                  aria-label={`Clear ${f.label} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>

            <button
              onClick={selectPage}
              className="rounded-md border bg-card px-2.5 py-1 text-xs hover:bg-muted/40"
            >
              Select Page
            </button>
            <button
              onClick={selectAllFiltered}
              className="rounded-md border bg-card px-2.5 py-1 text-xs hover:bg-muted/40"
            >
              Select All Matching Filters ({filtered.length})
            </button>

            <select
              value={bulkStageTarget}
              onChange={(e) => setBulkStageTarget(e.target.value as CandidateStatus)}
              className="ml-auto rounded-md border bg-background px-2.5 py-1.5 text-sm"
            >
              {DEFAULT_STAGE_NAMES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <button
              onClick={handleBulkMove}
              disabled={bulkMoving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {bulkMoving ? 'Moving…' : 'Move'}
            </button>

            <button
              onClick={clearSelection}
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted/40"
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* Filter panel — collapsed by default to keep the UI clean */}
        {showFilters && (
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="all">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Applied Position</label>
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="all">All positions</option>
                {positionOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="all">All cities</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Education</label>
              <select
                value={educationFilter}
                onChange={(e) => setEducationFilter(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="all">All education levels</option>
                {educationOptions.map((ed) => (
                  <option key={ed} value={ed}>{ed}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notice Period</label>
              <select
                value={noticePeriodFilter}
                onChange={(e) => setNoticePeriodFilter(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="all">All notice periods</option>
                {noticePeriodOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Age range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  placeholder="Min"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="number"
                  min={0}
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  placeholder="Max"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Mattel Employee</label>
              <select
                value={mattelFilter}
                onChange={(e) => setMattelFilter(e.target.value as TriState)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <span className="sr-only">Select</span>
                  </th>
                  <SortHeader label="Name" sortKeyName="first_name" />
                  <SortHeader label="Age" sortKeyName="age" />
                  <SortHeader label="City" sortKeyName="city" />
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Education
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    School
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Skills
                  </th>
                  <SortHeader label="Applied Position" sortKeyName="applied_position" />
                  <SortHeader label="Experience" sortKeyName="experience" />
                  <SortHeader label="Notice Period" sortKeyName="notice_period" />
                  <SortHeader label="Status" sortKeyName="status" />
                  <th className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    18+
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    Right to Work
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                    Ex/Current Mattel
                  </th>
                  <SortHeader label="Applied On" sortKeyName="applied_at" />
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td colSpan={15} className="px-3 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={15} className="px-3 py-8 text-center text-sm text-rose-500">
                      {error}
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No candidates match your filters.
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => goToProfile(r.id)}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelected(r.id)}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{`${r.first_name || ''} ${r.last_name || ''}`.trim() || r.id}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.age ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.city || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.education || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.school || '—'}</td>
                      <td className="max-w-[220px] px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {toSkillsArray(r.skills)
                            .slice(0, 3)
                            .map((s) => (
                              <span
                                key={s}
                                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                              >
                                {s}
                              </span>
                            ))}
                          {toSkillsArray(r.skills).length > 3 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              +{toSkillsArray(r.skills).length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{r.applied_position || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.experience ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.notice_period || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <FlagDot ok={!!r.is_18_plus} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <FlagDot ok={!!r.legal_right_to_work} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <FlagDot ok={!!r.former_current_mattel_employee} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(r.applied_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </PageWrapper>
    </div>
  );
};