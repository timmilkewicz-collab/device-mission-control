import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENV_FILES = [".env.local", ".env"];

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function resolveEnvFiles(cwd: string, env: NodeJS.ProcessEnv): string[] {
  const configured = env.MISSION_CONTROL_ENV_FILE?.trim();
  if (!configured) {
    return DEFAULT_ENV_FILES.map((fileName) => path.join(cwd, fileName));
  }

  const resolved = path.isAbsolute(configured) ? configured : path.join(cwd, configured);
  return [resolved, ...DEFAULT_ENV_FILES.map((fileName) => path.join(cwd, fileName))];
}

export function loadMissionControlEnv(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = [];

  for (const envPath of resolveEnvFiles(cwd, env)) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const values = parseEnvFile(fs.readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (env[key] === undefined) {
        env[key] = value;
      }
    }
    loaded.push(path.relative(cwd, envPath) || envPath);
  }

  return Array.from(new Set(loaded));
}
