import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { WorkspaceShell } from "@/components/map/workspace-shell";
import type { Locale } from "@/lib/i18n/routing";

export default function WorkspacePage({
  params,
}: PageProps<"/[locale]/workspace">) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations("map");

  return (
    <>
      <h1 className="sr-only">{t("workspaceTitle")}</h1>
      <WorkspaceShell />
    </>
  );
}
