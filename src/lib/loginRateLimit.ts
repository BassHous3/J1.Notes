/**
 * Optional brute-force protection for POST /api/auth/login.
 *
 * Configuration (environment variables, read on every call):
 *   LOGIN_MAX_ATTEMPTS      Max login attempts per window. 0 or unset = disabled (default).
 *   LOGIN_LOCKOUT_MINUTES   Window / lockout length in minutes. Default: 5.
 *   LOGIN_TRUST_PROXY       "true" = identify clients by CF-Connecting-IP / X-Forwarded-For /
 *                           X-Real-IP. Anything else = all clients share ONE bucket.
 *
 * How it works:
 *   - Every attempt is counted *before* the password is checked, so parallel guesses
 *     cannot slip past the limit.
 *   - When a client reaches LOGIN_MAX_ATTEMPTS attempts inside one window it is locked
 *     out for LOGIN_LOCKOUT_MINUTES. Locked-out requests are rejected without touching
 *     the database or bcrypt.
 *   - A successful login clears the client's counter.
 *
 * State is kept in memory (single-instance deployments, which is what J1.Notes targets).
 * Counters reset when the server restarts.
 */

export interface LoginRateLimitConfig {
  maxAttempts: number;
  lockoutMs: number;
  trustProxy: boolean;
}

export type LoginGate =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

interface Entry {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

const DEFAULT_LOCKOUT_MINUTES = 5;
const PRUNE_THRESHOLD = 500;

// Stored on globalThis so every bundled copy of this module (Next.js may create
// several) and dev-mode hot reloads share one map.
const globalStore = globalThis as unknown as { __j1LoginAttempts?: Map<string, Entry> };
const attempts: Map<string, Entry> = (globalStore.__j1LoginAttempts ??= new Map());

export function getLoginRateLimitConfig(env: Record<string, string | undefined> = process.env): LoginRateLimitConfig {
  const max = parseInt(env.LOGIN_MAX_ATTEMPTS ?? '', 10);
  const minutes = parseFloat(env.LOGIN_LOCKOUT_MINUTES ?? '');
  return {
    maxAttempts: Number.isFinite(max) && max > 0 ? max : 0,
    lockoutMs: (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_LOCKOUT_MINUTES) * 60_000,
    trustProxy: env.LOGIN_TRUST_PROXY === 'true',
  };
}

/**
 * Returns the key used to group attempts.
 * Without a trusted proxy the request carries no reliable client IP, so all
 * clients share one bucket ("global"). That is the safe default: it cannot be
 * bypassed by spoofing headers, at the cost that a lockout affects everyone.
 */
export function getClientKey(request: Request, trustProxy: boolean): string {
  if (!trustProxy) return 'global';
  const headers = request.headers;
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}

function prune(now: number, lockoutMs: number): void {
  if (attempts.size < PRUNE_THRESHOLD) return;
  for (const [key, entry] of attempts) {
    if (entry.lockedUntil <= now && now - entry.windowStart >= lockoutMs) {
      attempts.delete(key);
    }
  }
}

/**
 * Call once per login attempt, before checking the password.
 * Counts the attempt and reports whether it may proceed.
 */
export function beginLoginAttempt(request: Request, now: number = Date.now()): LoginGate {
  const config = getLoginRateLimitConfig();
  if (config.maxAttempts === 0) return { allowed: true };

  prune(now, config.lockoutMs);

  const key = getClientKey(request, config.trustProxy);
  let entry = attempts.get(key);

  if (entry && entry.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  if (!entry || now - entry.windowStart >= config.lockoutMs) {
    entry = { count: 0, windowStart: now, lockedUntil: 0 };
    attempts.set(key, entry);
  }

  entry.count += 1;
  if (entry.count >= config.maxAttempts) {
    entry.lockedUntil = now + config.lockoutMs;
  }
  return { allowed: true };
}

/** Call after a successful login to clear the client's counter. */
export function clearLoginAttempts(request: Request): void {
  const config = getLoginRateLimitConfig();
  if (config.maxAttempts === 0) return;
  attempts.delete(getClientKey(request, config.trustProxy));
}

/** Test helper: forget all counters. */
export function resetLoginRateLimit(): void {
  attempts.clear();
}
