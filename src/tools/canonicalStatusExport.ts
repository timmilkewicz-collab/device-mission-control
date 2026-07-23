import { spawnSync } from "node:child_process";
import { loadMissionControlEnv, resolveMissionControlHubUrl } from "../shared/env";
import { publishCanonicalBrief } from "../application/publishCanonicalBrief";

function parseArgs(argv: string[]) {
  return {
    noWrite: argv.includes("--no-write"),
    refreshNetwork: argv.includes("--refresh-network"),
    jsonOnly: argv.includes("--json")
  };
}

function runRefreshRitual(cwd: string): void {
  for (const script of ["sync:tailscale", "verify:tailscale"]) {
    const result = spawnSync("npm", ["run", script], {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: true
    });
    if (result.status !== 0) {
      console.warn(`Warning: ${script} exited with code ${result.status ?? "unknown"}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const loadedEnvFiles = loadMissionControlEnv();

  if (args.refreshNetwork) {
    runRefreshRitual(process.cwd());
  }

  const result = await publishCanonicalBrief({
    cwd: process.cwd(),
    tokenPresent: Boolean(process.env.MISSION_CONTROL_TOKEN?.trim()),
    host: process.env.MISSION_CONTROL_HOST?.trim() || "127.0.0.1",
    hubUrl: resolveMissionControlHubUrl(process.env),
    noWrite: args.noWrite
  });

  if (args.jsonOnly) {
    console.log(JSON.stringify(result.snapshot, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        generatedAtUtc: result.snapshot.generatedAtUtc,
        canonicalResolved: result.snapshot.canonicalResolved,
        canonicalRoot: result.snapshot.canonicalRoot,
        markdownPath: result.markdownPath,
        logPath: result.logPath,
        counts: result.snapshot.counts,
        hubReachable: result.snapshot.hub.reachable,
        loadedEnvFiles
      },
      null,
      2
    )
  );

  if (!result.markdownPath) {
    console.warn(
      "CANONICAL export skipped: root not resolved or --no-write set. Markdown printed to stdout for inspection."
    );
    console.log(result.markdown);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
