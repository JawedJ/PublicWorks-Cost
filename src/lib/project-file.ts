import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  ProjectSchema,
} from "@/lib/schemas";

// P4.1–P4.2 (SPEC 15): the project file is the full Project as JSON
// (`<name>.pwcost.json`). It's the only way to keep work; nothing is stored.

export const PROJECT_FILE_EXTENSION = ".pwcost.json";
const MAX_BYTES = 20 * 1024 * 1024;

export type ProjectFileError =
  "too_large" | "invalid_json" | "not_project" | "newer_version" | "invalid";

export type ParsedProjectFile =
  | { ok: true; project: Project }
  | { ok: false; error: ProjectFileError; detail?: string };

export function serializeProject(project: Project): string {
  return JSON.stringify(
    { ...project, schemaVersion: CURRENT_SCHEMA_VERSION },
    null,
    2,
  );
}

/** "Northgate hub!" → "northgate-hub.pwcost.json". */
export function projectFileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "project"}${PROJECT_FILE_EXTENSION}`;
}

export function parseProjectFile(text: string): ParsedProjectFile {
  if (text.length > MAX_BYTES) return { ok: false, error: "too_large" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as { schemaVersion?: unknown }).schemaVersion !== "number"
  )
    return { ok: false, error: "not_project" };
  const version = (data as { schemaVersion: number }).schemaVersion;
  if (version > CURRENT_SCHEMA_VERSION)
    return { ok: false, error: "newer_version", detail: String(version) };
  // Older versions: no migrations yet (only v1 exists); validation decides.
  const result = ProjectSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: "invalid",
      detail: issue
        ? `${issue.path.join(".") || "(root)"}: ${issue.message}`
        : undefined,
    };
  }
  return { ok: true, project: result.data };
}
