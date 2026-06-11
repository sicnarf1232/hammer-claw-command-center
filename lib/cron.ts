import type { NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";

// Vercel Cron calls endpoints with `Authorization: Bearer <CRON_SECRET>`.
// Reject anything without the matching secret. If CRON_SECRET is unset we treat
// cron as disabled (return false) so jobs never run unauthenticated.
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (bearer && bearer.length === secret.length && safeEqual(bearer, secret)) {
    return true;
  }
  // Also accept the secret as a query param for manual/testing triggers.
  const q = new URL(req.url).searchParams.get("secret") ?? "";
  return q.length === secret.length && safeEqual(q, secret);
}

export function cronConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET);
}
