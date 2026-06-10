/**
 * Bridge GitHub PR review/CI context into Mission Control council sessions.
 *
 * Example:
 *   MISSION_CONTROL_GITHUB_REPOS=owner/repo npm run github:council -- --dry-run
 */

import { loadMissionControlEnv } from "../shared/env";
import { parseGitHubRepoList, runGitHubCouncilBridge } from "../hub/githubCouncilBridge";

type CliArgs = {
  repos: string[];
  dryRun: boolean;
  json: boolean;
  limit?: number;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repos: [],
    dryRun: false,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--repo": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--repo requires an owner/repo value.");
        }
        args.repos.push(value);
        index += 1;
        break;
      }
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--limit": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--limit requires a positive number.");
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`Invalid --limit value: ${value}`);
        }
        args.limit = parsed;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parseEnvLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function main(): Promise<void> {
  loadMissionControlEnv();
  const args = parseArgs(process.argv.slice(2));
  const repoSource =
    args.repos.length > 0
      ? args.repos.join(",")
      : process.env.MISSION_CONTROL_GITHUB_REPOS?.trim() || process.env.GITHUB_REPOSITORY?.trim();
  const repos = parseGitHubRepoList(repoSource);
  const result = await runGitHubCouncilBridge({
    repos,
    githubToken:
      process.env.MISSION_CONTROL_GITHUB_TOKEN?.trim() ||
      process.env.GITHUB_TOKEN?.trim() ||
      process.env.GH_TOKEN?.trim() ||
      undefined,
    githubApiBase: process.env.MISSION_CONTROL_GITHUB_API_BASE?.trim() || undefined,
    hubUrl: process.env.MISSION_CONTROL_HUB_URL?.trim() || "http://localhost:8787",
    missionControlToken: process.env.MISSION_CONTROL_TOKEN?.trim() || undefined,
    maxPullRequests: args.limit ?? parseEnvLimit(process.env.MISSION_CONTROL_GITHUB_MAX_PRS),
    dryRun: args.dryRun,
    requestedBy: "github-council-bridge"
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        processedPullRequests: result.processedPullRequests,
        createdSessions: result.createdSessions,
        addedResponses: result.addedResponses,
        plannedTopics: result.plannedSessions.map((session) => session.topic),
        errors: result.errors
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
