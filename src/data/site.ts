/**
 * Site-level content and branding.
 * PLACEHOLDER: replace `brand.wordmark` and `brand.legalName` with approved
 * corporate branding once available. Swap the text wordmark for an SVG in
 * `src/components/site/Wordmark.tsx`.
 */
export const brand = {
  wordmark: "PLAYCO",
  suffix: "Careers",
  legalName: "Playco Global Toys & Entertainment",
  tagline: "Empowering the next generation through play.",
} as const;export const navLinks = [
  { label: "About us", to: "/#life" },
  { label: "Life at the Company", to: "/life-at-company" },
  { label: "People", to: "/#people" },
  { label: "Jobs", to: "/#jobs" },
] as const;

export const footerLinks = {
  explore: [
    { label: "Careers", to: "/" },
    { label: "Jobs", to: "/#jobs" },
    { label: "About us", to: "/#life" },
    { label: "People", to: "/#people" },
    { label: "Life at the Company", to: "/life-at-company" },
  ],

  portals: [
    { label: "Candidate Portal", to: "/apply" },
    { label: "HR Dashboard", to: "/dashboard" },
  ],

  legal: [
    { label: "Privacy", to: "/" },
    { label: "Terms", to: "/" },
  ],
} as const;