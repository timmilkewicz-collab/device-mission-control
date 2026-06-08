import { spawnSync } from "node:child_process";
import path from "node:path";
import { isPlaceholderSecret, loadBase44Config } from "../shared/base44";

export type Base44RefreshTarget = {
  appId: string;
  apiBase: string;
  limit?: number;
  sortBy?: string;
};

export type Base44PeekRefreshTarget = Base44RefreshTarget & {
  entity: string;
  query?: Record<string, unknown>;
  requestedFields?: string[];
};

export type Base44RefreshResult = {
  command: string;
  appId: string;
  apiBase: string;
  entity?: string;
  snapshotPath?: string;
  stdout: string;
  stderr: string;
};

function parsePositiveInt(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid numeric override: ${value}`);
  }

  return String(Math.floor(value));
}

function compactEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const compacted: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      compacted[key] = value;
    }
  }

  return compacted;
}

function buildBase44Env(cwd: string, target: Base44RefreshTarget, extras: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const validationEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BASE44_APP_ID: target.appId,
    BASE44_API_BASE: target.apiBase,
    ...extras
  };

  const config = loadBase44Config(cwd, validationEnv);
  if (isPlaceholderSecret(config.apiKey)) {
    throw new Error("BASE44_API_KEY still looks like a placeholder in local env. Update it before running Base44 refresh actions.");
  }

  return compactEnv({
    ...process.env,
    ...extras,
    BASE44_APP_ID: target.appId,
    BASE44_API_BASE: target.apiBase,
    BASE44_API_KEY: config.apiKey
  });
}

function runBase44Command(cwd: string, env: NodeJS.ProcessEnv, metadata: Omit<Base44RefreshResult, "stdout" | "stderr">): Base44RefreshResult {
  const tsxCliPath = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
  const scriptName = metadata.command === "base44:inventory" ? "base44Inventory.ts" : "base44Peek.ts";
  const scriptPath = path.join(cwd, "src", "tools", scriptName);
  const toolArgs = metadata.command === "base44:peek" && metadata.entity ? [metadata.entity] : [];

  const result = spawnSync(process.execPath, [tsxCliPath, scriptPath, ...toolArgs], {
    cwd,
    env,
    encoding: "utf8"
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `Base44 command failed with exit code ${result.status}`);
  }

  const snapshotMatch = stdout.match(/^- snapshot: (.+)$/m);

  return {
    ...metadata,
    snapshotPath: snapshotMatch?.[1]?.trim() || metadata.snapshotPath,
    stdout,
    stderr
  };
}

export function refreshBase44Inventory(cwd: string, target: Base44RefreshTarget): Base44RefreshResult {
  const env = buildBase44Env(cwd, target, {
    BASE44_LIMIT: parsePositiveInt(target.limit),
    BASE44_SORT_BY: target.sortBy
  });

  return runBase44Command(cwd, env, {
    command: "base44:inventory",
    appId: target.appId,
    apiBase: target.apiBase
  });
}

export function refreshBase44Peek(cwd: string, target: Base44PeekRefreshTarget): Base44RefreshResult {
  const entity = target.entity.trim();
  if (!entity) {
    throw new Error("Base44 peek refresh requires an entity name.");
  }

  const env = buildBase44Env(cwd, target, {
    BASE44_LIMIT: parsePositiveInt(target.limit),
    BASE44_SORT_BY: target.sortBy,
    BASE44_QUERY: target.query ? JSON.stringify(target.query) : undefined,
    BASE44_FIELDS: target.requestedFields && target.requestedFields.length > 0 ? target.requestedFields.join(",") : undefined
  });

  return runBase44Command(cwd, env, {
    command: "base44:peek",
    appId: target.appId,
    apiBase: target.apiBase,
    entity
  });
}
