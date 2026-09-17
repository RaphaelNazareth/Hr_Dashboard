import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { translations, type Locale } from "@/i18n/translations";

type Vars = Record<string, string | number>;

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, vars?: Vars) => string;
};

const STORAGE_KEY = "playco-locale";

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "id") return stored;
    if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("id")) {
      return "id";
    }
  } catch {
    /* ignore */
  }
  return "en";
}

function lookup(locale: Locale, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = translations[locale];
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in cur) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function interpolate(value: string, vars?: Vars) {
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] === undefined ? `{{${name}}}` : String(vars[name]),
  );
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "id" ? "id" : "en";
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => (prev === "en" ? "id" : "en"));
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const found = lookup(locale, key);
      if (typeof found === "string") return interpolate(found, vars);
      return key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
