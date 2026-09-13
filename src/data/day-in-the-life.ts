/** "A day in the life" timelines per career area. PLACEHOLDER content. */
export interface TimelineEntry {
  time: string;
  title: string;
  detail: string;
}

export interface CareerArea {
  id: string;
  label: string;
  intro: string;
  timeline: TimelineEntry[];
}

export const careerAreas: CareerArea[] = [
  {
    id: "engineering",
    label: "Engineering",
    intro: "Prototypes on the bench by mid-morning, decisions by lunch.",
    timeline: [
      { time: "08:30", title: "Team stand-up", detail: "Quick sync on the week's builds and blockers." },
      { time: "09:15", title: "Design review", detail: "Walk through the latest CAD with designers." },
      { time: "11:00", title: "Prototype testing", detail: "Drop, torque and play tests in the lab." },
      { time: "13:00", title: "Lunch", detail: "Usually with people from other teams." },
      { time: "14:00", title: "Project collaboration", detail: "Tooling feasibility with manufacturing." },
      { time: "16:30", title: "Documentation & wrap-up", detail: "Update specs and plan tomorrow's tests." },
    ],
  },
  {
    id: "design",
    label: "Design",
    intro: "Sketchbooks, clay, and children who tell you the truth.",
    timeline: [
      { time: "09:00", title: "Studio check-in", detail: "Share overnight sketches and references." },
      { time: "09:45", title: "Concept sketching", detail: "Explore a new character range." },
      { time: "11:30", title: "Play-test session", detail: "Watch kids react to yesterday's prototypes." },
      { time: "13:00", title: "Lunch", detail: "" },
      { time: "14:00", title: "3D modelling", detail: "Refine forms and proportions with engineering input." },
      { time: "16:00", title: "Colour & materials", detail: "Review finishes with the CMF team." },
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    intro: "Where millions of parts a week come together.",
    timeline: [
      { time: "06:30", title: "Shift handover", detail: "Line status, safety and quality notes." },
      { time: "07:00", title: "Floor walk", detail: "Moulding, decoration and assembly checks." },
      { time: "09:30", title: "Improvement huddle", detail: "Operators propose fixes; we try them." },
      { time: "12:00", title: "Lunch", detail: "" },
      { time: "13:00", title: "New product introduction", detail: "Trial run with product engineers." },
      { time: "15:00", title: "Data review", detail: "Yield, waste, energy and tomorrow's plan." },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    intro: "From launch plan to the moment a family sees it on a shelf.",
    timeline: [
      { time: "08:45", title: "Campaign stand-up", detail: "Status across regions and channels." },
      { time: "09:30", title: "Creative review", detail: "Feedback on launch film and packaging." },
      { time: "11:00", title: "Retail partner call", detail: "Align on in-store activation." },
      { time: "13:00", title: "Lunch", detail: "" },
      { time: "14:00", title: "Consumer insights", detail: "Read-out from the latest family panel." },
      { time: "16:00", title: "Planning", detail: "Adjust the calendar and brief the agency." },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    intro: "Making sure great ideas also make sense.",
    timeline: [
      { time: "08:30", title: "Numbers check", detail: "Overnight sales and forecast movements." },
      { time: "09:30", title: "Business case", detail: "Model a new product line with the portfolio team." },
      { time: "11:00", title: "Leadership sync", detail: "Present scenarios for next season." },
      { time: "13:00", title: "Lunch", detail: "" },
      { time: "14:00", title: "Deep work", detail: "Variance analysis and forecasting." },
      { time: "16:30", title: "Partnering", detail: "Coffee with marketing to plan Q4 spend." },
    ],
  },
];
