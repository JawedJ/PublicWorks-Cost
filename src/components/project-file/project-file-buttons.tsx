"use client";

import { Download, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";
import {
  PROJECT_FILE_EXTENSION,
  parseProjectFile,
  projectFileName,
  serializeProject,
} from "@/lib/project-file";
import { selectProject } from "@/lib/store/projectSlice";
import { useStore } from "@/lib/store/store";

// P4.1–P4.2: "Download project file" and "Open project file". A places them
// (top bar in the workspace, landing page).

type ButtonProps = { variant?: "default" | "outline" | "ghost" };

export function DownloadProjectButton({ variant = "outline" }: ButtonProps) {
  const t = useTranslations("projectFile");
  const hasWork = useStore((s) => s.components.length > 0);

  function download() {
    const project = selectProject(useStore.getState());
    const blob = new Blob([serializeProject(project)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = projectFileName(project.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={!hasWork}
      onClick={download}
    >
      <Download /> {t("download")}
    </Button>
  );
}

/** Opens a `.pwcost.json` file into the workspace; shows a clear error if it can't. */
export function OpenProjectButton({ variant = "outline" }: ButtonProps) {
  const t = useTranslations("projectFile");
  const loadProject = useStore((s) => s.loadProject);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(file: File) {
    setError(null);
    const parsed = parseProjectFile(await file.text());
    if (!parsed.ok) {
      setError(t(`errors.${parsed.error}`, { detail: parsed.detail ?? "" }));
      return;
    }
    const hasWork = useStore.getState().components.length > 0;
    if (hasWork && !window.confirm(t("replaceConfirm"))) return;
    loadProject(parsed.project);
    router.push("/workspace");
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={input}
        type="file"
        accept={`${PROJECT_FILE_EXTENSION},application/json,.json`}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void open(file);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => input.current?.click()}
      >
        <FolderOpen /> {t("open")}
      </Button>
      {error && (
        <span role="alert" className="max-w-xs text-sm text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
