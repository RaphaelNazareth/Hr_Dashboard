import { Link } from "react-router-dom";
import { Wordmark } from "./Wordmark";
import { brand, footerLinks } from "@/data/site";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="container-editorial grid gap-12 py-16 md:grid-cols-12 md:py-20">
        <div className="md:col-span-5">
          <Wordmark tone="paper" />
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-ink-muted">
            The careers home of {brand.legalName}. Built for the people who make play — and the
            people who want to.
          </p>
        </div>
        <FooterColumn title="Explore" links={footerLinks.explore} />
        <FooterColumn title="Portals" links={footerLinks.portals} />
        <FooterColumn title="Legal" links={footerLinks.legal} />
      </div>
      <div className="border-t border-ink-border">
        <div className="container-editorial flex flex-col gap-2 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {brand.legalName}. All rights reserved.</span>
          <span>Careers site · Not the corporate store</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { label: string; to: string }[];
}) {
  return (
    <div className="md:col-span-2">
      <p className="eyebrow text-ink-muted">{title}</p>
      <ul className="mt-5 space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              to={l.to}
              className="link-draw text-sm text-ink-foreground/85 hover:text-ink-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
