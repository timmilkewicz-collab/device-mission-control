import fs from "node:fs";
import path from "node:path";
import { DomainEvent, formatDomainEvent } from "../../domain/events";
import { resolveDataPath } from "../../shared/paths";

export class DomainEventLog {
  constructor(private readonly filePath: string = resolveDataPath("domain-events.jsonl")) {}

  append(event: DomainEvent): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${formatDomainEvent(event)}\n`, "utf8");
  }

  getPath(): string {
    return this.filePath;
  }
}

export const domainEventLog = new DomainEventLog();

export function appendDomainEvent(event: DomainEvent, log: DomainEventLog = domainEventLog): void {
  log.append(event);
}
