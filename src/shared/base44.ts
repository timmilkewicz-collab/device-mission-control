import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Base44Config = {
  appId: string;
  apiBase: string;
  apiKey: string;
  source: string[];
};

export type Base44EntityRecord = Record<string, unknown> & {
  id?: string;
  created_date?: string;
  updated_date?: string;
  created_by?: string;
};

export type Base44UserRecord = {
  id?: string;
  email?: string;
  full_name?: string;
  role?: "admin" | "user";
  created_date?: string;
  updated_date?: string;
  created_by?: string;
};

const BASE44_ENV_FILES = [".env.example", ".env", ".env.local"];
const BASE44_ENV_FILE_VAR = "BASE44_ENV_FILE";

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
  const configuredEnvFile = env[BASE44_ENV_FILE_VAR]?.trim();
  if (!configuredEnvFile) {
    return BASE44_ENV_FILES;
  }

  const resolved = path.isAbsolute(configuredEnvFile)
    ? configuredEnvFile
    : path.join(cwd, configuredEnvFile);

  return [resolved, ...BASE44_ENV_FILES];
}

function readLocalEnv(
  cwd: string,
  env: NodeJS.ProcessEnv
): { values: Record<string, string>; source: string[] } {
  const values: Record<string, string> = {};
  const source: string[] = [];

  for (const envFile of resolveEnvFiles(cwd, env)) {
    const envPath = path.isAbsolute(envFile) ? envFile : path.join(cwd, envFile);
    if (!existsSync(envPath)) {
      continue;
    }

    Object.assign(values, parseEnvFile(readFileSync(envPath, "utf8")));
    source.push(path.relative(cwd, envPath) || envPath);
  }

  return { values, source };
}

export function loadBase44Config(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): Base44Config {
  const localEnv = readLocalEnv(cwd, env);
  const merged = { ...localEnv.values, ...env };
  const source = [...localEnv.source];

  if (env.BASE44_APP_ID || env.BASE44_API_BASE || env.BASE44_API_KEY || env[BASE44_ENV_FILE_VAR]) {
    source.push("process.env");
  }

  const appId = merged.BASE44_APP_ID?.trim();
  const apiBase = merged.BASE44_API_BASE?.trim();
  const apiKey = merged.BASE44_API_KEY?.trim();

  if (!appId) {
    throw new Error("Missing BASE44_APP_ID. Add it to your local .env or environment.");
  }

  if (!apiBase) {
    throw new Error("Missing BASE44_API_BASE. Add it to your local .env or environment.");
  }

  if (!apiKey) {
    throw new Error("Missing BASE44_API_KEY. Add it to your local .env or environment.");
  }

  return {
    appId,
    apiBase,
    apiKey,
    source: source.length > 0 ? Array.from(new Set(source)) : ["process.env"]
  };
}

export function redactSecret(secret: string): string {
  if (secret.length <= 8) {
    return "*".repeat(secret.length);
  }

  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

export function fingerprintSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

export function isPlaceholderSecret(secret: string): boolean {
  return secret.includes("replace-after-rotating") || secret.includes("your_new_rotated_key_here");
}

export function buildBase44AuthHeaders(config: Base44Config): Record<string, string> {
  return {
    api_key: config.apiKey
  };
}

export type Base44ListOptions = {
  limit?: number;
  skip?: number;
  sortBy?: string;
  query?: Record<string, unknown>;
};

export async function listBase44Entities<T extends Base44EntityRecord = Base44EntityRecord>(
  config: Base44Config,
  entityName: string,
  options: Base44ListOptions = {}
): Promise<T[]> {
  const url = new URL(`${config.apiBase}/entities/${entityName}`);

  if (options.limit !== undefined) {
    url.searchParams.set("limit", String(options.limit));
  }

  if (options.skip !== undefined) {
    url.searchParams.set("skip", String(options.skip));
  }

  if (options.sortBy) {
    url.searchParams.set("sort_by", options.sortBy);
  }

  if (options.query && Object.keys(options.query).length > 0) {
    url.searchParams.set("q", JSON.stringify(options.query));
  }

  const response = await fetch(url, {
    headers: buildBase44AuthHeaders(config)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Base44 entity lookup failed for ${entityName} (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as T[] | { items?: T[] };
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

export async function listBase44Users(config: Base44Config, limit = 100): Promise<Base44UserRecord[]> {
  return listBase44Entities<Base44UserRecord>(config, "User", {
    limit,
    sortBy: "full_name"
  });
}

export function writeBase44SecuritySnapshot(
  cwd: string,
  config: Base44Config,
  userCount?: number
): string {
  const targetDir = path.join(cwd, ".mission-control", "data");
  mkdirSync(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, "base44-security-status.json");
  const payload = {
    checkedAt: new Date().toISOString(),
    appId: config.appId,
    apiBase: config.apiBase,
    envSources: config.source,
    apiKeyRedacted: redactSecret(config.apiKey),
    apiKeyFingerprint: fingerprintSecret(config.apiKey),
    apiKeyLooksPlaceholder: isPlaceholderSecret(config.apiKey),
    userCount
  };

  writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return targetPath;
}
