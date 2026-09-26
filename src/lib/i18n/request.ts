import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

type Messages = { [key: string]: string | Messages };

/** `base` with `over` on top; nested groups are merged key by key. */
function merge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = typeof v === "object" && typeof b === "object" ? merge(b, v) : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
  const en = (await import("../../../messages/en.json")).default as Messages;
  // English only for now (SPEC 17): French falls back to English for missing keys.
  const messages =
    locale === "en"
      ? en
      : merge(
          en,
          (await import(`../../../messages/${locale}.json`))
            .default as Messages,
        );

  return { locale, messages };
});
