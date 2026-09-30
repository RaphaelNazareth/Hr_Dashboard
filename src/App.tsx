import { TooltipProvider } from '@/components/ui/tooltip';
import { type FC } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from './components/ThemeProvider';
import { LanguageProvider } from './contexts/LanguageContext';
import { FocusModeProvider } from './contexts/FocusModeContext';
import { ScrollToTop } from './components/ScrollToTop';
import { AppLayout } from './components/AppLayout';
import { RecruitmentLayout } from './components/RecruitmentLayout';
import { AIAssistantWidget } from './components/FloatingHelpButton';

// Pages
import { Dashboard } from './pages/Dashboard';
import { CompanyAnnouncementsPage } from './pages/CompanyAnnouncementsPage';
import { CalendarPage } from './pages/CalendarPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { HelpDeskPage } from './pages/HelpDeskPage';
import { TimeOffPage } from './pages/TimeOffPage';
import { Candidates } from './pages/Candidates';
import { RecruitmentBoard } from './pages/RecruitmentProcess';
import { ProfilesPage } from './pages/Profiles';
import { JobsPage } from './pages/JobsPage';
import { ApplyPage } from './pages/ApplyPage';
import JobDetailPage from './pages/Jobdetailpage';
import CreateJobPage from './pages/Createjobpage ';
import { LandingPage } from './pages/LandingPage';
import LifeAtCompany from './components/sections/life-at-company';
import { CandidatePortal } from './components/sections/CandidatePortal';

// New recruitment sub-pages
import { HiringProcessesPage } from './pages/HiringProcessesPage';
import { JobBoardsPage } from './pages/JobBoardsPage';
import { TalentPoolPage } from './pages/TalentPoolPage';
import { RecruitmentReportsPage } from './pages/RecruitmentReportsPage';
// New section placeholders
import { PeoplePage } from './pages/PeoplePage';
import { PayrollPage } from './pages/PayrollPage';

// ---------------------------------------------------------------------------
// Internal routes — wrapped in AppLayout (sidebar shell)
// ---------------------------------------------------------------------------
const InternalRoutes: FC = () => (
  <AppLayout>
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/announcements" element={<CompanyAnnouncementsPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/resources" element={<ResourcesPage />} />
      <Route path="/help-desk" element={<HelpDeskPage />} />
      <Route path="/time-off" element={<TimeOffPage />} />

      {/* Recruitment section — sub-tab layout */}
      <Route path="/recruitment" element={<RecruitmentLayout />}>
        {/* Default tab → Jobs */}
        <Route index element={<Navigate to="/recruitment/jobs" replace />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/new" element={<CreateJobPage />} />
        <Route path="jobs/:jobId" element={<JobDetailPage />} />
        <Route path="candidates" element={<Candidates />} />
        <Route path="hiring-processes" element={<HiringProcessesPage />} />
        <Route path="job-boards" element={<JobBoardsPage />} />
        <Route path="talent-pool" element={<TalentPoolPage />} />
        <Route path="reports" element={<RecruitmentReportsPage />} />
      </Route>

      {/* Legacy redirects so old bookmarks/links still work */}
      <Route path="/jobs" element={<Navigate to="/recruitment/jobs" replace />} />
      <Route path="/jobs/new" element={<Navigate to="/recruitment/jobs/new" replace />} />
      <Route path="/jobs/:jobId" element={<JobDetailPage />} />
      <Route path="/candidates" element={<Navigate to="/recruitment/candidates" replace />} />
      <Route path="/recruitment-pipeline" element={<RecruitmentBoard />} />
      <Route path="/profiles" element={<ProfilesPage />} />

      {/* Section placeholders */}
      <Route path="/people" element={<PeoplePage />} />
      <Route path="/payroll" element={<PayrollPage />} />
    </Routes>
  </AppLayout>
);

// ---------------------------------------------------------------------------
// App-level routes (public pages bypass AppLayout)
// ---------------------------------------------------------------------------
const AppRoutes: FC = () => (
  <Routes>
    {/* Public pages — no sidebar */}
    <Route path="/" element={<LandingPage />} />
    <Route path="/apply" element={<ApplyPage />} />
    <Route path="/apply/:jobId" element={<ApplyPage />} />
    <Route path="/candidate-portal" element={<CandidatePortal />} />
    <Route path="/life-at-company" element={<LifeAtCompany />} />

    {/* All internal pages */}
    <Route path="/*" element={<InternalRoutes />} />
  </Routes>
);

/** Floating AI widget — only on internal pages */
const AppChrome: FC = () => {
  const { pathname } = useLocation();
  const isPublic =
    pathname === '/' ||
    pathname === '/candidate-portal' ||
    pathname === '/life-at-company' ||
    pathname.startsWith('/apply');
  if (isPublic) return null;
  return <AIAssistantWidget />;
};

const App: FC = () => (
  <ThemeProvider defaultTheme="system" storageKey="mattel-ui-theme">
    <LanguageProvider>
      <FocusModeProvider>
        <TooltipProvider>
          <BrowserRouter>
            <ScrollToTop />
            <AppRoutes />
            <AppChrome />
            <Toaster />
          </BrowserRouter>
        </TooltipProvider>
      </FocusModeProvider>
    </LanguageProvider>
  </ThemeProvider>
);

export default App;
