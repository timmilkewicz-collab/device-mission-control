import { execFileSync } from "node:child_process";

export function readGhCliAuthToken(): string | undefined {
  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

export function resolveGitHubAuthToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const preferGhCli = env.MISSION_CONTROL_GITHUB_PREFER_GH_CLI === "1";
  const candidates = preferGhCli
    ? [readGhCliAuthToken(), env.MISSION_CONTROL_GITHUB_TOKEN, env.GITHUB_TOKEN, env.GH_TOKEN]
    : [env.MISSION_CONTROL_GITHUB_TOKEN, env.GITHUB_TOKEN, env.GH_TOKEN, readGhCliAuthToken()];

  for (const candidate of candidates) {
    const token = candidate?.trim();
    if (token) {
      return token;
    }
  }

  return undefined;
}
