import fs from "node:fs";
import path from "node:path";
import { nowIso } from "../shared/types";

export type IntegrityReviewRecord = {
  key: string;
  appId: string;
  alertId: string;
  actor: string;
  acknowledgedAt: string;
  note?: string;
  alertType?: string;
  signalSummary?: string;
};

type IntegrityReviewInput = {
  appId: string;
  alertId: string;
  actor: string;
  note?: string;
  alertType?: string;
  signalSummary?: string;
};

type IntegrityReviewMap = Record<string, IntegrityReviewRecord>;

export function buildIntegrityReviewKey(appId: string, alertId: string): string {
  return `${appId}:${alertId}`;
}

export class IntegrityReviewStore {
  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  acknowledge(input: IntegrityReviewInput): IntegrityReviewRecord {
    const reviews = this.load();
    const key = buildIntegrityReviewKey(input.appId, input.alertId);

    const record: IntegrityReviewRecord = {
      key,
      appId: input.appId,
      alertId: input.alertId,
      actor: input.actor,
      acknowledgedAt: nowIso(),
      note: input.note,
      alertType: input.alertType,
      signalSummary: input.signalSummary
    };

    reviews[key] = record;
    this.save(reviews);
    return record;
  }

  get(appId: string, alertId: string): IntegrityReviewRecord | undefined {
    const reviews = this.load();
    return reviews[buildIntegrityReviewKey(appId, alertId)];
  }

  list(): IntegrityReviewRecord[] {
    return Object.values(this.load()).sort((left, right) => right.acknowledgedAt.localeCompare(left.acknowledgedAt));
  }

  private load(): IntegrityReviewMap {
    if (!fs.existsSync(this.filePath)) {
      return {};
    }

    const raw = fs.readFileSync(this.filePath, "utf8").trim();
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as IntegrityReviewMap;
    return parsed ?? {};
  }

  private save(reviews: IntegrityReviewMap): void {
    fs.writeFileSync(this.filePath, `${JSON.stringify(reviews, null, 2)}\n`, "utf8");
  }
}
