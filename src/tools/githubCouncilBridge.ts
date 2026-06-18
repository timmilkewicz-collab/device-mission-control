/**
 * Bridge GitHub PR review/CI context into Mission Control council sessions.
 *
 * Example:
 *   MISSION_CONTROL_GITHUB_ORG=timmilkewicz-collab npm run github:council -- --dry-run
 */

import { loadMissionControlEnv } from "../shared/env";
import { resolveGitHubAuthToken } from "../shared/githubAuth";
import {
  resolveGitHubCouncilRepos,
  runGitHubCouncilBridge,
} from "../hub/githubCouncilBridge";

type CliArgs = {
  repos: string[];
  orgs: string[];
  dryRun: boolean;
  json: boolean;
  limit?: number;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repos: [],
    orgs: [],
    dryRun: false,
    json: false,
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
      case "--org": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("--org requires an organization name.");
        }
        args.orgs.push(value);
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

function joinList(values: string[]): string | undefined {
  return values.length > 0 ? values.join(",") : undefined;
}

async function main(): Promise<void> {
  loadMissionControlEnv();
  const args = parseArgs(process.argv.slice(2));
  const repoSource =
    joinList(args.repos) ||
    process.env.MISSION_CONTROL_GITHUB_REPOS?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim();
  const orgSource =
    joinList(args.orgs) || process.env.MISSION_CONTROL_GITHUB_ORG?.trim() || process.env.MISSION_CONTROL_GITHUB_ORGS?.trim();
  const excludeSource = process.env.MISSION_CONTROL_GITHUB_EXCLUDE_REPOS?.trim();
  const githubToken = resolveGitHubAuthToken();
  const githubApiBase = process.env.MISSION_CONTROL_GITHUB_API_BASE?.trim() || undefined;

  const resolved = await resolveGitHubCouncilRepos({
    repoList: repoSource,
    orgList: orgSource,
    excludeList: excludeSource,
    githubToken,
    githubApiBase,
    includeForks: process.env.MISSION_CONTROL_GITHUB_INCLUDE_FORKS === "1",
    includeArchived: process.env.MISSION_CONTROL_GITHUB_INCLUDE_ARCHIVED === "1",
  });

  if (resolved.repos.length === 0) {
    const detail =
      resolved.errors.length > 0
        ? resolved.errors.map((entry) => `${entry.scope}: ${entry.message}`).join("; ")
        : "No repositories matched MISSION_CONTROL_GITHUB_REPOS / MISSION_CONTROL_GITHUB_ORG.";
    throw new Error(detail);
  }

  const result = await runGitHubCouncilBridge({
    repos: resolved.repos,
    githubToken,
    githubApiBase,
    hubUrl: process.env.MISSION_CONTROL_HUB_URL?.trim() || "http://localhost:8787",
    missionControlToken: process.env.MISSION_CONTROL_TOKEN?.trim() || undefined,
    maxPullRequests: args.limit ?? parseEnvLimit(process.env.MISSION_CONTROL_GITHUB_MAX_PRS),
    dryRun: args.dryRun,
    requestedBy: "github-council-bridge",
  });

  const payload = {
    dryRun: result.dryRun,
    resolvedRepos: resolved.repos.map((repo) => repo.slug),
    processedPullRequests: result.processedPullRequests,
    createdSessions: result.createdSessions,
    addedResponses: result.addedResponses,
    plannedTopics: result.plannedSessions.map((session) => session.topic),
    errors: [...resolved.errors, ...result.errors],
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
