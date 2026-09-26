import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { WorkspaceActions } from "./workspace-actions";

/** Persistent top bar: app name, project file actions in the workspace. */
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
      <div className="flex flex-1 items-center justify-end gap-2">
        {children}
        <WorkspaceActions />
      </div>
    </header>
  );
}
