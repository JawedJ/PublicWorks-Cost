"use client";

import { ArrowRight, Loader2, Map as MapIcon, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { applyDraft, requestParse } from "@/components/build-list/build-list";
import { BuildListReview } from "@/components/build-list/build-list-review";
import { OpenProjectButton } from "@/components/project-file/project-file-buttons";
import { Button } from "@/components/ui/button";
import { northgateProject } from "@/lib/fixtures";
import { useRouter } from "@/lib/i18n/navigation";
import type { ParseResponse } from "@/lib/schemas";
import { useStore } from "@/lib/store/store";

// Landing (P4.5) and creation flow (P7.4): describe the whole build → review the
// parsed build list → the workspace with every component planned, ready to place
// (Generate layout or draw each). Or start from a blank map / the sample / a file.

export function LandingStart() {
  const t = useTranslations("landing");
  const locale = useLocale() as "en" | "fr";
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const examples = [t("example1"), t("example2"), t("example3")];

  async function start() {
    if (!prompt.trim() || parsing) return;
    setParsing(true);
    const r = await requestParse(prompt, locale);
    setParsing(false);
    if (!r.draft.components.length) return setNotice(t("nothingFound"));
    setParsed(r);
  }

  if (parsed)
    return (
      <BuildListReview
        initial={parsed.draft}
        source={parsed.source}
        onConfirm={(d) => {
          applyDraft(d);
          router.push("/workspace");
        }}
        onBack={() => setParsed(null)}
      />
    );

  function blank() {
    useStore.getState().newProject({ name: t("untitled") });
    router.push("/workspace");
  }

  function sample() {
    useStore.getState().loadProject(structuredClone(northgateProject));
    router.push("/workspace");
  }

  return (
    <div className="space-y-6">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <label htmlFor="prompt" className="text-sm font-medium">
          {t("promptLabel")}
        </label>
        <textarea
          id="prompt"
          rows={3}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setNotice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
          }}
          placeholder={t("promptPlaceholder")}
          className="w-full resize-none rounded-md border bg-background p-3 text-base shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {ex}
            </button>
          ))}
        </div>
        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" size="lg" disabled={!prompt.trim() || parsing}>
            {parsing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {parsing ? t("parsing") : t("startPrompt")}
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={blank}>
            <MapIcon /> {t("startBlank")}
          </Button>
        </div>
      </form>
      <div className="rounded-lg border p-4">
        <h2 className="font-medium">{t("sampleTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("sampleBody")}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Button variant="link" className="px-0" onClick={sample}>
            {t("openSample")} <ArrowRight />
          </Button>
          <OpenProjectButton />
        </div>
      </div>
    </div>
  );
}
