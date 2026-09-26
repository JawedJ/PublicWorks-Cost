import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { SampleDataBadge } from "./sample-data-badge";

/** Persistent top bar: app name, sample-data badge, language toggle. */
export function TopBar({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("common");

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
      <Link
        href="/"
        className="flex items-center gap-2 font-semibold tracking-tight"
      >
        <span
          aria-hidden
          className="inline-block size-3 rounded-sm bg-primary"
        />
        {t("appName")}
      </Link>
      <SampleDataBadge />
      <div className="flex flex-1 items-center justify-end gap-2">
        {children}
        <LocaleSwitcher />
      </div>
    </header>
  );
}
