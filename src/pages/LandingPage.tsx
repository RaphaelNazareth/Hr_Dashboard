import { type FC, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Hero } from "@/components/sections/Hero";
import { Story } from "@/components/sections/Story";
import { Journey } from "@/components/sections/Journey";
import { People } from "@/components/sections/People";
import { DayInTheLife } from "@/components/sections/DayInTheLife";
import { Culture } from "@/components/sections/Culture";
import { OpenJobs } from "@/components/sections/OpenJobs";
import { CandidateExperience } from "@/components/sections/CandidateExperience";
import { HrTeaser } from "@/components/sections/HrTeaser";
import { FinalCta } from "@/components/sections/FinalCta";

/**
 * Public careers landing page — the site's front door. The HR dashboard lives
 * behind the "Sign In" call-to-action at /dashboard.
 */
export const LandingPage: FC = () => {
  const { hash } = useLocation();

  // ScrollToTop resets the scroll position on every navigation, so honour an
  // in-page hash (/#jobs, /#people, …) once the sections have rendered.
  useEffect(() => {
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, [hash]);

  return (
    <SiteLayout transparentNav>
      <Hero />
      <Story />
      <Journey />
      <People />
      <DayInTheLife />
      <Culture />
      <OpenJobs />
      <CandidateExperience />
      <HrTeaser />
      <FinalCta />
    </SiteLayout>
  );
};
