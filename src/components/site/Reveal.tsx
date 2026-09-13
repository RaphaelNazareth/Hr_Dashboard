import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Fades content up once it scrolls into view. Pure CSS + IntersectionObserver. */
export function Reveal({
  as: Tag = "div",
  children,
  className,
  delay = 0,
  id,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: 0 | 1 | 2 | 3;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.dataset.inview = "true";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.dataset.inview = "true";
            io.unobserve(el);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      className={cn(
        "reveal",
        delay === 1 && "reveal-delay-1",
        delay === 2 && "reveal-delay-2",
        delay === 3 && "reveal-delay-3",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
