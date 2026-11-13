import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SkillRepositorySchema, type SkillResource } from "@harbor/shared";
import type { Db } from "../db/client";

/** Read provenance only; never change the skills CLI's lockfiles. */
export async function skillOrigin(
  db: Db,
  resource: Pick<SkillResource, "path" | "scope" | "projectId">,
  name: string | null,
) {
  const audit = await db.get<{ source_json: string; content_hash: string }>(
    "SELECT source_json, content_hash FROM skill_installs WHERE installed_path = ? ORDER BY created_at DESC LIMIT 1",
    [resource.path],
  );
  if (audit) {
    const source = JSON.parse(audit.source_json);
    if (SkillRepositorySchema.safeParse(source.repository).success)
      return {
        repository: source.repository as string,
        baseline: audit.content_hash,
      };
  }
  if (!name) return null;
  let lockPath = process.env.XDG_STATE_HOME
    ? join(process.env.XDG_STATE_HOME, "skills", ".skill-lock.json")
    : join(homedir(), ".agents", ".skill-lock.json");
  if (resource.scope === "project") {
    const project = await db.get<{ root_path: string }>(
      "SELECT root_path FROM projects WHERE id = ?",
      [resource.projectId],
    );
    if (!project) return null;
    lockPath = join(project.root_path, "skills-lock.json");
  }
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    const entry = lock.skills?.[name];
    if (entry?.sourceType === "github" && SkillRepositorySchema.safeParse(entry.source).success)
      return { repository: entry.source as string, baseline: null };
  } catch {
    /* Missing or unsupported lockfiles are untracked. */
  }
  return null;
}
