import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPullRequestCouncilPayload,
  FetchLike,
  parseGitHubOrgList,
  parseGitHubRepoList,
  resolveGitHubCouncilRepos,
  runGitHubCouncilBridge
} from "../src/hub/githubCouncilBridge";

function jsonResponse(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" }
    })
  );
}

function buildGitHubMockFetch(calls: Array<{ url: string; init?: RequestInit }>): FetchLike {
  return async (input: string, init?: RequestInit) => {
    calls.push({ url: input, init });

    if (input.includes("/repos/acme/widget/pulls?state=open")) {
      return jsonResponse([
        {
          number: 7,
          title: "Add owner export safety",
          html_url: "https://github.com/acme/widget/pull/7",
          draft: false,
          user: { login: "octo-dev" },
          head: { ref: "feature/export-safety", sha: "sha123" },
          base: { ref: "main", sha: "base123" },
          created_at: "2026-06-09T10:00:00Z",
          updated_at: "2026-06-09T10:30:00Z"
        }
      ]);
    }

    if (input.includes("/repos/acme/widget/pulls/7/files")) {
      return jsonResponse([
        {
          filename: "src/hub/server.ts",
          status: "modified",
          additions: 10,
          deletions: 2,
          changes: 12
        },
        {
          filename: "docs/runbook.md",
          status: "added",
          additions: 4,
          deletions: 0,
          changes: 4
        }
      ]);
    }

    if (input.includes("/repos/acme/widget/pulls/7/comments")) {
      return jsonResponse([
        {
          id: 1,
          user: { login: "github-copilot" },
          body: "Check whether auth is required on this route.",
          path: "src/hub/server.ts",
          line: 42,
          updated_at: "2026-06-09T10:35:00Z"
        }
      ]);
    }

    if (input.includes("/repos/acme/widget/issues/7/comments")) {
      return jsonResponse([
        {
          id: 2,
          user: { login: "reviewer" },
          body: "Please keep this behind the operator gate.",
          updated_at: "2026-06-09T10:36:00Z"
        }
      ]);
    }

    if (input.includes("/repos/acme/widget/actions/runs?head_sha=sha123")) {
      return jsonResponse({
        workflow_runs: [
          {
            id: 99,
            name: "check",
            status: "completed",
            conclusion: "failure",
            html_url: "https://github.com/acme/widget/actions/runs/99",
            head_sha: "sha123"
          }
        ]
      });
    }

    if (input.endsWith("/api/council/sessions") && init?.method !== "POST") {
      return jsonResponse([]);
    }

    if (input.endsWith("/api/council/sessions") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { topic: string };
      return jsonResponse({
        id: "council_1",
        topic: body.topic,
        status: "open"
      });
    }

    if (input.includes("/api/council/sessions/council_1/responses") && init?.method === "POST") {
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ message: `unexpected URL ${input}` }, 404);
  };
}

test("parseGitHubRepoList accepts slugs, URLs, and dedupes", () => {
  const repos = parseGitHubRepoList(
    "acme/widget, https://github.com/acme/widget/pull/7, git@github.com:Other/Repo.git"
  );

  assert.deepEqual(repos, [
    { owner: "acme", repo: "widget", slug: "acme/widget" },
    { owner: "Other", repo: "Repo", slug: "Other/Repo" }
  ]);
});

test("parseGitHubOrgList accepts org slugs and URLs", () => {
  const orgs = parseGitHubOrgList("acme, https://github.com/other-org, @third-org");
  assert.deepEqual(orgs, ["acme", "other-org", "third-org"]);
});

test("resolveGitHubCouncilRepos uses authenticated user repos for user namespaces", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    calls.push(input);
    if (input.endsWith("/user")) {
      return jsonResponse({ login: "acme" });
    }
    if (input.includes("/user/repos?type=owner")) {
      return jsonResponse([
        { name: "alpha", owner: { login: "acme" }, full_name: "acme/alpha", fork: false, archived: false },
        { name: "secret", owner: { login: "acme" }, full_name: "acme/secret", fork: false, archived: false },
      ]);
    }
    return jsonResponse({ message: `unexpected URL ${input}` }, 404);
  };

  const { repos, errors } = await resolveGitHubCouncilRepos({
    orgList: "acme",
    fetchImpl,
    githubToken: "token",
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(
    repos.map((repo) => repo.slug),
    ["acme/alpha", "acme/secret"],
  );
  assert.equal(calls.some((url) => url.includes("/user/repos?type=owner")), true);
  assert.equal(calls.some((url) => url.includes("/users/acme/repos")), false);
});

test("resolveGitHubCouncilRepos merges explicit repos and org discovery", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    calls.push(input);
    if (input.includes("/orgs/acme/repos")) {
      return jsonResponse([
        { name: "alpha", fork: false, archived: false },
        { name: "beta", fork: true, archived: false },
        { name: "legacy", fork: false, archived: true }
      ]);
    }
    return jsonResponse({ message: `unexpected URL ${input}` }, 404);
  };

  const { repos, errors } = await resolveGitHubCouncilRepos({
    repoList: "acme/explicit",
    orgList: "acme",
    excludeList: "acme/legacy",
    fetchImpl
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(
    repos.map((repo) => repo.slug),
    ["acme/explicit", "acme/alpha"]
  );
  assert.equal(calls.some((url) => url.includes("/orgs/acme/repos")), true);
});

test("buildPullRequestCouncilPayload flags CI failures and sensitive paths", () => {
  const payload = buildPullRequestCouncilPayload({
    repo: { owner: "acme", repo: "widget", slug: "acme/widget" },
    pullRequest: {
      number: 7,
      title: "Add owner export safety",
      html_url: "https://github.com/acme/widget/pull/7",
      draft: false,
      user: { login: "octo-dev" },
      head: { ref: "feature/export-safety", sha: "sha123" },
      base: { ref: "main" },
      created_at: "2026-06-09T10:00:00Z",
      updated_at: "2026-06-09T10:30:00Z"
    },
    files: [{ filename: "src/hub/server.ts", additions: 10, deletions: 2 }],
    reviewComments: [{ id: 1, user: { login: "github-copilot" }, body: "Check auth." }],
    issueComments: [],
    workflowRuns: [{ id: 99, name: "check", status: "completed", conclusion: "failure" }],
    warnings: []
  });

  assert.equal(payload.topic, "GitHub PR Review - acme/widget#7");
  assert.equal(payload.response.stance, "concern");
  assert.match(payload.session.prompt, /GitHub\/Copilot-like comments sampled: 1/);
  assert.match(payload.session.prompt, /src\/hub\/server\.ts/);
  assert.match(payload.session.prompt, /Do not merge, publish, deploy/);
});

test("runGitHubCouncilBridge dry run plans without posting to hub", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await runGitHubCouncilBridge({
    repos: [{ owner: "acme", repo: "widget", slug: "acme/widget" }],
    hubUrl: "http://localhost:8787",
    maxPullRequests: 1,
    dryRun: true,
    fetchImpl: buildGitHubMockFetch(calls)
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.processedPullRequests, 1);
  assert.equal(result.plannedSessions[0]?.topic, "GitHub PR Review - acme/widget#7");
  assert.equal(calls.some((call) => call.url.includes("/api/council")), false);
});

test("runGitHubCouncilBridge creates a council session and adds verifier response", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await runGitHubCouncilBridge({
    repos: [{ owner: "acme", repo: "widget", slug: "acme/widget" }],
    hubUrl: "http://localhost:8787",
    missionControlToken: "mission-token",
    maxPullRequests: 1,
    fetchImpl: buildGitHubMockFetch(calls)
  });

  assert.equal(result.dryRun, false);
  assert.equal(result.createdSessions, 1);
  assert.equal(result.addedResponses, 1);

  const createCall = calls.find((call) => call.url.endsWith("/api/council/sessions") && call.init?.method === "POST");
  assert.ok(createCall);
  assert.equal((createCall.init?.headers as Record<string, string>).authorization, "Bearer mission-token");

  const responseCall = calls.find((call) => call.url.includes("/responses") && call.init?.method === "POST");
  assert.ok(responseCall);
  const body = JSON.parse(String(responseCall.init?.body)) as { memberId: string; stance: string };
  assert.equal(body.memberId, "github-repo-verifier");
  assert.equal(body.stance, "concern");
});
