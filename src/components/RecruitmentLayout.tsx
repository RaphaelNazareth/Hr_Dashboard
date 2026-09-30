import { type FC } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Jobs",              path: "/recruitment/jobs" },
  { label: "Candidates",       path: "/recruitment/candidates" },
  { label: "Hiring Processes", path: "/recruitment/hiring-processes" },
  { label: "Onboarding",       path: "/recruitment/job-boards" },
  { label: "Talent Pool",      path: "/recruitment/talent-pool" },
  { label: "Reports",          path: "/recruitment/reports" },
];

export const RecruitmentLayout: FC = () => {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page heading + tab bar */}
      <div className="shrink-0 border-b bg-background px-6 pt-6">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Recruitment</h1>

        <nav className="flex gap-0 overflow-x-auto">
          {TABS.map(({ label, path }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  "shrink-0 border-b-2 px-4 pb-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Routed content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
};
