"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { templates } from "@/engine/templates";
import type {
  Component,
  Estimate,
  ParamDefinition,
  ParamValue,
  Question,
  QuestionsResponse,
} from "@/lib/schemas";
import {
  answerQuestion,
  buildQuestionsRequest,
  requestQuestions,
} from "./questions";

// P7.5 (SPEC 9.2): smart follow-up questions across the whole project, biggest
// costs first. Answers become the user's param values (raising the class);
// "apply to all similar" answers the same param on every matching component.

type Props = {
  estimate: Estimate;
  components: Component[];
  /** Scope: only questions touching this component, or null for all. */
  componentId: string | null;
};

export function QuestionsPanel({ estimate, components, componentId }: Props) {
  const t = useTranslations("questions");
  const [res, setRes] = useState<QuestionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  async function ask() {
    setLoading(true);
    setSkipped(new Set());
    setRes(await requestQuestions(buildQuestionsRequest(estimate)));
    setLoading(false);
  }

  // Ask once when the tab opens (server-side cached); "Ask again" refreshes.
  useEffect(() => {
    let live = true;
    void requestQuestions(buildQuestionsRequest(estimate)).then((r) => {
      if (live) setRes(r);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = new Map(components.map((c) => [c.id, c]));
  const open = (res?.questions ?? []).filter((q) => {
    const c = byId.get(q.componentId);
    if (!c || skipped.has(q.id)) return false;
    // Answered since (here or in the Inputs tab) → gone.
    if ((c.paramMeta[q.paramId]?.source ?? "default") !== "default")
      return false;
    return (
      !componentId ||
      q.componentId === componentId ||
      q.alsoApplies.includes(componentId)
    );
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => void ask()}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          {t("askAgain")}
        </Button>
      </div>
      {res?.notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {t(`notices.${res.notice}`)}
        </p>
      )}
      {!res && (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {t("loading")}
        </p>
      )}
      {res && open.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("allAnswered")}</p>
      )}
      <ol className="flex flex-col gap-3">
        {open.map((q) => {
          const c = byId.get(q.componentId)!;
          const def = templates[c.type].paramCatalog.find(
            (d) => d.id === q.paramId,
          );
          if (!def) return null;
          return (
            <QuestionCard
              key={q.id}
              question={q}
              component={c}
              def={def}
              others={q.alsoApplies
                .map((id) => byId.get(id))
                .filter((x): x is Component => !!x)}
              onSkip={() => setSkipped(new Set([...skipped, q.id]))}
            />
          );
        })}
      </ol>
      {res?.source === "fallback" && res.questions.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("fallbackNote")}</p>
      )}
    </div>
  );
}

const input =
  "rounded border bg-background px-1.5 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function QuestionCard({
  question: q,
  component: c,
  def,
  others,
  onSkip,
}: {
  question: Question;
  component: Component;
  def: ParamDefinition;
  others: Component[];
  onSkip: () => void;
}) {
  const t = useTranslations("questions");
  const [value, setValue] = useState<ParamValue>(q.suggested);
  const label = def.label.en;
  const numOk =
    def.type !== "number" ||
    (Number.isFinite(Number(value)) &&
      Number(value) >= (def.min ?? -Infinity) &&
      Number(value) <= (def.max ?? Infinity));
  const save = (ids: string[]) =>
    answerQuestion(ids, def.id, def.type === "number" ? Number(value) : value);

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {c.name}
          {others.length > 0 && ` ${t("andOthers", { count: others.length })}`}
        </p>
      </div>
      <p>{q.reason}</p>
      <div className="flex items-center gap-2">
        {def.type === "enum" && (
          <select
            aria-label={label}
            className={`${input} w-full`}
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
          >
            {def.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label.en}
                {o.value === q.suggested ? ` (${t("suggested")})` : ""}
              </option>
            ))}
          </select>
        )}
        {def.type === "number" && (
          <>
            <input
              type="number"
              aria-label={label}
              className={`${input} w-28 text-right figures`}
              min={def.min}
              max={def.max}
              step="any"
              value={String(value)}
              onChange={(e) => setValue(e.target.value)}
            />
            {def.unit && (
              <span className="text-muted-foreground">{def.unit}</span>
            )}
          </>
        )}
        {def.type === "boolean" && (
          <div role="radiogroup" aria-label={label} className="flex gap-3">
            {[true, false].map((v) => (
              <label key={String(v)} className="flex items-center gap-1">
                <input
                  type="radio"
                  name={q.id}
                  checked={value === v}
                  onChange={() => setValue(v)}
                />
                {t(v ? "yes" : "no")}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!numOk}
          onClick={() => save([c.id])}
        >
          {t("save")}
        </Button>
        {others.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!numOk}
            onClick={() => save([c.id, ...others.map((o) => o.id)])}
          >
            {t("applyAll", { count: others.length + 1 })}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onSkip}>
          {t("skip")}
        </Button>
      </div>
    </li>
  );
}
