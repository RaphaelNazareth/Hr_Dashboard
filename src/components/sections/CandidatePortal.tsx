// src/components/sections/CandidatePortal.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, LogOut, User, Briefcase, Clock, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { supabase } from "@/lib/candidateBoard";
import { cn } from "@/lib/utils";

const RECRUITMENT_STAGES = [
  "Applied", "CV Screening", "Phone Screening", "Psychotest", "FGD",
  "Interview HR", "Interview User", "Interview Manager", "MCU",
  "Offering", "Hired", "Rejected",
] as const;

const STATUS_OPTIONS = ["Dalam Proses", "Lowongan Telah Ditutup"] as const;
const PAGE_SIZE = 10;
const SESSION_KEY = "candidate_email";

interface ApplicationRecord {
  id: string; // == candidates.id == candidate_tracking.candidate_id
  job_title: string | null;
  job_description: string | null;
  job_status: "Open" | "Closed" | null;
  platform: string;
  status: string;
  applied_at: string;
}

interface TrackingEntry {
  id: string;
  stage: string;
  moved_at: string; // "date update"
  created_at: string; // "date applied" (to this stage)
  notes: string | null;
}

interface CandidateProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  mobile_phone_wa: string;
  created_at: string;
}

interface Filters {
  q: string;
  platform: string;
  stage: string;
  status: string;
}

const EMPTY_FILTERS: Filters = { q: "", platform: "", stage: "", status: "" };

type TabType = "applications" | "profile";

export function CandidatePortal() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("applications");
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [tracking, setTracking] = useState<Record<string, TrackingEntry[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Separate toggle from the "progress" one below — clicking this reveals
  // the job title + full job description for that application's card.
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      setEmail(stored);
      loadCandidateData(stored);
    } else {
      setLoading(false);
    }
  }, []);

  const loadCandidateData = async (candidateEmail: string) => {
    setLoading(true);

    // Load every application (row) tied to this email
    const { data: applications, error: appError } = await supabase
      .from("candidates")
      .select("id, status, applied_at, applied_position, job_id, jobs(job_title, job_description, status)")
      .eq("email", candidateEmail)
      .order("applied_at", { ascending: false });

    let applicationIds: string[] = [];

    if (appError) {
      console.error("Failed to load applications", appError);
    }

    if (!appError && applications) {
      applicationIds = applications.map((row: any) => row.id);
      setRecords(
        applications.map((row: any) => ({
          id: row.id,
          // job_id is null on most existing rows, so the jobs(...) join
          // won't resolve for them — fall back to the title snapshot we
          // already store directly on the candidate row at submit time.
          job_title: row.jobs?.job_title ?? row.applied_position ?? null,
          job_description: row.jobs?.job_description ?? null,
          job_status: row.jobs?.status ?? null,
          platform: row.platform ?? "Website",
          status: row.status,
          applied_at: row.applied_at,
        })),
      );
    }

    // Load stage-history for all of this candidate's applications in one go
    if (applicationIds.length > 0) {
      const { data: trackingRows, error: trackingError } = await supabase
        .from("candidate_tracking")
        .select("id, candidate_id, stage, moved_at, created_at, notes")
        .in("candidate_id", applicationIds)
        .order("moved_at", { ascending: true });

      if (trackingError) {
        console.error("Failed to load tracking history", trackingError);
      }

      if (!trackingError && trackingRows) {
        const grouped: Record<string, TrackingEntry[]> = {};
        for (const row of trackingRows as any[]) {
          const entry: TrackingEntry = {
            id: row.id,
            stage: row.stage,
            moved_at: row.moved_at,
            created_at: row.created_at,
            notes: row.notes,
          };
          if (!grouped[row.candidate_id]) grouped[row.candidate_id] = [];
          grouped[row.candidate_id].push(entry);
        }
        setTracking(grouped);
      }
    }

    // Profile: take the most recent application row as the profile source
    const { data: profileRows, error: profileError } = await supabase
      .from("candidates")
      .select("id, first_name, last_name, email, phone_number, mobile_phone_wa, created_at")
      .eq("email", candidateEmail)
      .order("created_at", { ascending: false })
      .limit(1);

    if (profileError) {
      console.error("Failed to load profile", profileError);
    }

    if (profileRows && profileRows.length > 0) {
      setProfile(profileRows[0] as CandidateProfile);
    }

    setLoading(false);
  };

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    const trimmed = loginEmail.trim();

    const { data, error } = await supabase
      .from("candidates")
      .select("email")
      .eq("email", trimmed)
      .limit(1);

    if (error) {
      setLoginError("Terjadi kesalahan, silakan coba lagi.");
      setLoginLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setLoginError("Email tidak ditemukan. Pastikan Anda menggunakan email yang sama saat melamar.");
      setLoginLoading(false);
      return;
    }

    sessionStorage.setItem(SESSION_KEY, trimmed);
    setEmail(trimmed);
    setLoginEmail("");
    setLoginLoading(false);
    await loadCandidateData(trimmed);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setEmail(null);
    setProfile(null);
    setRecords([]);
    setTracking({});
    setExpandedId(null);
    setExpandedDetailId(null);
    navigate("/");
  };

  // All hooks must run on every render regardless of auth state — compute
  // these before the conditional login-screen return below.
  const platforms = useMemo(
    () => Array.from(new Set(records.map((r) => r.platform))),
    [records],
  );

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return records.filter((r) => {
      const derivedStatus: (typeof STATUS_OPTIONS)[number] =
        r.job_status === "Closed" ? "Lowongan Telah Ditutup" : "Dalam Proses";
      return (
        (!q || (r.job_title ?? "").toLowerCase().includes(q)) &&
        (!filters.platform || r.platform === filters.platform) &&
        (!filters.stage || r.status === filters.stage) &&
        (!filters.status || derivedStatus === filters.status)
      );
    });
  }, [records, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setFilter = (k: keyof Filters) => (v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  // Login screen if not authenticated (rendered after all hooks above have run)
  if (!email) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border-2 border-black p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-red-600" />
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold text-black tracking-tight">Candidate Portal</h2>
            <p className="mt-2 text-gray-600">Masukkan email yang Anda gunakan saat melamar</p>
          </div>

          <form onSubmit={handleCheckEmail} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-black">Email address</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border-2 border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600"
                placeholder="your@email.com"
              />
            </div>
            {loginError && (
              <p className="text-sm text-red-600 font-medium">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full flex justify-center py-2.5 px-4 border-2 border-black rounded-md shadow-sm text-sm font-bold text-white bg-red-600 hover:bg-black transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 disabled:opacity-50"
            >
              {loginLoading ? "Mencari..." : "Lihat Lamaran Saya"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b-4 border-red-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Briefcase className="h-8 w-8 text-red-600" />
              <h1 className="text-2xl font-extrabold text-black tracking-tight">Candidate Portal</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700">{email}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-black hover:text-white hover:bg-red-600 border-2 border-black rounded-md transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex gap-8 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("applications")}
              className={cn(
                "pb-4 text-sm font-semibold border-b-4 -mb-px transition-colors",
                activeTab === "applications"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-500 hover:text-black hover:border-gray-300"
              )}
            >
              <Clock className="inline-block h-4 w-4 mr-2" />
              My Applications
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={cn(
                "pb-4 text-sm font-semibold border-b-4 -mb-px transition-colors",
                activeTab === "profile"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-500 hover:text-black hover:border-gray-300"
              )}
            >
              <User className="inline-block h-4 w-4 mr-2" />
              My Profile
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "applications" ? (
          <>
            <h2 className="text-2xl font-bold text-black mb-8">Riwayat Lamaran</h2>

            {/* Search */}
            <div className="mt-8 flex items-center gap-3 border-b-2 border-black py-3">
              <Search className="size-5 shrink-0 text-red-600" />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => setFilter("q")(e.target.value)}
                placeholder="Cari berdasarkan posisi"
                className="w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground/70"
              />
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Select label="Platform" value={filters.platform} onChange={setFilter("platform")} options={platforms} />
              <Select label="Tahap Rekrutmen" value={filters.stage} onChange={setFilter("stage")} options={[...RECRUITMENT_STAGES]} />
              <Select label="Status" value={filters.status} onChange={setFilter("status")} options={[...STATUS_OPTIONS]} />
              {(filters.platform || filters.stage || filters.status || filters.q) && (
                <button
                  onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Reset filter
                </button>
              )}
            </div>

            <p className="mt-4 text-xs text-gray-500">
              {filtered.length} lamaran ditemukan
            </p>

            {/* Cards */}
            <div className="mt-6 space-y-4">
              {loading ? (
                <p className="text-sm text-gray-500">Memuat…</p>
              ) : pageItems.length === 0 ? (
                <p className="py-16 text-center text-sm text-gray-500">
                  Tidak ada lamaran yang cocok dengan filter ini.
                </p>
              ) : (
                pageItems.map((r) => {
                  const derivedStatus =
                    r.job_status === "Closed" ? "Lowongan Telah Ditutup" : "Dalam Proses";
                  const history = tracking[r.id] ?? [];
                  const isExpanded = expandedId === r.id;
                  const isDetailExpanded = expandedDetailId === r.id;
                  return (
                    <div
                      key={r.id}
                      className="rounded-lg border-2 border-black/10 hover:border-red-600 transition-colors p-5 bg-white"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="font-display text-lg font-bold text-black">
                            {r.job_title ?? "Posisi tidak tersedia"}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500">
                            {r.platform} · Diajukan {fmtDate(r.applied_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-bold",
                              derivedStatus === "Dalam Proses"
                                ? "bg-red-600/10 text-red-600"
                                : "bg-black/10 text-black",
                            )}
                          >
                            {derivedStatus}
                          </span>
                          <span className="text-xs font-semibold text-black/70">{r.status}</span>
                          <button
                            onClick={() => setExpandedDetailId(isDetailExpanded ? null : r.id)}
                            className={cn(
                              "flex items-center gap-1 rounded-full border-2 px-3 py-1 text-xs font-bold transition-colors",
                              isDetailExpanded
                                ? "border-red-600 bg-red-600 text-white"
                                : "border-black text-black hover:bg-black hover:text-white",
                            )}
                          >
                            <FileText className="size-3.5" />
                            Lihat Detail Pekerjaan
                            {isDetailExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          </button>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : r.id)}
                            className="flex items-center gap-1 text-sm font-semibold text-black underline decoration-red-600 decoration-2 underline-offset-4"
                          >
                            Lihat progres
                            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Job detail panel — title + full description, revealed on click */}
                      {isDetailExpanded && (
                        <div className="mt-5 rounded-md border-2 border-black/10 bg-red-50/40 p-4">
                          <h4 className="text-sm font-bold text-black">
                            {r.job_title ?? "Posisi tidak tersedia"}
                          </h4>
                          <p className="mt-2 whitespace-pre-line text-sm text-gray-700">
                            {r.job_description?.trim()
                              ? r.job_description
                              : "Deskripsi pekerjaan belum tersedia untuk lowongan ini."}
                          </p>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mt-5 border-t border-black/10 pt-4">
                          {history.length === 0 ? (
                            <p className="text-xs text-gray-500">Belum ada riwayat tahapan.</p>
                          ) : (
                            <ol className="space-y-4">
                              {history.map((h, idx) => (
                                <li key={h.id} className="flex gap-3">
                                  <div className="flex flex-col items-center">
                                    <span
                                      className={cn(
                                        "size-2.5 rounded-full",
                                        idx === history.length - 1 ? "bg-red-600" : "bg-black/20",
                                      )}
                                    />
                                    {idx < history.length - 1 && (
                                      <span className="mt-1 h-full w-px flex-1 bg-black/20" />
                                    )}
                                  </div>
                                  <div className="pb-2">
                                    <p className="text-sm font-semibold text-black">{h.stage}</p>
                                    <p className="text-xs text-gray-500">
                                      Diajukan ke tahap ini: {fmtDate(h.created_at)}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      Terakhir diperbarui: {fmtDate(h.moved_at)}
                                    </p>
                                    {h.notes && (
                                      <p className="mt-1 text-xs text-black/70">{h.notes}</p>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="inline-flex size-9 items-center justify-center rounded-full border-2 border-black text-black hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm text-gray-600">
                  Halaman {page} dari {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex size-9 items-center justify-center rounded-full border-2 border-black text-black hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-black"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          /* Profile Tab */
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-black mb-8">My Profile</h2>
            {loading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : profile ? (
              <div className="bg-white rounded-lg shadow border-2 border-black/10 p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Full Name</label>
                  <p className="mt-1 text-lg font-semibold text-black">{profile.first_name} {profile.last_name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Email</label>
                  <p className="mt-1 text-lg text-black">{profile.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Phone Number</label>
                  <p className="mt-1 text-lg text-black">{profile.phone_number || "Not provided"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">WhatsApp</label>
                  <p className="mt-1 text-lg text-black">{profile.mobile_phone_wa || "Not provided"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Member since</label>
                  <p className="mt-1 text-lg text-black">{fmtDate(profile.created_at)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Profile information not available.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "cursor-pointer appearance-none rounded-full border-2 bg-white py-2 pl-4 pr-8 text-sm font-medium outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600",
          value ? "border-red-600 text-black" : "border-gray-300 text-gray-500",
        )}
      >
        <option value="">{label}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}