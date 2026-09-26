"use client";

import {
  DownloadProjectButton,
  OpenProjectButton,
} from "@/components/project-file/project-file-buttons";
import { usePathname } from "@/lib/i18n/navigation";

/** Project file buttons in the top bar, shown only in the workspace. */
export function WorkspaceActions() {
  const pathname = usePathname();
  if (!pathname.startsWith("/workspace")) return null;
  return (
    <>
      <OpenProjectButton variant="ghost" />
      <DownloadProjectButton />
    </>
  );
}
