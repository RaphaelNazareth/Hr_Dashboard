import { useContext } from "react";
import { LanguageContext } from "@/contexts/LanguageContext";
import { translations, type Locale } from "@/i18n/translations";

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  const copy = translations[ctx.locale];
  return { ...ctx, copy };
}

export type { Locale };
