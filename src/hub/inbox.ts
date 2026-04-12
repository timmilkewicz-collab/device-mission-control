import fs from "node:fs";
import path from "node:path";
import { generateId, nowIso, PeerInboxInput, PeerInboxMessage, peerInboxMessageSchema } from "../shared/types";

export class PeerInboxStore {
  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  append(input: PeerInboxInput): PeerInboxMessage {
    const message: PeerInboxMessage = {
      id: generateId("inbox"),
      ts: nowIso(),
      role: input.role,
      text: input.text
    };

    fs.appendFileSync(this.filePath, `${JSON.stringify(message)}\n`, "utf8");
    return message;
  }

  list(limit = 50): PeerInboxMessage[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => peerInboxMessageSchema.parse(JSON.parse(line)))
      .slice(-limit)
      .reverse();
  }
}
