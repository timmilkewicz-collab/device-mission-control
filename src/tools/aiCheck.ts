import fs from "node:fs";
import path from "node:path";

type RequiredPath = {
  path: string;
  kind: "file" | "directory";
};

const requiredPaths: RequiredPath[] = [
  { path: "AGENTS.md", kind: "file" },
  { path: path.join("docs", "ai", "README.md"), kind: "file" },
  { path: path.join("docs", "ai", "current-state.md"), kind: "file" },
  { path: path.join("docs", "ai", "project-context.md"), kind: "file" },
  { path: path.join("docs", "ai", "decision-records"), kind: "directory" },
  { path: path.join("docs", "ai", "handoffs"), kind: "directory" },
  { path: path.join("docs", "ai", "runbooks"), kind: "directory" }
];

function checkPath(cwd: string, requiredPath: RequiredPath): string | undefined {
  const fullPath = path.join(cwd, requiredPath.path);
  if (!fs.existsSync(fullPath)) {
    return `Missing ${requiredPath.kind}: ${requiredPath.path}`;
  }

  const stat = fs.statSync(fullPath);
  if (requiredPath.kind === "file" && !stat.isFile()) {
    return `Expected file: ${requiredPath.path}`;
  }

  if (requiredPath.kind === "directory" && !stat.isDirectory()) {
    return `Expected directory: ${requiredPath.path}`;
  }

  return undefined;
}

function main(): void {
  const cwd = process.cwd();
  const failures = requiredPaths.map((entry) => checkPath(cwd, entry)).filter((entry): entry is string => Boolean(entry));
  const agentsPath = path.join(cwd, "AGENTS.md");
  const agentsText = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf8") : "";

  for (const requiredRole of ["Planner Agent", "Builder Agent", "QA Agent", "Librarian Agent"]) {
    if (!agentsText.includes(requiredRole)) {
      failures.push(`AGENTS.md is missing role section: ${requiredRole}`);
    }
  }

  if (failures.length > 0) {
    console.error("AI memory check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("AI memory check passed.");
}

main();
