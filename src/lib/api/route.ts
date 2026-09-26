import type { z } from "zod";
import { ApiError, toApiIssues } from "./errors";
import { clientIp, type RateLimiter } from "./rate-limit";

/** Default JSON body limit; upload routes pass their own (SPEC 19). */
const DEFAULT_MAX_BODY_BYTES = 1_000_000;

/**
 * Reads a JSON request body and validates it with zod.
 * Throws `ApiError` (415, 413, 400, 422) instead of returning bad data.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<z.infer<S>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(
      "unsupported_media_type",
      "Expected Content-Type: application/json",
    );
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError("payload_too_large", `Body exceeds ${maxBytes} bytes`);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError("payload_too_large", `Body exceeds ${maxBytes} bytes`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError("bad_request", "Body is not valid JSON");
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError("validation_failed", "Request body failed validation", {
      issues: toApiIssues(result.error),
    });
  }
  return result.data;
}

/** Throws a 429 `ApiError` when the client is over the limit. */
export function enforceRateLimit(request: Request, limiter: RateLimiter) {
  const result = limiter.check(clientIp(request));
  if (!result.ok) {
    throw new ApiError("rate_limited", "Too many requests", {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

type JsonRouteOptions<S extends z.ZodType> = {
  /** Used in server logs, e.g. "ai/parse". */
  name: string;
  body: S;
  rateLimit?: RateLimiter;
  maxBodyBytes?: number;
};

/**
 * Wraps a POST handler with the route conventions: rate limit → parse and
 * validate the JSON body → run the handler → return JSON. Any thrown
 * `ApiError` becomes its error response; anything else is logged and becomes
 * a generic 500 (no internals leak to the client).
 *
 * ```ts
 * export const POST = jsonRoute(
 *   { name: "ai/parse", body: ParseRequestSchema, rateLimit: rateLimiters.ai },
 *   async ({ body }) => parsePrompt(body),
 * );
 * ```
 */
export function jsonRoute<S extends z.ZodType, R>(
  opts: JsonRouteOptions<S>,
  handler: (ctx: { body: z.infer<S>; request: Request }) => Promise<R> | R,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if (opts.rateLimit) enforceRateLimit(request, opts.rateLimit);
      const body = await parseJsonBody(request, opts.body, opts.maxBodyBytes);
      const result = await handler({ body, request });
      return result instanceof Response ? result : Response.json(result);
    } catch (error) {
      return errorResponse(opts.name, error);
    }
  };
}

/** Converts any thrown value into an error response, logging server faults. */
export function errorResponse(routeName: string, error: unknown): Response {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error(`[api/${routeName}] ${error.code}: ${error.message}`);
    }
    return error.toResponse();
  }
  console.error(`[api/${routeName}] unhandled error`, error);
  return new ApiError("internal", "Something went wrong").toResponse();
}
