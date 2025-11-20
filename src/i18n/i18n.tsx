import React, { createContext, useContext, useState, useEffect } from "react";
import { en } from "./translations/en";
import { pt } from "./translations/pt";

type Language = "en" | "pt";
type Translations = typeof en;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = "evoque-language";

const translations: Record<Language, Translations> = {
  en,
  pt,
};

const getNestedValue = (obj: any, path: string): string => {
  const keys = path.split(".");
  let result = obj;
  
  for (const key of keys) {
    if (result && typeof result === "object" && key in result) {
      result = result[key];
    } else {
      console.warn(`Translation key not found: ${path}`);
      return path;
    }
  }
  
  return typeof result === "string" ? result : path;
};

const getBrowserLanguage = (): Language => {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("pt")) return "pt";
  return "en";
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && (stored === "en" || stored === "pt")) {
      return stored;
    }
    return getBrowserLanguage();
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    return getNestedValue(translations[language], key);
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
};
