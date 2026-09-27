"use client";

import { CircleCheck, RefreshCw, Sparkles } from "lucide-react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { templates } from "@/engine/templates";
import type {
  Component,
  Estimate,
  ParamDefinition,
  ParamValue,
  Question,
} from "@/lib/schemas";
import { DocumentUpload } from "./document-upload";
import {
  answerQuestion,
  loadQuestions,
  skipQuestion,
  useQuestions,
} from "./questions";

// P7.5 (SPEC 9.2): smart follow-up questions across the whole project, biggest
// costs first. Answers become the user's param values (raising the class);
// Questions are general: one per type for the whole project, and the answer
// applies to every component it lists.

type Props = {
  estimate: Estimate;
  components: Component[];
  /** Scope: only questions touching this component, or null for all. */
  componentId: string | null;
};

export function QuestionsPanel({ estimate, components, componentId }: Props) {
  const t = useTranslations("questions");
  // Generated in the background (EstimatePanel starts it); kept across tab switches.
  const { res, loading, skipped } = useQuestions();

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
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void loadQuestions(estimate, { refresh: true })}
        >
          {loading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {t("askAgain")}
        </Button>
      </div>
      <DocumentUpload components={components} />
      {res?.notice && (
        <Alert>
          <Sparkles />
          <AlertDescription>{t(`notices.${res.notice}`)}</AlertDescription>
        </Alert>
      )}
      {!res && (
        <div aria-live="polite" className="flex flex-col gap-4">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}
      {res && open.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheck />
            </EmptyMedia>
            <EmptyTitle>{t("allAnsweredTitle")}</EmptyTitle>
            <EmptyDescription>{t("allAnswered")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <ol className="flex flex-col gap-4">
        {open.map((q) => {
          const c = byId.get(q.componentId)!;
          const def = templates[c.type].paramCatalog.find(
            (d) => d.id === q.paramId,
          );
          if (!def) return null;
          return (
            <li key={q.id}>
              <QuestionCard
                question={q}
                component={c}
                def={def}
                others={q.alsoApplies
                  .map((id) => byId.get(id))
                  .filter((x): x is Component => !!x)}
                onSkip={() => skipQuestion(q.id)}
              />
            </li>
          );
        })}
      </ol>
      {res?.source === "fallback" && res.questions.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("fallbackNote")}</p>
      )}
    </div>
  );
}

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
  const all = [c, ...others];
  // Asked as a plain, general question: about the whole group ("the roads")
  // when it covers several components, else about the one component.
  const name = others.length > 0 ? t(`groups.${c.type}`) : c.name;
  const allKey = `askAll.${c.type}.${def.id}` as Parameters<typeof t>[0];
  const askKey = `ask.${c.type}.${def.id}` as Parameters<typeof t>[0];
  const title =
    others.length > 0 && t.has(allKey)
      ? t(allKey)
      : t.has(askKey)
        ? t(askKey, { name })
        : label;
  const numOk =
    def.type !== "number" ||
    (Number.isFinite(Number(value)) &&
      Number(value) >= (def.min ?? -Infinity) &&
      Number(value) <= (def.max ?? Infinity));
  const save = (ids: string[]) =>
    answerQuestion(ids, def.id, def.type === "number" ? Number(value) : value);
  const id = `q-${q.id}`;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {t("appliesTo", { names: all.map((x) => x.name).join(", ") })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field data-invalid={!numOk || undefined}>
          <FieldDescription>{q.reason}</FieldDescription>
          <FieldLabel htmlFor={id} className="sr-only">
            {label}
          </FieldLabel>
          {def.type === "enum" && (
            <Select value={String(value)} onValueChange={setValue}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {def.options?.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label.en}
                      {o.value === q.suggested ? ` (${t("suggested")})` : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          {def.type === "number" && (
            <div className="flex items-center gap-2">
              <Input
                id={id}
                type="number"
                className="w-32 text-right tabular-nums"
                min={def.min}
                max={def.max}
                step="any"
                aria-invalid={!numOk || undefined}
                value={String(value)}
                onChange={(e) => setValue(e.target.value)}
              />
              {def.unit && (
                <span className="text-sm text-muted-foreground">
                  {def.unit}
                </span>
              )}
            </div>
          )}
          {def.type === "boolean" && (
            <ToggleGroup
              id={id}
              type="single"
              variant="outline"
              size="sm"
              value={value ? "yes" : "no"}
              onValueChange={(v) => v && setValue(v === "yes")}
            >
              <ToggleGroupItem value="yes">{t("yes")}</ToggleGroupItem>
              <ToggleGroupItem value="no">{t("no")}</ToggleGroupItem>
            </ToggleGroup>
          )}
        </Field>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!numOk}
          onClick={() => save(all.map((x) => x.id))}
        >
          {t("save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onSkip}>
          {t("skip")}
        </Button>
      </CardFooter>
    </Card>
  );
}
