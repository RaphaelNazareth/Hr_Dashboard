/**
 * What the company stands for: the brand promise (Trust) and the four product
 * attributes it is built on. Short statements, not paragraphs.
 */
export interface CultureTheme {
  theme: string;
  statement: string;
}

export const cultureThemes: CultureTheme[] = [
  { theme: "Trust", statement: "We operate with integrity and live up to our commitments." },
  { theme: "Quality", statement: "Built to deliver on their purpose and outlast the years." },
  { theme: "Safety", statement: "Designed to meet or exceed every standard that applies." },
  { theme: "Value", statement: "Great play, within reach of as many families as possible." },
  { theme: "Purposeful play", statement: "We speak to people authentically — in play." },
];

// src/data/culture.ts (or wherever candidateSteps lives)

export const candidateSteps = [
  {
    title: "Submit Documents",
    text: "Send your application via email to ptmiecop@mattel.com.",
  },
  {
    title: "Complete Application",
    text: "Fill out the online job application form with your details.",
  },
  {
    title: "Test Invitation",
    text: "Shortlisted candidates will be contacted via WhatsApp for test scheduling.",
  },
  {
    title: "Document Screening",
    text: "Your documents will be reviewed and verified on the day of the test.",
  },
  {
    title: "Psychotest & Interview",
    text: "Complete the psychological assessment and interview stage.",
  },
  {
    title: "Offer",
    text: "If successful, you will receive an offer letter.",
  },
];
