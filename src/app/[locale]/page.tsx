import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { LandingStart } from "@/components/landing/landing-start";
import type { Locale } from "@/lib/i18n/routing";

export default function LandingPage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations("landing");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="text-lg text-muted-foreground">{t("intro")}</p>
      <LandingStart />
    </div>
  );
}
