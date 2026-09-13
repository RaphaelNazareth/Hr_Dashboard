import { TooltipProvider } from '@/components/ui/tooltip';
import { type FC } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from './components/ThemeProvider';
import { FocusModeProvider } from './contexts/FocusModeContext';
import { ScrollToTop } from './components/ScrollToTop';
import { Dashboard } from './pages/Dashboard';
import { AIAssistantWidget } from './components/FloatingHelpButton';
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
import { LandingPage } from './pages/LandingPage';

const AppRoutes: FC = () => {
  return (
    <Routes>
      {/* Public careers landing page */}
      <Route
        path="/"
        element={<LandingPage />}
      />

      <Route
        path="/dashboard"
        element={<Dashboard />}
      />

      <Route
        path="/announcements"
        element={<CompanyAnnouncementsPage />}
      />

      <Route
        path="/calendar"
        element={<CalendarPage />}
      />

      <Route
        path="/analytics"
        element={<AnalyticsPage />}
      />

      <Route
        path="/resources"
        element={<ResourcesPage />}
      />

      <Route
        path="/help-desk"
        element={<HelpDeskPage />}
      />

      <Route
        path="/time-off"
        element={<TimeOffPage />}
      />

      <Route
        path="/candidates"
        element={<Candidates />}
      />

      <Route
        path="/recruitment-pipeline"
        element={<RecruitmentBoard />}
      />

      <Route
        path="/profiles"
        element={<ProfilesPage />}
      />

      <Route
        path="/jobs"
        element={<JobsPage />}
      />

      {/* Apply Routes */}
      <Route
        path="/apply"
        element={<ApplyPage />}
      />

      <Route
        path="/apply/:jobId"
        element={<ApplyPage />}
      />
    </Routes>
  );
};

/** The AI helper belongs to the internal dashboard, not the public landing page. */
const AppChrome: FC = () => {
  const { pathname } = useLocation();
  if (pathname === '/') return null;
  return <AIAssistantWidget />;
};

const App: FC = () => {
  return (
    <ThemeProvider defaultTheme="system" storageKey="Mattel-ui-theme">
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
    </ThemeProvider>
  );
};

export default App;