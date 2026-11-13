import { z } from "zod";
import { InstallTargetSchema } from "./write-common";
import { SkillLoadResultSchema } from "./skill-import";

export const SkillRepositorySchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*$/, "Use owner/repository");
export const SkillCatalogRequestSchema = z.object({
  repository: SkillRepositorySchema,
});
export const SkillCatalogSchema = z.object({
  repository: z.string(),
  skills: z.array(SkillLoadResultSchema),
});
export const SkillSearchSchema = z.object({
  output: z.string(),
  results: z.array(z.object({ repository: z.string(), name: z.string() })),
});
export const SkillCreateSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(64),
  description: z.string().trim().min(1).max(1024),
  instructions: z.string().trim().min(1).max(100000),
  targets: z.array(InstallTargetSchema).min(1).max(10),
});
export const SkillUpdatesSchema = z.array(
  z.object({
    resourceId: z.string(),
    repository: z.string().nullable(),
    status: z.enum(["current", "available", "different", "untracked", "error"]),
    locallyModified: z.boolean(),
    message: z.string().nullable(),
  }),
);
