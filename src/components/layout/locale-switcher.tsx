"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";

/** Toggles between English and French, keeping the current page. */
export function LocaleSwitcher() {
  const t = useTranslations("layout");
  const locale = useLocale();
  const pathname = usePathname();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <Button variant="ghost" size="sm" asChild>
      <Link
        href={pathname}
        locale={other}
        lang={other}
        aria-label={t("switchToLocaleLabel")}
      >
        {t("switchToLocale")}
      </Link>
    </Button>
  );
}
