/** "From idea to play" storytelling steps. Images are generated placeholders. */
import imagine from "@/assets/journey-imagine.jpg";
import design from "@/assets/journey-design.jpg";
import build from "@/assets/journey-build.jpg";
import test from "@/assets/journey-test.jpg";
import play from "@/assets/journey-play.jpg";

export interface JourneyStep {
  index: string;
  title: string;
  text: string;
  image: string;
}

export const journeySteps: JourneyStep[] = [
  { index: "01", title: "Imagine", text: "Ideas begin with curiosity about how people play.", image: imagine },
  { index: "02", title: "Design", text: "Teams turn ideas into experiences with a purpose.", image: design },
  {
    index: "03",
    title: "Build",
    text: "Engineers and makers bring concepts into reality.",
    image: build,
  },
  {
    index: "04",
    title: "Test",
    text: "Challenged until it is safe, durable and better.",
    image: test,
  },
  {
    index: "05",
    title: "Play",
    text: "It reaches families across more than 130 markets.",
    image: play,
  },
];
