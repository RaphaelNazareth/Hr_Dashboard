import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFocusMode } from '@/contexts/FocusModeContext';
import { currentUser } from '@/data/mockData';
import { getTimeBasedGreeting } from '@/lib/utils';
import { 
  Focus, 
  Eye, 
  Home, 
  Briefcase,
  Users, 
  MessageSquare,
  Sparkles,
  ChevronDown,
  Building2,
  Paperclip,
  Calendar,
} from 'lucide-react';
import { type FC } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { Profile } from './Profile';
import { GlobalSearch } from './GlobalSearch';

export const Header: FC = () => {
  const { isFocusMode, toggleFocusMode } = useFocusMode();
  const location = useLocation();
  const greeting = getTimeBasedGreeting();

  // Core navigation items (always visible)
  const coreNavItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/calendar', label: 'Calendar', icon: Calendar },
    { path: '/jobs', label: 'Open Jobs', icon: Briefcase },
    { path: '/candidates', label: 'Candidates', icon: Users },
    { path: '/recruitment-pipeline', label: 'Recruitment Pipeline', icon: Paperclip },
    { path: '/profiles', label: 'Profiles', icon: MessageSquare },
  ];

  // Recruitment Pipeline group
  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          {/* Left side - Logo */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                <img src="/Mattel.svg" alt="Mattel" className="h-6 w-6" />
              </div>
              <span className="font-semibold text-lg">Mattel</span>
            </Link>
            <div className="hidden sm:block">
              <span className="text-lg font-medium text-muted-foreground">
                {greeting}, {currentUser.name}! 👋
              </span>
            </div>
          </div>
          {/* Right side - Controls */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:block">
              <GlobalSearch />
            </div>
            {/* Focus Mode Button - Only visible on Dashboard */}
            {location.pathname === '/' && (
              <Button
                variant={isFocusMode ? "default" : "outline"}
                size="sm"
                onClick={toggleFocusMode}
                className="gap-2 h-10"
              >
                {isFocusMode ? <Eye className="h-4 w-4" /> : <Focus className="h-4 w-4" />}
                <span className="hidden sm:inline">
                  {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
                </span>
              </Button>
            )}
            <ThemeToggle />
            <Profile />
          </div>
        </div>
      </header>

      {/* Navigation Bar */}
      <div className="sticky top-16 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-2">
            <nav className="flex items-center gap-3">
              {/* Core Items - Always visible */}
              {coreNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
    </>
  );
};