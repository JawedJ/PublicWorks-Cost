import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ApiError,
  clientIp,
  createRateLimiter,
  jsonRoute,
  parseJsonBody,
  readApiError,
} from "@/lib/api";

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

const Body = z.object({ prompt: z.string().min(1), count: z.number().int() });

describe("parseJsonBody", () => {
  it("returns typed data for a valid body", async () => {
    const data = await parseJsonBody(
      post(JSON.stringify({ prompt: "a road", count: 2 })),
      Body,
    );
    expect(data).toEqual({ prompt: "a road", count: 2 });
  });

  it("rejects invalid JSON with bad_request", async () => {
    await expect(parseJsonBody(post("{nope"), Body)).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });
  });

  it("rejects a schema mismatch with validation_failed and issue paths", async () => {
    const err = await parseJsonBody(
      post(JSON.stringify({ prompt: "", count: 1.5 })),
      Body,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(422);
    expect(apiErr.issues?.map((i) => i.path).sort()).toEqual([
      "count",
      "prompt",
    ]);
  });

  it("rejects a non-JSON content type", async () => {
    await expect(
      parseJsonBody(post("{}", { "content-type": "text/plain" }), Body),
    ).rejects.toMatchObject({ code: "unsupported_media_type", status: 415 });
  });

  it("rejects bodies over the size limit", async () => {
    const big = JSON.stringify({ prompt: "x".repeat(200), count: 1 });
    await expect(parseJsonBody(post(big), Body, 100)).rejects.toMatchObject({
      code: "payload_too_large",
      status: 413,
    });
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit per window, then reports retry-after", () => {
    let t = 0;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 10_000,
      now: () => t,
    });
    expect(limiter.check("a")).toEqual({ ok: true, remaining: 1 });
    expect(limiter.check("a")).toEqual({ ok: true, remaining: 0 });
    t = 2_500;
    expect(limiter.check("a")).toEqual({ ok: false, retryAfterSeconds: 8 });
    // Other clients are independent.
    expect(limiter.check("b").ok).toBe(true);
    // New window.
    t = 10_000;
    expect(limiter.check("a")).toEqual({ ok: true, remaining: 1 });
  });

  it("caps tracked keys", () => {
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => 0,
      maxKeys: 2,
    });
    limiter.check("a");
    limiter.check("b");
    limiter.check("c"); // evicts "a"
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("c").ok).toBe(false);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for address", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(
      clientIp(
        new Request("http://localhost", {
          headers: { "x-real-ip": "198.51.100.7" },
        }),
      ),
    ).toBe("198.51.100.7");
    expect(clientIp(new Request("http://localhost"))).toBe("unknown");
  });
});

describe("jsonRoute", () => {
  it("returns the handler result as JSON", async () => {
    const route = jsonRoute({ name: "test", body: Body }, ({ body }) => ({
      echo: body.prompt,
    }));
    const res = await route(post(JSON.stringify({ prompt: "hi", count: 1 })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ echo: "hi" });
  });

  it("returns the standard error body for validation failures", async () => {
    const route = jsonRoute({ name: "test", body: Body }, () => ({}));
    const res = await route(post(JSON.stringify({ prompt: 1 })));
    expect(res.status).toBe(422);
    const error = await readApiError(res);
    expect(error?.code).toBe("validation_failed");
    expect(error?.issues?.length).toBeGreaterThan(0);
  });

  it("rate-limits by client IP with a Retry-After header", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const route = jsonRoute(
      { name: "test", body: Body, rateLimit: limiter },
      () => ({ ok: true }),
    );
    const body = JSON.stringify({ prompt: "hi", count: 1 });
    const headers = { "x-forwarded-for": "203.0.113.9" };
    expect((await route(post(body, headers))).status).toBe(200);
    const limited = await route(post(body, headers));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect((await readApiError(limited))?.code).toBe("rate_limited");
  });

  it("hides unexpected errors behind a generic 500 and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = jsonRoute({ name: "test", body: Body }, () => {
      throw new Error("secret stack detail");
    });
    const res = await route(post(JSON.stringify({ prompt: "hi", count: 1 })));
    expect(res.status).toBe(500);
    const error = await readApiError(res);
    expect(error).toEqual({
      code: "internal",
      message: "Something went wrong",
    });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("passes thrown ApiErrors through", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = jsonRoute({ name: "test", body: Body }, () => {
      throw new ApiError("upstream_timeout", "Gemini timed out");
    });
    const res = await route(post(JSON.stringify({ prompt: "hi", count: 1 })));
    expect(res.status).toBe(504);
    expect((await readApiError(res))?.code).toBe("upstream_timeout");
    log.mockRestore();
  });
});
