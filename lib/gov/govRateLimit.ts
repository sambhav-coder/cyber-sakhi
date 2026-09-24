/**
 * In-memory sliding-window rate limiter for the government API surface.
 *
 * Posture: per-account brute-force protection is durable in the database
 * (gov_credentials failed_attempts + locked_until). This limiter adds
 * IP-based throttling that bounds high-rate attacks before they reach the
 * bcrypt path. It is process-local (single-instance Next deployment); a
 * multi-instance deployment must move this to a shared store. The durable
 * lockout remains the primary control in every topology.
 *
 * Memory hygiene: stale keys are pruned opportunistically when the map grows
 * large; a host may also call prune() from a scheduled job.
 */

export interface GovRateLimitDecision {
  /** True when the attempt is within the window budget. */
  allowed: boolean;
  /** Seconds-worthy milliseconds of wait after which a retry may succeed. */
  retryAfterMs: number | null;
}

export class GovRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number = 60_000,
    private readonly max: number = 10,
  ) {}

  /**
   * Record an attempt and decide. `nowMs` is injectable for tests; callers
   * should pass nothing and rely on Date.now().
   */
  check(key: string, nowMs: number = Date.now()): GovRateLimitDecision {
    const cutoff = nowMs - this.windowMs;
    const existing = this.hits.get(key) ?? [];
    const fresh = existing.filter((t) => t > cutoff);

    if (fresh.length >= this.max) {
      this.hits.set(key, fresh);
      const retryAfterMs = fresh[0] + this.windowMs - nowMs;
      return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) };
    }

    fresh.push(nowMs);
    this.hits.set(key, fresh);

    if (this.hits.size > 10_000) this.prune(nowMs);
    return { allowed: true, retryAfterMs: null };
  }

  /** Drop keys whose newest hit predates the window (bound memory). */
  prune(nowMs: number = Date.now()): number {
    const cutoff = nowMs - this.windowMs;
    let removed = 0;
    for (const [key, times] of this.hits) {
      const last = times[times.length - 1];
      if (last === undefined || last <= cutoff) {
        this.hits.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Forget one key (e.g. after a clean login from that IP). */
  reset(key: string): void {
    this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }
}

/**
 * Login throttle: 30 attempts per IP per 15 minutes. Deliberately generous
 * enough for shared office NATs to keep working while still bounding
 * scripted guessing well below the durable 5-failure account lockout.
 */
export const govLoginRateLimiter = new GovRateLimiter(15 * 60_000, 30);

/**
 * MFA throttle: 10 code attempts per officer per 15 minutes. Bounds
 * online TOTP/recovery guessing against the 6-digit (10^6) and recovery
 * spaces independently of the IP throttle, so a distributed attack gains
 * nothing. The temporary password-authenticated session is revoked when
 * the budget is exhausted.
 */
export const govMfaRateLimiter = new GovRateLimiter(15 * 60_000, 10);

/**
 * Recovery + enrollment throttle: 10 requests per IP per 15 minutes.
 * Keeps forgot-password, forgot-ID, and enrollment endpoints from being
 * abused for enumeration or delivery spam.
 */
export const govRecoveryRateLimiter = new GovRateLimiter(15 * 60_000, 10);