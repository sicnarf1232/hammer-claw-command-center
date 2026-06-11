// Single-user auth helpers. Edge-safe (Web Crypto only, no Node Buffer) so the
// same token logic runs in middleware and in route handlers.

export const AUTH_COOKIE = "hc_auth";

// Is app-level password protection enabled? If APP_PASSWORD is unset, the app
// is open (use Vercel password protection instead, per docs/04).
export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

// Deterministic opaque token derived from the password. Stored in the cookie;
// recomputed and compared in middleware. Not reversible to the password.
export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`hammer-claw::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export async function expectedToken(): Promise<string | null> {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return null;
  return tokenFor(pw);
}

// Constant-time string compare.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
