import { skillOrigin } from "./skill-origin";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { z } from "zod";
import {
  SkillRepositorySchema,
  type SkillCreateSchema,
  type SkillResource,
  type SkillUpdatesSchema,
} from "@harbor/shared";
import type { Db } from "../db/client";
import {
  defaultStagingRoot,
  loadSkill,
  installStaged,
  SkillImportError,
  type LoadSkillOptions,
} from "./skill-import";
import { hashDir } from "../lib/hash";
import { listResourcesByKind } from "./resources";

// The CLI only writes into a disposable workspace. Real installations always use Harbor's guards.
export async function runSkills(args: string[], cwd: string): Promise<string> {
  const npx = Bun.which("npx");
  if (!npx)
    throw new SkillImportError(
      "Install Node.js and npx on the daemon host to use the skills directory.",
    );
  const proc = Bun.spawn([npx, "--yes", "skills", ...args], {
    cwd,
    env: { ...process.env, CI: "1", NO_COLOR: "1", DISABLE_TELEMETRY: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => proc.kill(), 120000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0)
      throw new SkillImportError(
        (stderr || stdout || "Skills command failed or timed out").slice(-8000),
      );
    return stdout.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 50000);
  } finally {
    clearTimeout(timeout);
  }
}

export async function browseRepository(db: Db, repository: string) {
  SkillRepositorySchema.parse(repository);
  const workspace = await mkdtemp(join(tmpdir(), "harbor-catalog-"));
  const skills = [];
  try {
    await runSkills(
      ["add", repository, "--skill", "*", "--agent", "claude-code", "--copy", "--yes"],
      workspace,
    );
    const root = join(workspace, ".claude", "skills");
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || skills.length >= 100) continue;
      const loaded = await loadSkill(db, {
        kind: "localFolder",
        path: join(root, entry.name),
      });
      const metaPath = join(defaultStagingRoot(), loaded.stagingId, "meta.json");
      const meta = JSON.parse(await readFile(metaPath, "utf8"));
      await writeFile(metaPath, JSON.stringify({ ...meta, repository }));
      skills.push(loaded);
    }
    return { repository, skills };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function createSkill(
  db: Db,
  input: z.infer<typeof SkillCreateSchema>,
  options?: LoadSkillOptions,
) {
  const workspace = await mkdtemp(join(tmpdir(), "harbor-create-"));
  try {
    await writeFile(
      join(workspace, "SKILL.md"),
      `---\nname: ${input.name}\ndescription: ${JSON.stringify(input.description)}\n---\n\n${input.instructions}\n`,
    );
    const staged = await loadSkill(db, { kind: "localFolder", path: workspace }, options);
    const metaPath = join(
      options?.stagingRoot ?? defaultStagingRoot(),
      staged.stagingId,
      "meta.json",
    );
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    await writeFile(metaPath, JSON.stringify({ ...meta, created: true }));
    return await installStaged(
      db,
      { stagingId: staged.stagingId, targets: input.targets },
      options,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function checkSkillUpdates(
  db: Db,
  filters: { scope?: "global" | "project"; projectId?: string },
) {
  const resources = (await listResourcesByKind(db, "skill", filters)) as SkillResource[];
  const catalogs = new Map<string, Awaited<ReturnType<typeof browseRepository>>>();
  const results: z.infer<typeof SkillUpdatesSchema> = [];
  const failures = new Map<string, string>();
  try {
    for (const resource of resources) {
      let repository: string | null = null;
      try {
        const origin = await skillOrigin(db, resource, resource.skill.name);
        repository = origin?.repository ?? null;
        if (!repository) {
          results.push({
            resourceId: resource.id,
            repository,
            status: "untracked",
            locallyModified: false,
            message:
              "No repository recorded. Local skills cannot be checked against an upstream source.",
          });
          continue;
        }
        if (failures.has(repository)) throw new Error(failures.get(repository));
        let catalog = catalogs.get(repository);
        if (!catalog) {
          try {
            catalog = await browseRepository(db, repository);
            catalogs.set(repository, catalog);
          } catch (error) {
            failures.set(repository, error instanceof Error ? error.message : String(error));
            throw error;
          }
        }
        const upstream = catalog.skills.find((s) => s.name === resource.skill.name);
        if (!upstream) throw new Error("Skill no longer found in repository");
        const remoteHash = (await hashDir(join(defaultStagingRoot(), upstream.stagingId, "skill")))
          .dirHash;
        const localHash = (await hashDir(resource.path)).dirHash;
        results.push({
          resourceId: resource.id,
          repository,
          status:
            remoteHash === (origin?.baseline ?? localHash)
              ? "current"
              : origin?.baseline
                ? "available"
                : "different",
          locallyModified: origin?.baseline ? localHash !== origin.baseline : false,
          message: origin?.baseline
            ? null
            : "Compared with installed files; no baseline is available to distinguish local edits.",
        });
      } catch (error) {
        results.push({
          resourceId: resource.id,
          repository,
          status: "error",
          locallyModified: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  } finally {
    for (const catalog of catalogs.values())
      for (const skill of catalog.skills)
        await rm(join(defaultStagingRoot(), skill.stagingId), {
          recursive: true,
          force: true,
        });
  }
}

export function parseSkillSearch(output: string) {
  const results = new Map<string, { repository: string; name: string }>();
  for (const match of output.matchAll(/^([\w.-]+\/[\w.-]+)@([\w.-]+)/gm)) {
    results.set(`${match[1]}@${match[2]}`, {
      repository: match[1]!,
      name: match[2]!,
    });
  }
  return { output, results: [...results.values()] };
}
