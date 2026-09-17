import { Link } from "react-router-dom";
import { Wordmark } from "./Wordmark";
import { brand } from "@/data/site";
import { useLanguage } from "@/hooks/useLanguage";

export function SiteFooter() {
  const { t } = useLanguage();

  const explore = [
    { label: t("footer.careers"), to: "/" },
    { label: t("footer.jobs"), to: "/#jobs" },
    { label: t("footer.aboutUs"), to: "/#life" },
    { label: t("footer.people"), to: "/#people" },
    { label: t("footer.life"), to: "/life-at-company" },
  ];
  const portals = [
    { label: t("footer.candidatePortal"), to: "/apply" },
    { label: t("footer.hrDashboard"), to: "/dashboard" },
  ];
  const legal = [
    { label: t("footer.privacy"), to: "/" },
    { label: t("footer.terms"), to: "/" },
  ];

  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="container-editorial grid gap-10 py-12 sm:gap-12 sm:py-16 md:grid-cols-12 md:py-20">
        <div className="md:col-span-5">
          <Wordmark tone="paper" />
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-ink-muted">
            {t("footer.blurb", { name: brand.legalName })}
          </p>
        </div>
        <FooterColumn title={t("footer.explore")} links={explore} />
        <FooterColumn title={t("footer.portals")} links={portals} />
        <FooterColumn title={t("footer.legal")} links={legal} />
      </div>
      <div className="border-t border-ink-border">
        <div className="container-editorial flex flex-col gap-2 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{t("footer.rights", { year: new Date().getFullYear(), name: brand.legalName })}</span>
          <span>{t("footer.note")}</span>
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
  links: { label: string; to: string }[];
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
