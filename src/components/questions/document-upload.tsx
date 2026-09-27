"use client";

import { CircleCheck, FileText, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useMap } from "@/components/map/map-context";
import { readSurroundings } from "@/components/map/read-surroundings";
import { templates } from "@/engine/templates";
import { SIZE_HINTS } from "@/lib/ai/parse";
import { featureBounds } from "@/lib/geo/bounds";
import { formatParam } from "@/lib/export/report-data";
import {
  type Component,
  type ExtractResponse,
  ExtractResponseSchema,
  MAX_DOCUMENT_BYTES,
} from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// P7.6 (SPEC 9.3): upload a report (e.g. a soil report); the AI proposes input
// values with quotes; the user ticks which to apply. Applied values are marked
// "From document" with the quote as evidence. The file is never stored.

type Status =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "review"; fileName: string; res: ExtractResponse }
  | { kind: "applied"; fileName: string; count: number; relaid: boolean }
  | { kind: "error"; message: "tooLarge" | "wrongType" | "failed" };

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function mimeOf(file: File): "application/pdf" | "text/plain" | null {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name))
    return "application/pdf";
  if (file.type === "text/plain" || /\.txt$/i.test(file.name))
    return "text/plain";
  return null;
}

/** Sizes a document can change on components the layout placed. */
const SIZE_IDS = new Set([
  "gfaOverrideM2",
  "storeys",
  "areaM2",
  "lengthM",
  "stalls",
]);
const isPlaced = (c: Component) =>
  c.status === "planned" || c.origin === "generated";

/** Catalog inputs plus the layout's size hints, for showing a finding. */
function defOf(c: Component, paramId: string) {
  return (
    templates[c.type].paramCatalog.find((d) => d.id === paramId) ??
    SIZE_HINTS[c.type]?.find((d) => d.id === paramId)
  );
}

/** The map, when there is one (tests render the panel without it). */
function useOptionalMap() {
  try {
    return useMap();
  } catch {
    return null;
  }
}

export function DocumentUpload({ components }: { components: Component[] }) {
  const t = useTranslations("documents");
  const map = useOptionalMap();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const byId = new Map(components.map((c) => [c.id, c]));

  async function read() {
    if (!file) return;
    const mimeType = mimeOf(file);
    if (!mimeType) return setStatus({ kind: "error", message: "wrongType" });
    if (file.size > MAX_DOCUMENT_BYTES)
      return setStatus({ kind: "error", message: "tooLarge" });
    setStatus({ kind: "reading" });
    try {
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType,
          dataBase64: await toBase64(file),
          components: components.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            subtype: c.subtype,
            resizable: isPlaced(c),
          })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRejected(new Set());
      setStatus({
        kind: "review",
        fileName: file.name,
        res: ExtractResponseSchema.parse(await res.json()),
      });
    } catch {
      setStatus({ kind: "error", message: "failed" });
    }
  }

  function apply(fileName: string, res: ExtractResponse) {
    const accepted = res.findings.filter((f) => !rejected.has(f.id));
    const {
      components: all,
      updateComponents,
      addDocument,
    } = useStore.getState();
    const patches = new Map<string, Component>();
    for (const f of accepted)
      for (const id of f.componentIds) {
        const c = patches.get(id) ?? all.find((x) => x.id === id);
        if (!c) continue;
        const where = f.page ? `${fileName}, p. ${f.page}` : fileName;
        patches.set(id, {
          ...c,
          params: { ...c.params, [f.paramId]: f.value },
          paramMeta: {
            ...c.paramMeta,
            [f.paramId]: {
              source: "ai_document",
              evidence: `${where}: "${f.evidence}"`,
            },
          },
        });
      }
    updateComponents(
      [...patches.values()].map((c) => ({
        id: c.id,
        patch: { params: c.params, paramMeta: c.paramMeta },
      })),
    );
    addDocument({ name: fileName, extractedAt: new Date().toISOString() });
    // New sizes for things the layout placed: lay them out again (same
    // arrangement) so they resize and move to fit. Drawn-by-hand stays put.
    const resized = accepted.some(
      (f) =>
        SIZE_IDS.has(f.paramId) &&
        f.componentIds.some((id) => {
          const c = all.find((x) => x.id === id);
          return c && isPlaced(c);
        }),
    );
    if (resized) void relayout();
    setStatus({
      kind: "applied",
      fileName,
      count: accepted.length,
      relaid: resized,
    });
    setFile(null);
  }

  async function relayout() {
    const store = useStore.getState();
    const area = store.areaBoundary && featureBounds(store.areaBoundary);
    const centre: [number, number] | null = area
      ? [(area[0] + area[2]) / 2, (area[1] + area[3]) / 2]
      : map
        ? (map.getCenter().toArray() as [number, number])
        : null;
    if (!centre) return;
    const surroundings = map
      ? await readSurroundings(map, centre).catch(() => undefined)
      : undefined;
    const latest = useStore.getState();
    latest.generateLayout(centre, latest.layoutSeed, surroundings);
  }

  const toggle = (id: string, on: boolean) => {
    const next = new Set(rejected);
    if (on) next.delete(id);
    else next.add(id);
    setRejected(next);
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status.kind !== "review" && (
          <Field>
            <FieldLabel htmlFor="document-file" className="sr-only">
              {t("fileLabel")}
            </FieldLabel>
            <Input
              id="document-file"
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setStatus({ kind: "idle" });
              }}
            />
          </Field>
        )}
        {status.kind === "error" && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{t(`errors.${status.message}`)}</AlertDescription>
          </Alert>
        )}
        {status.kind === "applied" && (
          <Alert>
            <CircleCheck />
            <AlertDescription>
              {t("applied", { count: status.count, name: status.fileName })}
              {status.relaid && ` ${t("relaid")}`}
            </AlertDescription>
          </Alert>
        )}
        {status.kind === "review" && (
          <>
            {status.res.notice && (
              <Alert>
                <Sparkles />
                <AlertDescription>
                  {t(`notices.${status.res.notice}`)}
                </AlertDescription>
              </Alert>
            )}
            <p className="text-sm">
              <span className="font-medium">{status.fileName}</span>
              {status.res.summary && ` · ${status.res.summary}`}
            </p>
            {status.res.findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("nothing")}</p>
            ) : (
              <FieldGroup className="gap-3">
                {status.res.findings.map((f) => {
                  const first = byId.get(f.componentIds[0]!);
                  const def = first ? defOf(first, f.paramId) : undefined;
                  if (!def) return null;
                  const id = `finding-${f.id}`;
                  return (
                    <Field key={f.id} orientation="horizontal">
                      <Checkbox
                        id={id}
                        checked={!rejected.has(f.id)}
                        onCheckedChange={(v) => toggle(f.id, v === true)}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={id}>
                          {def.label.en}: {formatParam(def, f.value)}
                        </FieldLabel>
                        <FieldDescription>
                          {t("appliesTo", {
                            names: f.componentIds
                              .map((c) => byId.get(c)?.name ?? c)
                              .join(", "),
                          })}
                        </FieldDescription>
                        <FieldDescription className="italic">
                          “{f.evidence}”{f.page ? ` (p. ${f.page})` : ""}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldGroup>
            )}
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-2">
        {status.kind === "review" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatus({ kind: "idle" })}
            >
              {t("discard")}
            </Button>
            <Button
              size="sm"
              disabled={
                status.res.findings.filter((f) => !rejected.has(f.id))
                  .length === 0
              }
              onClick={() => apply(status.fileName, status.res)}
            >
              {t("apply", {
                count: status.res.findings.filter((f) => !rejected.has(f.id))
                  .length,
              })}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={!file || status.kind === "reading"}
            onClick={() => void read()}
          >
            {status.kind === "reading" && <Spinner data-icon="inline-start" />}
            {status.kind === "reading" ? t("reading") : t("read")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
