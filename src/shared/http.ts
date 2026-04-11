import { IncomingMessage, ServerResponse } from "node:http";

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const raw = await readBody(request);
  return raw.length === 0 ? {} : JSON.parse(raw);
}

export async function readFormBody(request: IncomingMessage): Promise<Record<string, string>> {
  const raw = await readBody(request);
  const params = new URLSearchParams(raw);
  const entries: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    entries[key] = value;
  }

  return entries;
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

export function redirect(response: ServerResponse, location: string): void {
  response.statusCode = 303;
  response.setHeader("location", location);
  response.end();
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
