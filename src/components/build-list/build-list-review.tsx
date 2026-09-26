"use client";

import { Copy, Plus, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { parkFeatures } from "@/data";
import { templates } from "@/engine/templates";
import { capitalizeDraft } from "./build-list";
import {
  type BuildListItem,
  ComponentTypeSchema,
  type ComponentType,
  type ProjectDraft,
} from "@/lib/schemas";

// P7.3: review the parsed build list before the map opens. Edit names, types and
// subtypes; remove, duplicate, add. A mounts it in the creation flow (P7.4).

type Props = {
  initial: ProjectDraft;
  /** "fallback" shows a note that the AI wasn't used. */
  source?: "ai" | "fallback";
  onConfirm: (draft: ProjectDraft) => void;
  onBack?: () => void;
};

const input =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function BuildListReview({ initial, source, onConfirm, onBack }: Props) {
  const t = useTranslations("buildList");
  const locale = useLocale() as "en" | "fr";
  const [draft, setDraft] = useState(() => capitalizeDraft(initial));
  const items = draft.components;

  const setItems = (components: BuildListItem[]) =>
    setDraft({ ...draft, components });
  const update = (i: number, patch: Partial<BuildListItem>) =>
    setItems(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const label = (type: ComponentType, subtype: string) =>
    templates[type].subtypes.find((s) => s.id === subtype)?.label[locale] ??
    subtype;

  /** Drop one detail the parser picked up (e.g. a wrong road class); it falls back to its default. */
  function removeParam(i: number, id: string) {
    const c = items[i]!;
    const params = { ...c.params };
    const evidence = { ...c.evidence };
    delete params[id];
    delete evidence[id];
    update(i, { params, evidence });
  }

  function add() {
    const subtype = templates.building.subtypes[0]!.id;
    setItems([
      ...items,
      {
        type: "building",
        subtype,
        name: label("building", subtype),
        params: {},
        evidence: {},
      },
    ]);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">{t("projectName")}</span>
          <input
            className={input}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("municipality")}</span>
          <input
            className={input}
            value={draft.municipality ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, municipality: e.target.value || undefined })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("startDate")}</span>
          <input
            type="date"
            className={input}
            value={draft.startDate ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, startDate: e.target.value || undefined })
            }
          />
        </label>
      </div>

      {source === "fallback" && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("fallbackNote")}
        </p>
      )}

      <h2 className="font-medium">{t("heading", { count: items.length })}</h2>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((c, i) => {
          const tpl = templates[c.type];
          const params = Object.entries(c.params);
          return (
            <li key={i} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex gap-2">
                <input
                  aria-label={t("name")}
                  className={input}
                  value={c.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("duplicate")}
                  onClick={() =>
                    setItems([
                      ...items.slice(0, i + 1),
                      structuredClone(c),
                      ...items.slice(i + 1),
                    ])
                  }
                >
                  <Copy />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("remove")}
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="flex gap-2">
                <select
                  aria-label={t("type")}
                  className={input}
                  value={c.type}
                  onChange={(e) => {
                    const type = e.target.value as ComponentType;
                    // Params belong to a type's catalog, so they reset with it.
                    update(i, {
                      type,
                      subtype: templates[type].subtypes[0]!.id,
                      params: {},
                      evidence: {},
                    });
                  }}
                >
                  {ComponentTypeSchema.options.map((type) => (
                    <option key={type} value={type}>
                      {t(`types.${type}`)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("subtype")}
                  className={input}
                  value={c.subtype}
                  onChange={(e) => update(i, { subtype: e.target.value })}
                >
                  {tpl.subtypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label[locale]}
                    </option>
                  ))}
                </select>
              </div>
              {params.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 text-xs">
                  {params.map(([id, value]) => {
                    const def = tpl.paramCatalog.find((d) => d.id === id);
                    const text = `${def?.label[locale] ?? id}: ${String(value)}${def?.unit ? ` ${def.unit}` : ""}`;
                    return (
                      <Tag
                        key={id}
                        title={c.evidence[id]}
                        text={text}
                        removeLabel={t("removeTag", { tag: text })}
                        onRemove={() => removeParam(i, id)}
                      />
                    );
                  })}
                </ul>
              )}
              {c.features && c.features.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span>{t("features")}:</span>
                  <ul className="contents">
                    {c.features.map((f, k) => {
                      const text =
                        parkFeatures.features[f]?.label[locale] ??
                        f.replace(/_/g, " ");
                      return (
                        <Tag
                          key={`${f}-${k}`}
                          text={text}
                          removeLabel={t("removeTag", { tag: text })}
                          onRemove={() =>
                            update(i, {
                              features: c.features!.filter((_, j) => j !== k),
                            })
                          }
                        />
                      );
                    })}
                  </ul>
                </div>
              )}
              {(c.sourcePhrase || c.spatialHint) && (
                <p className="text-xs text-muted-foreground">
                  {c.sourcePhrase && `“${c.sourcePhrase}”`}
                  {c.sourcePhrase && c.spatialHint && " · "}
                  {c.spatialHint}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={add}>
          <Plus /> {t("add")}
        </Button>
        <div className="flex-1" />
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack}>
            {t("back")}
          </Button>
        )}
        <Button
          type="button"
          disabled={!draft.name.trim() || items.length === 0}
          onClick={() => onConfirm(capitalizeDraft(draft))}
        >
          {t("continue")}
        </Button>
      </div>
    </section>
  );
}

/** A detail chip with a small × to remove it. */
function Tag({
  text,
  title,
  removeLabel,
  onRemove,
}: {
  text: string;
  title?: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <li
      title={title}
      className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2"
    >
      {text}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}
