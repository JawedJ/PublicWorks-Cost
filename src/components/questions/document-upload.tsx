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
import { Separator } from "@/components/ui/separator";
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

// P7.6 (SPEC 9.3): upload one or more reports (e.g. a soil report and a
// traffic memo); the AI reads each and proposes input values with quotes; the
// user ticks which to apply. Applied values are marked "From document" with
// the quote as evidence. Files are never stored.

/** Read in parallel; the AI route allows 10 requests a minute. */
const MAX_FILES = 5;

type FileResult =
  | { fileName: string; ok: true; res: ExtractResponse }
  | {
      fileName: string;
      ok: false;
      error: "tooLarge" | "wrongType" | "failed";
    };

type Status =
  | { kind: "idle" }
  | { kind: "reading"; done: number; total: number }
  | { kind: "review"; results: FileResult[] }
  | { kind: "applied"; names: string[]; count: number; relaid: boolean }
  | { kind: "error"; message: "tooMany" };

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
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Unticked findings, keyed `${file index}:${finding id}`.
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const byId = new Map(components.map((c) => [c.id, c]));

  async function readOne(file: File): Promise<FileResult> {
    const fileName = file.name;
    const mimeType = mimeOf(file);
    if (!mimeType) return { fileName, ok: false, error: "wrongType" };
    if (file.size > MAX_DOCUMENT_BYTES)
      return { fileName, ok: false, error: "tooLarge" };
    try {
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName,
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
      return {
        fileName,
        ok: true,
        res: ExtractResponseSchema.parse(await res.json()),
      };
    } catch {
      return { fileName, ok: false, error: "failed" };
    }
  }

  async function read() {
    if (!files.length) return;
    if (files.length > MAX_FILES)
      return setStatus({ kind: "error", message: "tooMany" });
    let done = 0;
    setStatus({ kind: "reading", done, total: files.length });
    const results = await Promise.all(
      files.map((f) =>
        readOne(f).then((r) => {
          done++;
          setStatus({ kind: "reading", done, total: files.length });
          return r;
        }),
      ),
    );
    setRejected(new Set());
    setStatus({ kind: "review", results });
  }

  /** Every ticked finding, in file order (a later document wins on a clash). */
  const accepted = (results: FileResult[]) =>
    results.flatMap((r, i) =>
      r.ok
        ? r.res.findings
            .filter((f) => !rejected.has(`${i}:${f.id}`))
            .map((f) => ({ ...f, fileName: r.fileName }))
        : [],
    );

  function apply(results: FileResult[]) {
    const chosen = accepted(results);
    const {
      components: all,
      updateComponents,
      addDocument,
    } = useStore.getState();
    const patches = new Map<string, Component>();
    for (const f of chosen)
      for (const id of f.componentIds) {
        const c = patches.get(id) ?? all.find((x) => x.id === id);
        if (!c) continue;
        const where = f.page ? `${f.fileName}, p. ${f.page}` : f.fileName;
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
    const names = [...new Set(chosen.map((f) => f.fileName))];
    const now = new Date().toISOString();
    for (const name of names) addDocument({ name, extractedAt: now });
    // New sizes for things the layout placed: lay them out again (same
    // arrangement) so they resize and move to fit. Drawn-by-hand stays put.
    const resized = chosen.some(
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
      names,
      count: chosen.length,
      relaid: resized,
    });
    setFiles([]);
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

  const toggle = (key: string, on: boolean) => {
    const next = new Set(rejected);
    if (on) next.delete(key);
    else next.add(key);
    setRejected(next);
  };

  const chosenCount =
    status.kind === "review" ? accepted(status.results).length : 0;

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
              multiple
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={(e) => {
                setFiles([...(e.target.files ?? [])]);
                setStatus({ kind: "idle" });
              }}
            />
            {files.length > 1 && (
              <FieldDescription>
                {files.map((f) => f.name).join(", ")}
              </FieldDescription>
            )}
          </Field>
        )}
        {status.kind === "error" && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              {t(`errors.${status.message}`, { max: MAX_FILES })}
            </AlertDescription>
          </Alert>
        )}
        {status.kind === "applied" && (
          <Alert>
            <CircleCheck />
            <AlertDescription>
              {t("applied", {
                count: status.count,
                name: status.names.join(", "),
              })}
              {status.relaid && ` ${t("relaid")}`}
            </AlertDescription>
          </Alert>
        )}
        {status.kind === "review" &&
          status.results.map((r, i) => (
            <section
              key={`${i}:${r.fileName}`}
              className="flex flex-col gap-3"
              aria-label={r.fileName}
            >
              {i > 0 && <Separator />}
              <p className="text-sm">
                <span className="font-medium">{r.fileName}</span>
                {r.ok && r.res.summary && ` · ${r.res.summary}`}
              </p>
              {!r.ok ? (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>{t(`errors.${r.error}`)}</AlertDescription>
                </Alert>
              ) : (
                <>
                  {r.res.notice && (
                    <Alert>
                      <Sparkles />
                      <AlertDescription>
                        {t(`notices.${r.res.notice}`)}
                      </AlertDescription>
                    </Alert>
                  )}
                  {r.res.findings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("nothing")}
                    </p>
                  ) : (
                    <FieldGroup className="gap-3">
                      {r.res.findings.map((f) => {
                        const first = byId.get(f.componentIds[0]!);
                        const def = first ? defOf(first, f.paramId) : undefined;
                        if (!def) return null;
                        const key = `${i}:${f.id}`;
                        const id = `finding-${i}-${f.id}`;
                        return (
                          <Field key={key} orientation="horizontal">
                            <Checkbox
                              id={id}
                              checked={!rejected.has(key)}
                              onCheckedChange={(v) => toggle(key, v === true)}
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
            </section>
          ))}
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
              disabled={chosenCount === 0}
              onClick={() => apply(status.results)}
            >
              {t("apply", { count: chosenCount })}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={!files.length || status.kind === "reading"}
            onClick={() => void read()}
          >
            {status.kind === "reading" && <Spinner data-icon="inline-start" />}
            {status.kind === "reading"
              ? t("reading", { done: status.done, total: status.total })
              : t("read", { count: Math.max(files.length, 1) })}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
