import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "en",
});

export type Locale = (typeof routing.locales)[number];

/** `Intl` locale used for number, currency, and date formatting. */
export const intlLocale: Record<Locale, string> = {
  en: "en-CA",
  fr: "fr-CA",
};
