import { copyFile, mkdir, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findSkillSource(): string {
  // Look for skills/pikr/SKILL.md relative to the package root
  const candidates = [
    resolve(__dirname, "../../skills/pikr/SKILL.md"),
    resolve(__dirname, "../../../skills/pikr/SKILL.md"),
  ];

  // We'll check at copy time; return best candidate
  return candidates[0];
}

export interface InstallSkillOptions {
  local: boolean;
}

export async function installSkill(options: InstallSkillOptions): Promise<string> {
  const targetDir = options.local
    ? join(process.cwd(), ".claude", "skills", "pikr")
    : join(homedir(), ".claude", "skills", "pikr");

  const targetPath = join(targetDir, "SKILL.md");
  const sourcePath = findSkillSource();

  // Check if source exists
  try {
    await access(sourcePath);
  } catch {
    throw new Error(
      `Skill file not found at ${sourcePath}. Is pikr installed correctly?`
    );
  }

  // Check if target already exists
  let overwriting = false;
  try {
    await access(targetPath);
    overwriting = true;
  } catch {
    // doesn't exist, fine
  }

  // Create directory and copy
  await mkdir(targetDir, { recursive: true });
  await copyFile(sourcePath, targetPath);

  if (overwriting) {
    console.error(`pikr: updated existing skill at ${targetPath}`);
  } else {
    console.error(`pikr: skill installed to ${targetPath}`);
  }

  return targetPath;
}
