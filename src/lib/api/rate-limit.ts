/**
 * In-memory fixed-window rate limiter keyed by client IP.
 *
 * State lives in the server instance's memory, so on Vercel each warm function
 * instance counts separately. That's enough to protect the free-tier AI quota
 * from a single noisy client; it is not a hard global limit.
 */

export type RateLimitResult =
  { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export type RateLimiter = {
  check(key: string): RateLimitResult;
  reset(): void;
};

type Window = { count: number; resetAt: number };

export function createRateLimiter(opts: {
  /** Requests allowed per window per key. */
  limit: number;
  windowMs: number;
  /** Injected for tests. */
  now?: () => number;
  /** Stop tracking new keys past this many (oldest windows are pruned first). */
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, now = Date.now, maxKeys = 10_000 } = opts;
  const windows = new Map<string, Window>();

  function prune(t: number) {
    for (const [key, w] of windows) {
      if (w.resetAt <= t) windows.delete(key);
    }
    // Still full: drop the oldest entries (Map keeps insertion order).
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) break;
      windows.delete(oldest);
    }
  }

  return {
    check(key) {
      const t = now();
      let w = windows.get(key);
      if (!w || w.resetAt <= t) {
        if (!w && windows.size >= maxKeys) prune(t);
        w = { count: 0, resetAt: t + windowMs };
        windows.delete(key);
        windows.set(key, w);
      }
      if (w.count >= limit) {
        return {
          ok: false,
          retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - t) / 1000)),
        };
      }
      w.count += 1;
      return { ok: true, remaining: limit - w.count };
    },
    reset() {
      windows.clear();
    },
  };
}

/** Best-effort client IP from proxy headers (Vercel sets `x-forwarded-for`). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Shared limits by route family (SPEC 9, 19). Tune here, not per route. */
export const rateLimiters = {
  ai: createRateLimiter({ limit: 10, windowMs: 60_000 }),
  geo: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  export: createRateLimiter({ limit: 10, windowMs: 60_000 }),
} satisfies Record<string, RateLimiter>;
