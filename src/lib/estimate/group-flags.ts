import type { Flag } from "@/lib/schemas";

// "Things to check": the same issue on several components (e.g. two houses near
// the same school) becomes one entry listing each component, instead of one
// entry per component. Shared by the panel and the PDF report.

export type FlagGroup = {
  /** Key of the group (first flag's id), for React keys. */
  id: string;
  code: string;
  severity: Flag["severity"];
  title: string;
  /** Text every flag in the group shares. */
  explanation: string;
  /** Cost effect, when it's the same for all. */
  costEffect?: string;
  /** One row per flag: which components, plus what's specific to them. */
  items: { componentIds: string[]; detail?: string; costEffect?: string }[];
};

const ORDER = { high: 0, warning: 1, info: 2 } as const;

/** Longest shared start of the texts, cut back to a whole sentence. */
function sharedSentences(texts: string[]): string {
  let prefix = texts[0] ?? "";
  for (const t of texts.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < t.length && prefix[i] === t[i]) i++;
    prefix = prefix.slice(0, i);
  }
  if (texts.every((t) => t === prefix)) return prefix;
  const end = prefix.lastIndexOf(". ");
  return end >= 0 ? prefix.slice(0, end + 1) : "";
}

export function groupFlags(flags: Flag[]): FlagGroup[] {
  const groups = new Map<string, Flag[]>();
  for (const f of flags) {
    const key = `${f.severity}|${f.code}|${f.title.en}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.values()]
    .map((fs): FlagGroup => {
      const first = fs[0]!;
      const texts = fs.map((f) => f.explanation.en);
      const shared = fs.length === 1 ? texts[0]! : sharedSentences(texts);
      const effects = fs.map((f) => f.costEffect?.en ?? "");
      const sameEffect = effects.every((e) => e === effects[0]);
      return {
        id: first.id,
        code: first.code,
        severity: first.severity,
        title: first.title.en,
        explanation: shared,
        ...(sameEffect && effects[0] && { costEffect: effects[0] }),
        items: fs.map((f, i) => {
          const detail = texts[i]!.slice(shared.length).trim();
          return {
            componentIds: f.componentIds,
            ...(detail && { detail }),
            ...(!sameEffect && effects[i] && { costEffect: effects[i] }),
          };
        }),
      };
    })
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
