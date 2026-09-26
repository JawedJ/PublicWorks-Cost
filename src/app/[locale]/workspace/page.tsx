import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import type { Locale } from "@/lib/i18n/routing";

export default function WorkspacePage({
  params,
}: PageProps<"/[locale]/workspace">) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations("map");

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
      <h1 className="sr-only">{t("workspaceTitle")}</h1>
      <p>{t("placeholder")}</p>
    </div>
  );
}
