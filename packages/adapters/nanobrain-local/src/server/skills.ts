import fs from "node:fs/promises";
import path from "node:path";
import type {
  AdapterSkillContext,
  AdapterSkillEntry,
  AdapterSkillSnapshot,
} from "@paperclipai/adapter-utils";
import { asString, readPaperclipRuntimeSkillEntries } from "@paperclipai/adapter-utils/server-utils";

export async function listNanobotSkills(
  ctx: AdapterSkillContext,
): Promise<AdapterSkillSnapshot> {
  const cwd = asString(ctx.config.cwd, process.cwd());
  const skillsDir = path.join(cwd, "skills");
  const entries: AdapterSkillEntry[] = [];
  const warnings: string[] = [];

  try {
    const files = await fs.readdir(skillsDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const key = file.replace(/\.md$/, "");
      entries.push({
        key,
        runtimeName: file,
        desired: true,
        managed: false,
        state: "installed",
        origin: "external_unknown",
        sourcePath: path.join(skillsDir, file),
      });
    }
  } catch {
    warnings.push(`Skills directory not found: ${skillsDir}`);
  }

  // Also list Paperclip-managed skills
  try {
    const paperclipEntries = await readPaperclipRuntimeSkillEntries(ctx.config, "");
    for (const entry of paperclipEntries) {
      if (!entries.some((e) => e.key === entry.key)) {
        entries.push({
          key: entry.key,
          runtimeName: entry.runtimeName,
          desired: true,
          managed: true,
          state: "available",
          origin: "company_managed",
          sourcePath: entry.source,
        });
      }
    }
  } catch {
    // No Paperclip skills available
  }

  return {
    adapterType: "nanobrain_local",
    supported: true,
    mode: "ephemeral",
    desiredSkills: entries.filter((e) => e.desired).map((e) => e.key),
    entries,
    warnings,
  };
}

export async function syncNanobotSkills(
  ctx: AdapterSkillContext,
  desiredSkills: string[],
): Promise<AdapterSkillSnapshot> {
  const snapshot = await listNanobotSkills(ctx);
  const desiredSet = new Set(desiredSkills);

  // Mark desired state
  for (const entry of snapshot.entries) {
    entry.desired = desiredSet.has(entry.key);
  }
  snapshot.desiredSkills = desiredSkills;

  return snapshot;
}
