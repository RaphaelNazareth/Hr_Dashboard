import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

export function FinalCta() {
  const { t } = useLanguage();
  return (
    <section className="bg-sun py-16 text-sun-foreground sm:py-28 md:py-44">
      <Reveal className="container-editorial">
        <div className="grid gap-8 md:grid-cols-12 md:items-end md:gap-10">
          <h2 className="display-xl text-balance-pretty md:col-span-8">{t("cta.title")}</h2>
          <div className="md:col-span-4 md:pb-3">
            <p className="max-w-sm text-base leading-relaxed text-sun-foreground/80 sm:text-lg">
              {t("cta.lead")}
            </p>
            <Button asChild variant="ink" size="xl" className="mt-8 w-full sm:w-auto">
              <Link to="/#jobs">
                {t("cta.button")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
