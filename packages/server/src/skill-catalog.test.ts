import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanSkillRoot } from "./scanner/skills";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { getAgentInfos } from "./services/agents";
import { listResourcesByKind } from "./services/resources";
import { scanProject } from "./scanner/scan";

test("repository containers discover individual skills and respect scan depth", async () => {
  const root = await mkdtemp(join(tmpdir(), "harbor-collection-"));
  try {
    for (const name of ["one", "two"]) {
      await mkdir(join(root, "collection", name), { recursive: true });
      await writeFile(
        join(root, "collection", name, "SKILL.md"),
        `---\nname: ${name}\ndescription: Test skill\n---\nInstructions`,
      );
    }
    const skills = await scanSkillRoot(root, {
      scanRoot: root,
      maxScanDepth: 8,
      ignoreGlobs: [],
    });
    expect(skills.map((s) => s.skill.name).sort()).toEqual(["one", "two"]);
    expect(skills.every((s) => s.skill.group === "collection")).toBe(true);
    const shallow = await scanSkillRoot(root, {
      scanRoot: root,
      maxScanDepth: 1,
      ignoreGlobs: [],
    });
    expect(shallow.some((s) => s.skill.name === "one")).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canonical shared skills count and filter for each linked agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "harbor-counts-"));
  const db = await createDb(join(root, "test.db"));
  try {
    await runMigrations(db);
    const skillDir = join(root, ".agents", "skills", "demo");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: demo\ndescription: Test\n---\nInstructions",
    );
    const { symlink } = await import("node:fs/promises");
    for (const agent of [".claude", ".codex"]) {
      await mkdir(join(root, agent, "skills"), { recursive: true });
      await symlink(skillDir, join(root, agent, "skills", "demo"));
    }
    const now = new Date().toISOString();
    await db.run("INSERT INTO projects (id, name, root_path, added_at) VALUES (?, ?, ?, ?)", [
      "p",
      "Test",
      root,
      now,
    ]);
    await scanProject(db, {
      id: "p",
      name: "Test",
      rootPath: root,
      addedAt: now,
      lastScannedAt: null,
      exists: true,
    });
    const skills = await listResourcesByKind(db, "skill", {
      scope: "project",
      projectId: "p",
    });
    expect(skills).toHaveLength(1);
    for (const agentId of ["claude-code", "codex"] as const) {
      expect(
        await listResourcesByKind(db, "skill", {
          scope: "project",
          projectId: "p",
          agentId,
        }),
      ).toHaveLength(1);
      const agents = await getAgentInfos(db, {
        scope: "project",
        projectId: "p",
      });
      expect(agents.find((a) => a.id === agentId)?.resourceCounts.skills).toBe(1);
    }
  } finally {
    await db.client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("directory results expose repository and skill selections", async () => {
  const { parseSkillSearch } = await import("./services/skill-catalog");
  expect(
    parseSkillSearch(
      "Install with npx skills add <owner/repo@skill>\n\nmattpocock/skills@tdd 100 installs\nhttps://skills.sh/mattpocock/skills/tdd\n",
    ).results,
  ).toEqual([{ repository: "mattpocock/skills", name: "tdd" }]);
});

test("creates, validates and installs a skill into an isolated project", async () => {
  const root = await mkdtemp(join(tmpdir(), "harbor-create-test-"));
  const db = await createDb(join(root, "test.db"));
  try {
    await runMigrations(db);
    const { createSkill } = await import("./services/skill-catalog");
    const { readFile } = await import("node:fs/promises");
    await db.run("INSERT INTO projects (id, name, root_path, added_at) VALUES (?, ?, ?, ?)", [
      "p",
      "Test",
      root,
      new Date().toISOString(),
    ]);
    const outcome = await createSkill(
      db,
      {
        name: "review-code",
        description: "Review: code\nUse for reviews",
        instructions: "Review the changes carefully.",
        targets: ["codex", "cursor", "gemini-cli", "shared"].map((agentId) => ({
          agentId: agentId as "codex" | "cursor" | "gemini-cli" | "shared",
          scope: "project",
          projectId: "p",
        })),
      },
      { stagingRoot: join(root, "staging") },
    );
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") throw new Error(outcome.message);
    expect(outcome.response.results.every((r) => r.ok)).toBe(true);
    expect(
      await readFile(join(root, ".codex", "skills", "review-code", "SKILL.md"), "utf8"),
    ).toContain("Review the changes carefully.");
    const repeated = await createSkill(
      db,
      {
        name: "review-code",
        description: "Replacement",
        instructions: "Changed instructions.",
        targets: [{ agentId: "codex", scope: "project", projectId: "p" }],
      },
      { stagingRoot: join(root, "staging") },
    );
    expect(repeated.status === "ok" && repeated.response.results[0]?.ok).toBe(false);
    expect(
      await readFile(join(root, ".codex", "skills", "review-code", "SKILL.md"), "utf8"),
    ).toContain("Review the changes carefully.");
  } finally {
    await db.client.close();
    await rm(root, { recursive: true, force: true });
  }
});
