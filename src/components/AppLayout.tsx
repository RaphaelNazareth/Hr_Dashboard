import { type FC, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Briefcase,
  Calendar,
  Users,
  DollarSign,
  ClipboardList,
  BookOpen,
  LifeBuoy,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Profile } from "./Profile";
import { cn } from "@/lib/utils";

const NAV = [
  { path: "/dashboard",    label: "Dashboard",   icon: Home },
  { path: "/recruitment",  label: "Recruitment", icon: Briefcase },
  { path: "/calendar",     label: "Calendar",    icon: Calendar },
  { path: "/people",       label: "People",      icon: Users },
  { path: "/payroll",      label: "Payroll",     icon: DollarSign },
  { path: "/time-off",     label: "Time Off",    icon: ClipboardList },
  { path: "/resources",    label: "Resources",   icon: BookOpen },
  { path: "/help-desk",    label: "Help Desk",   icon: LifeBuoy },
];

/** Paths considered "active" for the Recruitment icon */
const RECRUITMENT_PREFIXES = [
  "/recruitment",
  "/jobs",
  "/candidates",
  "/profiles",
  "/recruitment-pipeline",
];

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/recruitment")
      return RECRUITMENT_PREFIXES.some((p) => location.pathname.startsWith(p));
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* ── Narrow icon sidebar ── */}
      <aside className="flex w-14 flex-col items-center border-r bg-card py-3 shrink-0">
        {/* Logo */}
        <Link
          to="/dashboard"
          className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-primary"
        >
          <img src="/Mattel.svg" alt="Mattel" className="h-5 w-5" />
        </Link>

        {/* Nav icons */}
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {NAV.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              title={label}
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                isActive(path)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100">
                {label}
              </span>
            </Link>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-2 pb-1">
          <ThemeToggle />
          <Profile />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
};
