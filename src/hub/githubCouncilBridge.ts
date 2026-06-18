import { CouncilResponseInput, CouncilSessionInput } from "../shared/types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GitHubRepoRef = {
  owner: string;
  repo: string;
  slug: string;
};

export type GitHubPullRequest = {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  user?: {
    login?: string;
  };
  head: {
    ref: string;
    sha: string;
    repo?: {
      full_name?: string | null;
    } | null;
  };
  base: {
    ref: string;
    sha?: string;
  };
  created_at: string;
  updated_at: string;
};

export type GitHubPullFile = {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
};

export type GitHubPullComment = {
  id: number;
  body?: string;
  html_url?: string;
  path?: string;
  line?: number | null;
  updated_at?: string;
  user?: {
    login?: string;
  };
};

export type GitHubWorkflowRun = {
  id: number;
  name?: string;
  display_title?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  head_sha?: string;
  event?: string;
  updated_at?: string;
};

export type PullRequestCouncilContext = {
  repo: GitHubRepoRef;
  pullRequest: GitHubPullRequest;
  files: GitHubPullFile[];
  reviewComments: GitHubPullComment[];
  issueComments: GitHubPullComment[];
  workflowRuns: GitHubWorkflowRun[];
  warnings: string[];
};

export type PullRequestCouncilPayload = {
  topic: string;
  session: CouncilSessionInput;
  response: CouncilResponseInput;
};

export type GitHubCouncilBridgeOptions = {
  repos: GitHubRepoRef[];
  githubToken?: string;
  githubApiBase?: string;
  hubUrl: string;
  missionControlToken?: string;
  maxPullRequests?: number;
  dryRun?: boolean;
  requestedBy?: string;
  fetchImpl?: FetchLike;
};

export type GitHubCouncilBridgeResult = {
  dryRun: boolean;
  processedPullRequests: number;
  createdSessions: number;
  addedResponses: number;
  plannedSessions: PullRequestCouncilPayload[];
  errors: Array<{
    repo: string;
    message: string;
  }>;
};

type CouncilSessionRecord = {
  id: string;
  topic: string;
  status: "open" | "closed";
};

const DEFAULT_GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_MAX_PULL_REQUESTS = 5;
const GITHUB_API_VERSION = "2022-11-28";

const RISKY_PATH_PATTERNS = [
  /(^|\/)\.env/i,
  /(^|\/)\.github\/workflows\//i,
  /secret|token|credential|password/i,
  /auth|permission|policy|privacy|security/i,
  /deploy|publish|release|dns/i,
  /base44|connector|dropbox|classroom|clickup/i,
  /src\/hub\/server/i,
  /src\/shared\/env/i
];

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function requireFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof fetch === "function") {
    return fetch;
  }
  throw new Error("A fetch implementation is required.");
}

function coerceMaxPullRequests(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_PULL_REQUESTS;
  }
  return Math.max(1, Math.min(Math.floor(value), 25));
}

function truncate(value: string | undefined, maxLength = 220): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatMaybe(value: string | undefined): string {
  return value && value.trim().length > 0 ? value : "unknown";
}

function isRiskyFile(file: GitHubPullFile): boolean {
  return RISKY_PATH_PATTERNS.some((pattern) => pattern.test(file.filename));
}

function isGitHubAiAuthor(login: string | undefined): boolean {
  return Boolean(login && /copilot|github-actions|github/i.test(login));
}

function summarizeWorkflowRuns(runs: GitHubWorkflowRun[]): {
  summary: string;
  hasFailure: boolean;
  hasPending: boolean;
} {
  if (runs.length === 0) {
    return {
      summary: "No workflow runs found for the PR head SHA.",
      hasFailure: false,
      hasPending: false
    };
  }

  const failed = runs.filter((run) =>
    ["failure", "cancelled", "timed_out", "action_required"].includes(run.conclusion ?? "")
  );
  const pending = runs.filter((run) => run.status !== "completed");
  const passed = runs.filter((run) => run.status === "completed" && run.conclusion === "success");

  const parts = [
    `${runs.length} run(s)`,
    `${passed.length} success`,
    `${failed.length} failed/action-needed`,
    `${pending.length} pending`
  ];

  return {
    summary: parts.join(", "),
    hasFailure: failed.length > 0,
    hasPending: pending.length > 0
  };
}

function summarizeFiles(files: GitHubPullFile[]): {
  summary: string;
  riskyFiles: GitHubPullFile[];
} {
  const additions = files.reduce((total, file) => total + (file.additions ?? 0), 0);
  const deletions = files.reduce((total, file) => total + (file.deletions ?? 0), 0);
  const riskyFiles = files.filter(isRiskyFile);

  return {
    summary: `${files.length} file(s), +${additions}/-${deletions}`,
    riskyFiles
  };
}

function renderCommentList(label: string, comments: GitHubPullComment[]): string[] {
  if (comments.length === 0) {
    return [`${label}: none`];
  }

  return [
    `${label}: ${comments.length}`,
    ...comments.slice(0, 6).map((comment) => {
      const author = formatMaybe(comment.user?.login);
      const location = comment.path ? ` on ${comment.path}${comment.line ? `:${comment.line}` : ""}` : "";
      const aiMarker = isGitHubAiAuthor(comment.user?.login) ? " [GitHub/Copilot signal]" : "";
      return `- ${author}${location}${aiMarker}: ${truncate(comment.body, 180)}`;
    })
  ];
}

function renderWorkflowRunList(runs: GitHubWorkflowRun[]): string[] {
  if (runs.length === 0) {
    return ["- No workflow runs returned for this PR head SHA."];
  }

  return runs.slice(0, 8).map((run) => {
    const name = run.name ?? run.display_title ?? `run ${run.id}`;
    const status = run.conclusion ? `${run.status ?? "unknown"}/${run.conclusion}` : run.status ?? "unknown";
    return `- ${name}: ${status}${run.html_url ? ` (${run.html_url})` : ""}`;
  });
}

export function parseGitHubRepoList(input: string | undefined): GitHubRepoRef[] {
  if (!input || input.trim().length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const repos: GitHubRepoRef[] = [];

  for (const rawEntry of input.split(/[,\n;]/)) {
    const raw = rawEntry.trim();
    if (!raw) {
      continue;
    }

    let value = raw.replace(/^git@github\.com:/i, "");
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      value = url.pathname.replace(/^\/+/, "");
    }
    value = value.replace(/\.git$/i, "");

    const parts = value.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1]?.replace(/\.git$/i, "");
    if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
      throw new Error(`Invalid GitHub repository reference: ${raw}`);
    }

    const slug = `${owner}/${repo}`;
    const dedupeKey = slug.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    repos.push({ owner, repo, slug });
  }

  return repos;
}

export function parseGitHubOrgList(input: string | undefined): string[] {
  if (!input || input.trim().length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const orgs: string[] = [];

  for (const rawEntry of input.split(/[,\n;]/)) {
    let raw = rawEntry.trim();
    if (!raw) {
      continue;
    }

    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      raw = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    }

    const org = raw.replace(/^@/, "");
    if (!org || !/^[A-Za-z0-9_.-]+$/.test(org)) {
      throw new Error(`Invalid GitHub organization reference: ${rawEntry.trim()}`);
    }

    const dedupeKey = org.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    orgs.push(org);
  }

  return orgs;
}

export function mergeGitHubRepoRefs(...lists: GitHubRepoRef[][]): GitHubRepoRef[] {
  const seen = new Set<string>();
  const repos: GitHubRepoRef[] = [];

  for (const list of lists) {
    for (const repo of list) {
      const dedupeKey = repo.slug.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      repos.push(repo);
    }
  }

  return repos;
}

export function filterExcludedGitHubRepos(
  repos: GitHubRepoRef[],
  excludeSlugs: Iterable<string>,
): GitHubRepoRef[] {
  const excluded = new Set<string>();
  for (const slug of excludeSlugs) {
    excluded.add(slug.toLowerCase());
  }
  return repos.filter((repo) => !excluded.has(repo.slug.toLowerCase()));
}

type GitHubOrgRepository = {
  name: string;
  full_name?: string;
  owner?: {
    login?: string;
  };
  fork?: boolean;
  archived?: boolean;
  disabled?: boolean;
};

async function readAuthenticatedGitHubLogin(
  options: Pick<GitHubCouncilBridgeOptions, "githubApiBase" | "githubToken" | "fetchImpl">,
): Promise<string | undefined> {
  if (!options.githubToken) {
    return undefined;
  }

  const fetchImpl = requireFetch(options.fetchImpl);
  const githubApiBase = options.githubApiBase ?? DEFAULT_GITHUB_API_BASE;
  const user = await githubGet<{ login?: string }>(
    "/user",
    { githubApiBase, githubToken: options.githubToken },
    fetchImpl,
  );
  return user.login;
}

export async function listGitHubOrgRepositories(
  org: string,
  options: Pick<GitHubCouncilBridgeOptions, "githubApiBase" | "githubToken" | "fetchImpl"> & {
    includeForks?: boolean;
    includeArchived?: boolean;
  },
): Promise<GitHubRepoRef[]> {
  const fetchImpl = requireFetch(options.fetchImpl);
  const githubApiBase = options.githubApiBase ?? DEFAULT_GITHUB_API_BASE;
  const includeForks = options.includeForks ?? false;
  const includeArchived = options.includeArchived ?? false;
  const listOptions = {
    fetchImpl,
    githubApiBase,
    githubToken: options.githubToken,
    includeForks,
    includeArchived,
  };

  const orgRepos = await listGitHubRepositoriesForPath(
    `/orgs/${encodeURIComponent(org)}/repos?type=all&per_page=100&page=`,
    org,
    listOptions,
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("(404)")) {
      throw error;
    }
    return null;
  });

  if (orgRepos) {
    return orgRepos;
  }

  const login = await readAuthenticatedGitHubLogin(options);
  if (login && login.toLowerCase() === org.toLowerCase()) {
    return listGitHubRepositoriesForPath(
      `/user/repos?type=owner&per_page=100&page=`,
      org,
      listOptions,
    );
  }

  return listGitHubRepositoriesForPath(
    `/users/${encodeURIComponent(org)}/repos?type=owner&per_page=100&page=`,
    org,
    listOptions,
  );
}

async function listGitHubRepositoriesForPath(
  pathPrefix: string,
  owner: string,
  options: {
    fetchImpl: FetchLike;
    githubApiBase: string;
    githubToken?: string;
    includeForks: boolean;
    includeArchived: boolean;
  },
): Promise<GitHubRepoRef[]> {
  const repos: GitHubRepoRef[] = [];
  let page = 1;

  while (true) {
    const payload = await githubGet<GitHubOrgRepository[]>(
      `${pathPrefix}${page}&sort=updated`,
      { githubApiBase: options.githubApiBase, githubToken: options.githubToken },
      options.fetchImpl,
    );

    if (payload.length === 0) {
      break;
    }

    for (const entry of payload) {
      if (!options.includeForks && entry.fork) {
        continue;
      }
      if (!options.includeArchived && entry.archived) {
        continue;
      }
      if (entry.disabled) {
        continue;
      }
      const ownerLogin = entry.owner?.login ?? owner;
      repos.push({
        owner: ownerLogin,
        repo: entry.name,
        slug: entry.full_name ?? `${ownerLogin}/${entry.name}`,
      });
    }

    if (payload.length < 100) {
      break;
    }
    page += 1;
  }

  return repos;
}

const GITHUB_REPO_AFFILIATIONS = "owner,collaborator,organization_member";

export async function listGitHubAffiliatedRepositories(
  allowedOwners: string[],
  options: Pick<GitHubCouncilBridgeOptions, "githubApiBase" | "githubToken" | "fetchImpl"> & {
    includeForks?: boolean;
    includeArchived?: boolean;
  },
): Promise<GitHubRepoRef[]> {
  if (!options.githubToken || allowedOwners.length === 0) {
    return [];
  }

  const allowed = new Set(allowedOwners.map((owner) => owner.toLowerCase()));
  const repos = await listGitHubRepositoriesForPath(
    `/user/repos?affiliation=${encodeURIComponent(GITHUB_REPO_AFFILIATIONS)}&per_page=100&page=`,
    "",
    {
      fetchImpl: requireFetch(options.fetchImpl),
      githubApiBase: options.githubApiBase ?? DEFAULT_GITHUB_API_BASE,
      githubToken: options.githubToken,
      includeForks: options.includeForks ?? false,
      includeArchived: options.includeArchived ?? false,
    },
  );

  return repos.filter((repo) => allowed.has(repo.owner.toLowerCase()));
}

export async function resolveGitHubCouncilRepos(options: {
  repoList?: string;
  orgList?: string;
  excludeList?: string;
  githubToken?: string;
  githubApiBase?: string;
  fetchImpl?: FetchLike;
  includeForks?: boolean;
  includeArchived?: boolean;
}): Promise<{
  repos: GitHubRepoRef[];
  errors: Array<{ scope: string; message: string }>;
}> {
  const explicitRepos = parseGitHubRepoList(options.repoList);
  const orgs = parseGitHubOrgList(options.orgList);
  const excludedSlugs = parseGitHubRepoList(options.excludeList).map((repo) => repo.slug);
  const errors: Array<{ scope: string; message: string }> = [];
  const discoveredRepos: GitHubRepoRef[] = [];

  for (const org of orgs) {
    try {
      const orgRepos = await listGitHubOrgRepositories(org, {
        githubApiBase: options.githubApiBase,
        githubToken: options.githubToken,
        fetchImpl: options.fetchImpl,
        includeForks: options.includeForks,
        includeArchived: options.includeArchived,
      });
      discoveredRepos.push(...orgRepos);
    } catch (error) {
      errors.push({
        scope: org,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (orgs.length > 0 && options.githubToken) {
    try {
      const affiliatedRepos = await listGitHubAffiliatedRepositories(orgs, {
        githubApiBase: options.githubApiBase,
        githubToken: options.githubToken,
        fetchImpl: options.fetchImpl,
        includeForks: options.includeForks,
        includeArchived: options.includeArchived,
      });
      discoveredRepos.push(...affiliatedRepos);
    } catch (error) {
      errors.push({
        scope: "affiliation",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const repos = filterExcludedGitHubRepos(
    mergeGitHubRepoRefs(explicitRepos, discoveredRepos),
    excludedSlugs,
  );

  return { repos, errors };
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${truncate(raw, 500)}`);
  }
  return (raw ? JSON.parse(raw) : {}) as T;
}

async function githubGet<T>(
  pathName: string,
  options: Required<Pick<GitHubCouncilBridgeOptions, "githubApiBase">> & Pick<GitHubCouncilBridgeOptions, "githubToken">,
  fetchImpl: FetchLike
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "device-mission-control",
    "x-github-api-version": GITHUB_API_VERSION
  };
  if (options.githubToken) {
    headers.authorization = `Bearer ${options.githubToken}`;
  }

  const response = await fetchImpl(`${trimTrailingSlash(options.githubApiBase)}${pathName}`, { headers });
  return readJsonResponse<T>(response, `GitHub GET ${pathName}`);
}

async function hubJson<T>(
  hubUrl: string,
  token: string | undefined,
  pathName: string,
  fetchImpl: FetchLike,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init.body ? { "content-type": "application/json" } : {})
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetchImpl(`${trimTrailingSlash(hubUrl)}${pathName}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers as Record<string, string> | undefined)
    }
  });
  return readJsonResponse<T>(response, `Hub ${init.method ?? "GET"} ${pathName}`);
}

export async function collectGitHubPullRequestContexts(
  options: GitHubCouncilBridgeOptions
): Promise<{
  contexts: PullRequestCouncilContext[];
  errors: Array<{ repo: string; message: string }>;
}> {
  const fetchImpl = requireFetch(options.fetchImpl);
  const githubApiBase = options.githubApiBase ?? DEFAULT_GITHUB_API_BASE;
  const maxPullRequests = coerceMaxPullRequests(options.maxPullRequests);
  const contexts: PullRequestCouncilContext[] = [];
  const errors: Array<{ repo: string; message: string }> = [];

  for (const repo of options.repos) {
    const repoPath = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
    try {
      const pulls = await githubGet<GitHubPullRequest[]>(
        `${repoPath}/pulls?state=open&per_page=${maxPullRequests}`,
        { githubApiBase, githubToken: options.githubToken },
        fetchImpl
      );

      for (const pullRequest of pulls.slice(0, maxPullRequests)) {
        const warnings: string[] = [];
        const prPath = `${repoPath}/pulls/${pullRequest.number}`;
        const issuePath = `${repoPath}/issues/${pullRequest.number}`;

        const [files, reviewComments, issueComments, workflowRunPayload] = await Promise.all([
          githubGet<GitHubPullFile[]>(`${prPath}/files?per_page=100`, { githubApiBase, githubToken: options.githubToken }, fetchImpl).catch(
            (error: unknown) => {
              warnings.push(error instanceof Error ? error.message : String(error));
              return [];
            }
          ),
          githubGet<GitHubPullComment[]>(`${prPath}/comments?per_page=100`, { githubApiBase, githubToken: options.githubToken }, fetchImpl).catch(
            (error: unknown) => {
              warnings.push(error instanceof Error ? error.message : String(error));
              return [];
            }
          ),
          githubGet<GitHubPullComment[]>(`${issuePath}/comments?per_page=100`, { githubApiBase, githubToken: options.githubToken }, fetchImpl).catch(
            (error: unknown) => {
              warnings.push(error instanceof Error ? error.message : String(error));
              return [];
            }
          ),
          githubGet<{ workflow_runs?: GitHubWorkflowRun[] }>(
            `${repoPath}/actions/runs?head_sha=${encodeURIComponent(pullRequest.head.sha)}&per_page=10`,
            { githubApiBase, githubToken: options.githubToken },
            fetchImpl
          ).catch((error: unknown) => {
            warnings.push(error instanceof Error ? error.message : String(error));
            return { workflow_runs: [] };
          })
        ]);

        contexts.push({
          repo,
          pullRequest,
          files,
          reviewComments,
          issueComments,
          workflowRuns: workflowRunPayload.workflow_runs ?? [],
          warnings
        });
      }
    } catch (error) {
      errors.push({
        repo: repo.slug,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { contexts, errors };
}

export function buildPullRequestCouncilPayload(context: PullRequestCouncilContext): PullRequestCouncilPayload {
  const { repo, pullRequest } = context;
  const workflowSummary = summarizeWorkflowRuns(context.workflowRuns);
  const fileSummary = summarizeFiles(context.files);
  const commentCount = context.reviewComments.length + context.issueComments.length;
  const githubAiCommentCount = [...context.reviewComments, ...context.issueComments].filter((comment) =>
    isGitHubAiAuthor(comment.user?.login)
  ).length;
  const stance: CouncilResponseInput["stance"] =
    workflowSummary.hasFailure || fileSummary.riskyFiles.length > 0 ? "concern" : "inform";
  const topic = `GitHub PR Review - ${repo.slug}#${pullRequest.number}`;
  const riskySummary =
    fileSummary.riskyFiles.length > 0
      ? fileSummary.riskyFiles
          .slice(0, 10)
          .map((file) => file.filename)
          .join(", ")
      : "none flagged";
  const warnings = context.warnings.length > 0 ? context.warnings.map((warning) => `- ${warning}`) : ["- none"];

  const prompt = [
    `Repo Verifier intake for ${repo.slug}#${pullRequest.number}.`,
    "",
    `PR: ${pullRequest.title}`,
    `URL: ${pullRequest.html_url}`,
    `Author: ${formatMaybe(pullRequest.user?.login)}`,
    `Draft: ${pullRequest.draft ? "yes" : "no"}`,
    `Branch: ${pullRequest.head.ref} (${pullRequest.head.sha}) -> ${pullRequest.base.ref}`,
    `Updated: ${pullRequest.updated_at}`,
    "",
    "Changed files:",
    `- ${fileSummary.summary}`,
    `- Risk-sensitive paths: ${riskySummary}`,
    "",
    "CI / workflow runs:",
    `- ${workflowSummary.summary}`,
    ...renderWorkflowRunList(context.workflowRuns),
    "",
    "Comments:",
    `- Total PR/review comments sampled: ${commentCount}`,
    `- GitHub/Copilot-like comments sampled: ${githubAiCommentCount}`,
    ...renderCommentList("Review comments", context.reviewComments),
    ...renderCommentList("Issue conversation comments", context.issueComments),
    "",
    "Bridge warnings:",
    ...warnings,
    "",
    "Council instruction:",
    "Act as Repo Verifier. Identify P0/P1 risks, failing checks, risky files, and the smallest safe next action. Do not merge, publish, deploy, or change production state."
  ].join("\n");

  const detail = [
    `Repo: ${repo.slug}`,
    `PR: ${pullRequest.html_url}`,
    `Files: ${fileSummary.summary}`,
    `Risk-sensitive paths: ${riskySummary}`,
    `CI: ${workflowSummary.summary}`,
    `Comments sampled: ${commentCount}`,
    `GitHub/Copilot-like comments: ${githubAiCommentCount}`,
    context.warnings.length > 0 ? `Warnings: ${context.warnings.join(" | ")}` : "Warnings: none"
  ].join("\n");

  return {
    topic,
    session: {
      topic,
      prompt,
      requestedBy: "github-council-bridge",
      targetMemberIds: ["human-owner", "repo-verifier", "scribe"]
    },
    response: {
      memberId: "github-repo-verifier",
      memberLabel: "GitHub Repo Verifier",
      stance,
      summary: `${repo.slug}#${pullRequest.number}: ${workflowSummary.summary}; ${fileSummary.summary}; ${commentCount} comment(s).`,
      detail
    }
  };
}

export async function runGitHubCouncilBridge(
  options: GitHubCouncilBridgeOptions
): Promise<GitHubCouncilBridgeResult> {
  if (options.repos.length === 0) {
    throw new Error(
      "At least one GitHub repo is required. Set MISSION_CONTROL_GITHUB_REPOS, MISSION_CONTROL_GITHUB_ORG, or pass --repo owner/repo.",
    );
  }

  const fetchImpl = requireFetch(options.fetchImpl);
  const { contexts, errors } = await collectGitHubPullRequestContexts({
    ...options,
    fetchImpl
  });
  const plannedSessions = contexts.map(buildPullRequestCouncilPayload);

  if (options.dryRun) {
    return {
      dryRun: true,
      processedPullRequests: contexts.length,
      createdSessions: 0,
      addedResponses: 0,
      plannedSessions,
      errors
    };
  }

  const sessions = await hubJson<CouncilSessionRecord[]>(
    options.hubUrl,
    options.missionControlToken,
    "/api/council/sessions",
    fetchImpl
  );
  let createdSessions = 0;
  let addedResponses = 0;

  for (const payload of plannedSessions) {
    let session = sessions.find((entry) => entry.status === "open" && entry.topic === payload.topic);

    if (!session) {
      session = await hubJson<CouncilSessionRecord>(
        options.hubUrl,
        options.missionControlToken,
        "/api/council/sessions",
        fetchImpl,
        {
          method: "POST",
          body: JSON.stringify({
            ...payload.session,
            requestedBy: options.requestedBy ?? payload.session.requestedBy
          })
        }
      );
      sessions.push(session);
      createdSessions += 1;
    }

    await hubJson<unknown>(
      options.hubUrl,
      options.missionControlToken,
      `/api/council/sessions/${encodeURIComponent(session.id)}/responses`,
      fetchImpl,
      {
        method: "POST",
        body: JSON.stringify(payload.response)
      }
    );
    addedResponses += 1;
  }

  return {
    dryRun: false,
    processedPullRequests: contexts.length,
    createdSessions,
    addedResponses,
    plannedSessions,
    errors
  };
}
