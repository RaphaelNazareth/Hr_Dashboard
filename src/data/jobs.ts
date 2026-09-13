/**
 * Job listings.
 * PLACEHOLDER DATA: this module is the single source for open positions.
 * Replace `jobs` with a backend fetch (same `Job` shape) when connected.
 */
export type Department =
  | "Engineering"
  | "Design"
  | "Operations"
  | "Marketing"
  | "Finance"
  | "Manufacturing";

export type EmploymentType = "Full-time" | "Part-time" | "Contract" | "Internship";

export interface Job {
  id: string;
  title: string;
  department: Department;
  location: string;
  type: EmploymentType;
  team: string;
  postedAt: string; // ISO date
  summary: string;
  responsibilities: string[];
  requirements: string[];
}

export const departments: Department[] = [
  "Engineering",
  "Design",
  "Operations",
  "Marketing",
  "Finance",
  "Manufacturing",
];

export const employmentTypes: EmploymentType[] = ["Full-time", "Part-time", "Contract", "Internship"];

export const jobs: Job[] = [
  {
    id: "product-engineer",
    title: "Product Engineer",
    department: "Engineering",
    location: "Billund, Denmark",
    type: "Full-time",
    team: "Product Development",
    postedAt: "2026-08-28",
    summary:
      "Turn concepts into safe, durable, delightful products. You will own mechanical design from early prototype through tooling release.",
    responsibilities: [
      "Lead mechanical design of new product platforms from sketch to production",
      "Build and test prototypes with the model shop and quality lab",
      "Partner with manufacturing engineers on tooling and assembly feasibility",
      "Document designs and specifications for global production sites",
    ],
    requirements: [
      "Degree in Mechanical Engineering or equivalent experience",
      "4+ years designing injection-moulded consumer products",
      "Fluency in CAD (Creo, NX or SolidWorks) and tolerance analysis",
      "Curiosity about how children play",
    ],
  },
  {
    id: "senior-product-designer",
    title: "Senior Product Designer",
    department: "Design",
    location: "Los Angeles, USA",
    type: "Full-time",
    team: "Preschool Play",
    postedAt: "2026-08-30",
    summary:
      "Shape the next generation of preschool play experiences — from first sketch to the moment a child opens the box.",
    responsibilities: [
      "Lead concept development for new preschool product lines",
      "Sketch, model and prototype ideas quickly with the design studio",
      "Run play-testing sessions and translate insights into design decisions",
      "Mentor designers and champion craft across the team",
    ],
    requirements: [
      "6+ years in industrial or toy design",
      "A portfolio that shows both imagination and production reality",
      "Strong sketching and 3D modelling skills",
      "Experience collaborating with engineering and marketing",
    ],
  },
  {
    id: "supply-chain-analyst",
    title: "Supply Chain Analyst",
    department: "Operations",
    location: "Singapore",
    type: "Full-time",
    team: "Global Supply Planning",
    postedAt: "2026-09-01",
    summary:
      "Keep products moving from factory floors to store shelves across 130 countries with data, planning, and calm under pressure.",
    responsibilities: [
      "Model demand and supply scenarios across regional distribution centres",
      "Analyse inventory health and recommend rebalancing actions",
      "Build dashboards that make planning decisions transparent",
      "Support peak-season readiness with cross-functional teams",
    ],
    requirements: [
      "2+ years in supply chain, planning or analytics",
      "Advanced Excel and SQL; experience with SAP IBP is a plus",
      "Clear communicator who enjoys working with operations teams",
    ],
  },
  {
    id: "marketing-specialist",
    title: "Marketing Specialist",
    department: "Marketing",
    location: "London, UK",
    type: "Full-time",
    team: "Brand & Campaigns",
    postedAt: "2026-09-03",
    summary:
      "Bring product launches to life across retail and digital channels, working with creative, sales and product teams.",
    responsibilities: [
      "Plan and execute integrated launch campaigns for key product lines",
      "Coordinate with agencies and in-house creative on assets",
      "Track campaign performance and share learnings",
      "Support retail partners with launch materials",
    ],
    requirements: [
      "3+ years in brand or product marketing",
      "Experience with consumer goods or entertainment brands",
      "Comfortable with data and storytelling in equal measure",
    ],
  },
  {
    id: "manufacturing-engineer",
    title: "Manufacturing Engineer",
    department: "Manufacturing",
    location: "Monterrey, Mexico",
    type: "Full-time",
    team: "Moulding & Assembly",
    postedAt: "2026-08-20",
    summary:
      "Improve how millions of parts are moulded, decorated and assembled every week — safely, sustainably and beautifully.",
    responsibilities: [
      "Own process capability for moulding and assembly lines",
      "Lead continuous improvement projects with line operators",
      "Introduce new products into production with engineering and quality",
      "Reduce waste and energy use across the plant",
    ],
    requirements: [
      "Degree in Manufacturing, Industrial or Mechanical Engineering",
      "Experience with injection moulding and automation",
      "Lean / Six Sigma background preferred",
    ],
  },
  {
    id: "financial-analyst",
    title: "Financial Analyst",
    department: "Finance",
    location: "Billund, Denmark",
    type: "Full-time",
    team: "Commercial Finance",
    postedAt: "2026-08-25",
    summary:
      "Partner with product and marketing leaders to make investment decisions that balance creativity and commercial sense.",
    responsibilities: [
      "Build business cases for new product lines and campaigns",
      "Own monthly forecasting and variance analysis for your portfolio",
      "Present insights to senior stakeholders",
    ],
    requirements: [
      "2+ years in FP&A, consulting or commercial finance",
      "Strong modelling skills and business curiosity",
      "Comfortable challenging assumptions constructively",
    ],
  },
  {
    id: "ux-designer-digital-play",
    title: "UX Designer, Digital Play",
    department: "Design",
    location: "Copenhagen, Denmark",
    type: "Full-time",
    team: "Digital Experiences",
    postedAt: "2026-09-04",
    summary:
      "Design app and console experiences that extend physical play — for kids first, and for the grown-ups who join them.",
    responsibilities: [
      "Design interaction flows for connected toys and companion apps",
      "Prototype and test with children and families",
      "Collaborate with game designers and engineers",
    ],
    requirements: [
      "4+ years in UX or product design",
      "Experience designing for children is a strong plus",
      "Portfolio demonstrating research-led design",
    ],
  },
  {
    id: "quality-engineering-intern",
    title: "Quality Engineering Intern",
    department: "Engineering",
    location: "Billund, Denmark",
    type: "Internship",
    team: "Product Safety & Quality",
    postedAt: "2026-09-05",
    summary:
      "Spend six months in the lab that makes sure every product is safe enough for a two-year-old — and durable enough for a ten-year-old.",
    responsibilities: [
      "Support drop, torque and material testing programmes",
      "Analyse test data and help improve procedures",
      "Shadow engineers on root-cause investigations",
    ],
    requirements: [
      "Currently studying Engineering, Materials Science or similar",
      "Attention to detail and a hands-on mindset",
    ],
  },
];

export const locations = Array.from(new Set(jobs.map((j) => j.location))).sort();

export function getJob(id: string) {
  return jobs.find((j) => j.id === id);
}
