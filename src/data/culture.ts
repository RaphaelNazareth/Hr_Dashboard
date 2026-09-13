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

export const candidateSteps = [
  { title: "Explore a role", text: "Browse open positions across teams, brands and locations." },
  { title: "Apply", text: "Sign in with your email — no password to remember." },
  { title: "Track your application", text: "See exactly where you are in the process." },
  { title: "Stay updated", text: "Get notified when there is news from the team." },
];
