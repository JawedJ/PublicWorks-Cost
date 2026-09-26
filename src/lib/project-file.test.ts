import { describe, expect, it } from "vitest";
import { northgateProject } from "@/lib/fixtures";
import { CURRENT_SCHEMA_VERSION } from "@/lib/schemas";
import {
  parseProjectFile,
  projectFileName,
  serializeProject,
} from "./project-file";

describe("project file", () => {
  it("round-trips a project", () => {
    const parsed = parseProjectFile(serializeProject(northgateProject));
    expect(parsed).toEqual({ ok: true, project: northgateProject });
  });

  it("names the file from the project name", () => {
    expect(projectFileName("Northgate Neighbourhood Hub!")).toBe(
      "northgate-neighbourhood-hub.pwcost.json",
    );
    expect(projectFileName("Rénovation   rue Main")).toBe(
      "renovation-rue-main.pwcost.json",
    );
    expect(projectFileName("???")).toBe("project.pwcost.json");
  });

  it("gives a clear error for bad files", () => {
    expect(parseProjectFile("{nope")).toMatchObject({ error: "invalid_json" });
    expect(parseProjectFile("[1,2]")).toMatchObject({ error: "not_project" });
    expect(parseProjectFile('{"name":"x"}')).toMatchObject({
      error: "not_project",
    });
    const newer = {
      ...northgateProject,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    };
    expect(parseProjectFile(JSON.stringify(newer))).toMatchObject({
      error: "newer_version",
    });
    const broken = { ...northgateProject, name: "" };
    const r = parseProjectFile(JSON.stringify(broken));
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    expect(!r.ok && r.detail).toContain("name");
  });
});
