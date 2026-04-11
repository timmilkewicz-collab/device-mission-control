import { IncomingMessage, ServerResponse } from "node:http";

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw.length === 0 ? {} : JSON.parse(raw);
}

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload, null, 2));
}

export function sendHtml(response: ServerResponse, html: string): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
}

export function sendText(response: ServerResponse, statusCode: number, message: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(message);
}

export function notFound(response: ServerResponse): void {
  sendJson(response, 404, { error: "Not found" });
}

export function badRequest(response: ServerResponse, error: unknown): void {
  sendJson(response, 400, {
    error: error instanceof Error ? error.message : "Bad request"
  });
}

export function unauthorized(response: ServerResponse): void {
  sendJson(response, 401, { error: "Unauthorized" });
}
