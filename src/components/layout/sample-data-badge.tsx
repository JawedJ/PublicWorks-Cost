import { useTranslations } from "next-intl";

/** Always-visible notice that prices and reference data are sample values. */
export function SampleDataBadge() {
  const t = useTranslations("common");

  return (
    <span
      title={t("sampleDataNotice")}
      className="rounded-full border border-sample-foreground/20 bg-sample px-2 py-0.5 text-xs font-medium text-sample-foreground"
    >
      {t("sampleData")}
    </span>
  );
}
