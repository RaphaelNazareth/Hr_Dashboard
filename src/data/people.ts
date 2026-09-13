/**
 * Employee stories.
 * PLACEHOLDER CONTENT: replace names, roles, quotes and photos with approved
 * real employee stories. Photos are generated placeholders in src/assets.
 */
import personEngineer from "@/assets/person-engineer.jpg";
import personMarketing from "@/assets/person-marketing.jpg";
import personDesigner from "@/assets/person-designer.jpg";
import personManufacturing from "@/assets/person-manufacturing.jpg";

export interface Person {
  id: string;
  name: string;
  role: string;
  location: string;
  quote: string;
  photo: string;
}

export const people: Person[] = [
  {
    id: "p1",
    name: "Mette Larsen",
    role: "Product Engineer",
    location: "Billund",
    quote: "I've always enjoyed solving problems that don't have obvious answers.",
    photo: personEngineer,
  },
  {
    id: "p2",
    name: "David Okafor",
    role: "Marketing Manager",
    location: "London",
    quote: "Every project brings together people with completely different perspectives.",
    photo: personMarketing,
  },
  {
    id: "p3",
    name: "Tomás Reyes",
    role: "Product Designer",
    location: "Los Angeles",
    quote: "I get to see an idea go from a sketch to something real.",
    photo: personDesigner,
  },
  {
    id: "p4",
    name: "Karen Whitfield",
    role: "Manufacturing Team Lead",
    location: "Monterrey",
    quote: "The best day is when a new line runs smoothly for the first time.",
    photo: personManufacturing,
  },
];
