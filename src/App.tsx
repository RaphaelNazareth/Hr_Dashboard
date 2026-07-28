import { TooltipProvider } from '@/components/ui/tooltip';
import { type FC } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from './components/ThemeProvider';
import { FocusModeProvider } from './contexts/FocusModeContext';
import { ScrollToTop } from './components/ScrollToTop';
import { FloatingHelpButton } from './components/FloatingHelpButton';
import { Dashboard } from './pages/Dashboard';
import { ForYouPage } from './pages/ForYouPage';
import { CompanyAnnouncementsPage } from './pages/CompanyAnnouncementsPage';
import { KudosFeedPage } from './pages/KudosFeedPage';
import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage';
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
// import { FormsPage } from './pages/FormsPage';

const AppRoutes: FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={<Dashboard />}
      />

      <Route
        path="/for-you"
        element={<ForYouPage />}
      />

      <Route
        path="/announcements"
        element={<CompanyAnnouncementsPage />}
      />

      <Route
        path="/kudos"
        element={<KudosFeedPage />}
      />

      <Route
        path="/employees"
        element={<EmployeeDirectoryPage />}
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

const App: FC = () => {
  return (
    <ThemeProvider defaultTheme="system" storageKey="Mattel-ui-theme">
      <FocusModeProvider>
        <TooltipProvider>
          <BrowserRouter>
            <ScrollToTop />
            <AppRoutes />
            <FloatingHelpButton />
            <Toaster />
          </BrowserRouter>
        </TooltipProvider>
      </FocusModeProvider>
    </ThemeProvider>
  );
};

export default App;