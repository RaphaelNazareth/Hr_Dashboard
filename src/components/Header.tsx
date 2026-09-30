/**
 * Header — thin top bar used inside AppLayout pages.
 * Only renders the global search + any right-side controls.
 * Navigation is handled by AppLayout's sidebar.
 */
import { type FC } from "react";
import { GlobalSearch } from "./GlobalSearch";

export const Header: FC = () => {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-6">
      <div className="flex-1" />
      <GlobalSearch />
    </header>
  );
};
