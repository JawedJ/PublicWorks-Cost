import { z } from "zod";

/**
 * Stable error codes for every API route. The client maps `code` to a translated
 * message (next-intl); `message` is plain English for logs and debugging only.
 */
export const ApiErrorCodeSchema = z.enum([
  "bad_request",
  "validation_failed",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "upstream_timeout",
  "upstream_error",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ApiIssue = z.infer<typeof ApiIssueSchema>;

/** Body of every non-2xx API response: `{ error: { code, message, issues?, retryAfterSeconds? } }`. */
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    issues: z.array(ApiIssueSchema).optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  upstream_timeout: 504,
  upstream_error: 502,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly issues?: ApiIssue[];
  readonly retryAfterSeconds?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    extra: { issues?: ApiIssue[]; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.issues = extra.issues;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }

  toResponse(): Response {
    const body: ApiErrorBody = {
      error: {
        code: this.code,
        message: this.message,
        ...(this.issues && { issues: this.issues }),
        ...(this.retryAfterSeconds !== undefined && {
          retryAfterSeconds: this.retryAfterSeconds,
        }),
      },
    };
    const headers: HeadersInit =
      this.retryAfterSeconds !== undefined
        ? { "Retry-After": String(this.retryAfterSeconds) }
        : {};
    return Response.json(body, { status: this.status, headers });
  }
}

/** Turns zod issues into the flat `{ path, message }` list sent to the client. */
export function toApiIssues(error: z.ZodError): ApiIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/** Client helper: reads an error body from a failed response, or null if it isn't one. */
export async function readApiError(
  response: Response,
): Promise<ApiErrorBody["error"] | null> {
  try {
    const parsed = ApiErrorBodySchema.safeParse(await response.json());
    return parsed.success ? parsed.data.error : null;
  } catch {
    return null;
  }
}
