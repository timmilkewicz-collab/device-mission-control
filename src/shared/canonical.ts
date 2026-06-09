import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveCanonicalRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured =
    env.MISSION_CONTROL_CANONICAL_ROOT?.trim() || env.CANONICAL_ROOT?.trim() || "";
  if (configured && fs.existsSync(configured)) {
    return path.resolve(configured);
  }

  const dropboxDefault = path.join(os.homedir(), "Dropbox", "CANONICAL");
  if (fs.existsSync(dropboxDefault)) {
    return dropboxDefault;
  }

  return configured || null;
}

export function resolveServicesManifestPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.MISSION_CONTROL_SERVICES_MANIFEST_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }

  const canonicalRoot = resolveCanonicalRoot(env);
  if (!canonicalRoot) {
    return null;
  }

  const candidates = [
    path.join(canonicalRoot, "02_PROJECTS", "TIM_PRIVATE", ".github", "services.manifest"),
    path.join(canonicalRoot, "30_CODE", "device-mission-control", "services.manifest")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? null;
}
