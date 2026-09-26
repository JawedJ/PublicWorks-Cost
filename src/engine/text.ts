import type { LocalizedText } from "@/lib/schemas";

// Engine text is { en, fr } (SPEC Change log P2.1) so the engine stays locale-free.

const formatters = {
  en: new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }),
  fr: new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }),
};

/** Formats a number for each language, e.g. 1234.5 → { en: "1,234.5", fr: "1 234,5" }. */
export function n(value: number): LocalizedText {
  return { en: formatters.en.format(value), fr: formatters.fr.format(value) };
}

type Part = string | number | LocalizedText;

/**
 * Builds bilingual text from parts. Strings are shared by both languages
 * (units, symbols), numbers are formatted per language, and { en, fr }
 * parts are picked per language.
 *
 * t(812, " m × ", 11.4, " m") → { en: "812 m × 11.4 m", fr: "812 m × 11,4 m" }
 */
export function t(...parts: Part[]): LocalizedText {
  const pick = (lang: "en" | "fr") =>
    parts
      .map((p) =>
        typeof p === "string"
          ? p
          : typeof p === "number"
            ? n(p)[lang]
            : p[lang],
      )
      .join("");
  return { en: pick("en"), fr: pick("fr") };
}

export const L = (en: string, fr: string): LocalizedText => ({ en, fr });
