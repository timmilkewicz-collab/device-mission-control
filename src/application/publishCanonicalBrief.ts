import {
  buildCanonicalStatusSnapshot,
  enrichSnapshotWithHubReachability,
  renderCanonicalStatusMarkdown,
  writeCanonicalStatusExport,
  type CanonicalStatusExportOptions,
  type CanonicalStatusSnapshot
} from "../hub/canonicalStatusExport";
import { appendDomainEvent } from "../infrastructure/events/domainEventLog";

export type PublishCanonicalBriefOptions = CanonicalStatusExportOptions & {
  noWrite?: boolean;
};

export type PublishCanonicalBriefResult = {
  snapshot: CanonicalStatusSnapshot;
  markdownPath?: string;
  logPath?: string;
  markdown: string;
};

export async function publishCanonicalBrief(
  options: PublishCanonicalBriefOptions = {}
): Promise<PublishCanonicalBriefResult> {
  let snapshot = buildCanonicalStatusSnapshot(options);
  snapshot = await enrichSnapshotWithHubReachability(snapshot);

  const markdown = renderCanonicalStatusMarkdown(snapshot);
  const result = writeCanonicalStatusExport(snapshot, markdown, { noWrite: options.noWrite });

  if (result.markdownPath) {
    appendDomainEvent({
      type: "CanonicalBriefPublished",
      at: snapshot.generatedAtUtc,
      markdownPath: result.markdownPath
    });
  }

  return {
    snapshot: result.snapshot,
    markdownPath: result.markdownPath,
    logPath: result.logPath,
    markdown
  };
}
