import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, tokenFor, safeEqual } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = sanitizeNext(String(form.get("next") ?? "/today"));

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    // Auth disabled: nothing to check, just go in.
    return NextResponse.redirect(new URL(next, req.url));
  }

  const ok =
    password.length === appPassword.length &&
    safeEqual(password, appPassword);
  if (!ok) {
    return NextResponse.redirect(new URL("/login?error=1", req.url));
  }

  const res = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set(AUTH_COOKIE, await tokenFor(appPassword), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

// Only allow same-origin relative redirects.
function sanitizeNext(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/today";
}
