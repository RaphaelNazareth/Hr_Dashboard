import type { ReactNode } from "react";
import { SiteNav } from "./SiteNav";
import { SiteFooter } from "./SiteFooter";

export function SiteLayout({
  children,
  transparentNav = false,
}: {
  children: ReactNode;
  transparentNav?: boolean;
}) {
  return (
    <div className="site-scope flex min-h-screen flex-col">
      <SiteNav transparent={transparentNav} />
      <main className={transparentNav ? "flex-1" : "flex-1 pt-16 lg:pt-[4.5rem]"}>{children}</main>
      <SiteFooter />
    </div>
  );
}
