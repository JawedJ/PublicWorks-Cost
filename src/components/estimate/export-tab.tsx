"use client";

import { FileSpreadsheet, FileText, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { captureMapSnapshot } from "@/components/map/snapshot";
import { useMap } from "@/components/map/map-context";
import { DownloadProjectButton } from "@/components/project-file/project-file-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { buildReport, reportBaseName } from "@/lib/export/report-data";
import type { Estimate } from "@/lib/schemas";
import { selectProject } from "@/lib/store/projectSlice";
import { useStore } from "@/lib/store/store";

// P5.4 (SPEC 10.3, 14): Export tab. PDF council report (with a map snapshot),
// Excel workbook, and the project file. Always whole-project.

type Job = "pdf" | "xlsx" | null;

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportTab({ estimate }: { estimate: Estimate }) {
  const t = useTranslations("export");
  const map = useMap();
  const [job, setJob] = useState<Job>(null);
  const [failed, setFailed] = useState(false);
  const [withMap, setWithMap] = useState(true);

  function report() {
    const state = useStore.getState();
    return buildReport(selectProject(state), state.components, estimate);
  }

  /** Fits the map to the project for the picture, then puts the view back. */
  async function snapshot(): Promise<string | null> {
    if (!map || !withMap) return null;
    const camera = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    try {
      return await captureMapSnapshot(map, { fitProject: true });
    } catch {
      return null;
    } finally {
      map.jumpTo(camera);
    }
  }

  async function run(kind: Exclude<Job, null>) {
    setJob(kind);
    setFailed(false);
    try {
      const r = report();
      if (kind === "pdf") {
        const { buildReportPdf } = await import("@/lib/export/pdf");
        save(
          await buildReportPdf(r, await snapshot()),
          `${reportBaseName(r.projectName)}.pdf`,
        );
      } else {
        const { buildReportXlsx } = await import("@/lib/export/xlsx");
        save(await buildReportXlsx(r), `${reportBaseName(r.projectName)}.xlsx`);
      }
    } catch (err) {
      console.error(err);
      setFailed(true);
    } finally {
      setJob(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {failed && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{t("failed")}</AlertDescription>
        </Alert>
      )}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText />
            {t("pdfTitle")}
          </CardTitle>
          <CardDescription>{t("pdfDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2">
          <Field orientation="horizontal" className="w-auto">
            <Switch
              id="export-map"
              checked={withMap && !!map}
              disabled={!map}
              onCheckedChange={setWithMap}
            />
            <FieldLabel htmlFor="export-map">{t("includeMap")}</FieldLabel>
          </Field>
          <Button
            size="sm"
            disabled={job !== null}
            onClick={() => void run("pdf")}
          >
            {job === "pdf" && <Spinner data-icon="inline-start" />}
            {job === "pdf" ? t("preparing") : t("downloadPdf")}
          </Button>
        </CardFooter>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet />
            {t("xlsxTitle")}
          </CardTitle>
          <CardDescription>{t("xlsxDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button
            size="sm"
            disabled={job !== null}
            onClick={() => void run("xlsx")}
          >
            {job === "xlsx" && <Spinner data-icon="inline-start" />}
            {job === "xlsx" ? t("preparing") : t("downloadXlsx")}
          </Button>
        </CardFooter>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("projectTitle")}</CardTitle>
          <CardDescription>{t("projectDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <DownloadProjectButton />
        </CardFooter>
      </Card>
      {estimate.sampleData && (
        <p className="text-xs text-muted-foreground">{t("sampleNote")}</p>
      )}
    </div>
  );
}
