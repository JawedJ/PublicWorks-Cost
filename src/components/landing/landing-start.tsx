"use client";

import { ArrowRight, Map as MapIcon, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { templates } from "@/engine/templates";
import { northgateProject } from "@/lib/fixtures";
import { useRouter } from "@/lib/i18n/navigation";
import { useStore } from "@/lib/store/store";
import { keywordParse } from "./keyword-parse";

// Landing (P4.5): describe the whole build, start from a blank map, or open the
// sample project. The prompt uses a keyword fallback until B's AI parse (P7.2).

export function LandingStart() {
  const t = useTranslations("landing");
  const locale = useLocale() as "en" | "fr";
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const examples = [t("example1"), t("example2"), t("example3")];

  function start() {
    const planned = keywordParse(prompt);
    if (!planned.length) return setNotice(t("nothingFound"));
    const store = useStore.getState();
    store.newProject({ name: prompt.slice(0, 60) });
    const counts: Record<string, number> = {};
    store.addComponents(
      planned.map((p) => {
        counts[p.subtype] = (counts[p.subtype] ?? 0) + 1;
        const label =
          templates[p.type].subtypes.find((s) => s.id === p.subtype)?.label[
            locale
          ] ?? p.subtype;
        return {
          ...p,
          name: `${label} ${counts[p.subtype]}`,
          paramMeta: Object.fromEntries(
            Object.keys(p.params).map((k) => [
              k,
              { source: "ai_prompt" as const },
            ]),
          ),
        };
      }),
    );
    router.push("/workspace");
  }

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
          <Button type="submit" size="lg" disabled={!prompt.trim()}>
            <Sparkles /> {t("startPrompt")}
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={blank}>
            <MapIcon /> {t("startBlank")}
          </Button>
        </div>
      </form>
      <div className="rounded-lg border p-4">
        <h2 className="font-medium">{t("sampleTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("sampleBody")}</p>
        <Button variant="link" className="mt-1 px-0" onClick={sample}>
          {t("openSample")} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
