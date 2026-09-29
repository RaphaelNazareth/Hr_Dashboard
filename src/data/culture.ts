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

import Complete_applications from "@/assets/Complete_applications.png";
import Submit_Documents from "@/assets/Submit_Documents.png";
import Test_invitations from "@/assets/Test_invitations.png";
import Document_Screening from "@/assets/Document_Screening.png";
import Interview from "@/assets/Interview.png";
import Offer from "@/assets/Offer.png";

// src/data/culture.ts (or wherever candidateSteps lives)

export interface CandidateStep {
  title: string;
  text: string;
  image: string;
}

export const candidateSteps: CandidateStep[] = [
  {
    title: "Complete Application",
    text: "Fill out the online job application form with your details.",
    image: Complete_applications,
  },
  {
    title: "Submit Documents",
    text: "Send your application via email to ptmiecop@mattel.com.",
    image: Submit_Documents,
  },
  {
    title: "Test Invitation",
    text: "Shortlisted candidates will be contacted via WhatsApp for test scheduling.",
    image: Test_invitations,
  },
  {
    title: "Document Screening",
    text: "Your documents will be reviewed and verified on the day of the test.",
    image: Document_Screening,
  },
  {
    title: "Psychotest & Interview",
    text: "Complete the psychological assessment and interview stage.",
    image: Interview,
  },
  {
    title: "Offer",
    text: "If successful, you will receive an offer letter.",
    image: Offer,
  },
];