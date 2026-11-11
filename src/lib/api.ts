import "server-only";
import { z, ZodError } from "zod";
import { getEnv } from "./env";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const ok = (data: unknown, meta?: unknown, status = 200) =>
  Response.json(
    { data, ...(meta ? { meta } : {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export async function endpoint(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof ZodError)
      return Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Check the submitted fields.",
            fields: error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 },
      );
    const code = (error as { code?: string })?.code;
    if (code && ["P2002", "P2003", "P2025", "P2004"].includes(code))
      return Response.json(
        {
          error: {
            code: code === "P2025" ? "NOT_FOUND" : "RECORD_CONFLICT",
            message:
              code === "P2025"
                ? "The record was not found."
                : code === "P2002"
                  ? "This unique name, slug or number is already in use."
                  : "This record is referenced or violates a database integrity rule.",
          },
        },
        { status: code === "P2025" ? 404 : 409 },
      );
    // Never serialize database errors, request bodies, credentials or private keys.
    console.error(
      "Frame BD request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "The service is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
export function sameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(getEnv().BETTER_AUTH_URL).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ApiError(
      403,
      "INVALID_ORIGIN",
      "This request origin is not allowed.",
    );
}
export async function readText(request: Request, max = 16384) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      throw new ApiError(413, "BODY_TOO_LARGE", "The request is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function body<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxBytes = 16384,
): Promise<z.infer<T>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "INVALID_CONTENT_TYPE", "Use application/json.");
  const text = await readText(request, maxBytes);
  if (Buffer.byteLength(text) > maxBytes)
    throw new ApiError(413, "BODY_TOO_LARGE", "The request is too large.");
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof ZodError) throw error;
    throw new ApiError(400, "INVALID_JSON", "Invalid JSON body.");
  }
}
