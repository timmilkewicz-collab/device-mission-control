import fs from "node:fs";
import path from "node:path";

export type AiRole = {
  name: string;
  purpose: string;
};

export type AiRecordKind = "decision" | "handoff" | "runbook";

export type AiMemoryRecord = {
  kind: AiRecordKind;
  title: string;
  path: string;
  updatedAt: string;
  summary?: string;
};

export type AiMemoryOverview = {
  docsRoot: string;
  agentContractPath: string;
  defaultLoop: string[];
  roles: AiRole[];
  currentState?: {
    path: string;
    title: string;
    summary?: string;
    updatedAt: string;
  };
  projectContext?: {
    path: string;
    title: string;
    summary?: string;
    updatedAt: string;
  };
  records: Record<AiRecordKind, AiMemoryRecord[]>;
};

export const aiRecordKinds: AiRecordKind[] = ["decision", "handoff", "runbook"];

export const defaultAgentLoop = ["Planner", "Builder", "QA", "Librarian"];

export const agentRoles: AiRole[] = [
  { name: "Planner", purpose: "Clarifies scope, risks, and the smallest useful plan." },
  { name: "Builder", purpose: "Implements focused code or documentation changes." },
  { name: "QA", purpose: "Verifies behavior, tests assumptions, and reports gaps." },
  { name: "Librarian", purpose: "Keeps durable AI memory accurate, concise, and usable." },
  { name: "Release Manager", purpose: "Prepares changes for merge, deployment, or public release." },
  { name: "Architecture Reviewer", purpose: "Keeps modules, persistence, and workflows coherent as they grow." },
  { name: "Environment and DevOps", purpose: "Maintains setup, CI/CD, deployment, and infrastructure notes." }
];

function isRecordKind(value: string | undefined): value is AiRecordKind {
  return value === "decision" || value === "handoff" || value === "runbook";
}

function recordDirForKind(kind: AiRecordKind): string {
  switch (kind) {
    case "decision":
      return "decision-records";
    case "handoff":
      return "handoffs";
    case "runbook":
      return "runbooks";
  }
}

function readMarkdownSummary(filePath: string): { title: string; summary?: string; updatedAt: string } | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const stat = fs.statSync(filePath);
  const contents = fs.readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/);
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() || path.basename(filePath);
  const summary = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("#") && !trimmed.startsWith("Date:") && !trimmed.startsWith("Status:");
  });

  return {
    title,
    summary: summary?.trim(),
    updatedAt: stat.mtime.toISOString()
  };
}

export function listAiMemoryRecords(
  kind: AiRecordKind,
  docsRoot: string = path.join(process.cwd(), "docs", "ai")
): AiMemoryRecord[] {
  const folder = path.join(docsRoot, recordDirForKind(kind));
  if (!fs.existsSync(folder)) {
    return [];
  }

  return fs
    .readdirSync(folder)
    .filter((fileName) => fileName.endsWith(".md") && fileName.toLowerCase() !== "readme.md")
    .map((fileName): AiMemoryRecord | undefined => {
      const filePath = path.join(folder, fileName);
      const summary = readMarkdownSummary(filePath);
      if (!summary) {
        return undefined;
      }

      const record: AiMemoryRecord = {
        kind,
        title: summary.title,
        path: filePath,
        updatedAt: summary.updatedAt
      };

      if (summary.summary) {
        record.summary = summary.summary;
      }

      return record;
    })
    .filter((record): record is AiMemoryRecord => Boolean(record))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title));
}

export function listAiMemoryRecordsByQuery(
  kind: string | undefined,
  docsRoot: string = path.join(process.cwd(), "docs", "ai")
): AiMemoryRecord[] {
  if (!isRecordKind(kind)) {
    return [];
  }

  return listAiMemoryRecords(kind, docsRoot);
}

export function getAiMemoryOverview(docsRoot: string = path.join(process.cwd(), "docs", "ai")): AiMemoryOverview {
  const currentStatePath = path.join(docsRoot, "current-state.md");
  const projectContextPath = path.join(docsRoot, "project-context.md");
  const currentState = readMarkdownSummary(currentStatePath);
  const projectContext = readMarkdownSummary(projectContextPath);

  return {
    docsRoot,
    agentContractPath: path.join(process.cwd(), "AGENTS.md"),
    defaultLoop: defaultAgentLoop,
    roles: agentRoles,
    currentState: currentState
      ? {
          path: currentStatePath,
          title: currentState.title,
          summary: currentState.summary,
          updatedAt: currentState.updatedAt
        }
      : undefined,
    projectContext: projectContext
      ? {
          path: projectContextPath,
          title: projectContext.title,
          summary: projectContext.summary,
          updatedAt: projectContext.updatedAt
        }
      : undefined,
    records: {
      decision: listAiMemoryRecords("decision", docsRoot),
      handoff: listAiMemoryRecords("handoff", docsRoot),
      runbook: listAiMemoryRecords("runbook", docsRoot)
    }
  };
}
