import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, expectedToken, safeEqual } from "@/lib/auth";

// Paths that bypass the app password gate. Webhooks and cron carry their own
// secrets (X-HC-Signature / CRON_SECRET) and must be reachable by external
// callers that cannot log in.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/login",
  "/api/webhooks/",
  "/api/cron/",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const expected = await expectedToken();
  if (!expected) {
    // APP_PASSWORD not set: app is open (rely on Vercel password protection).
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, expected)) {
    return NextResponse.next();
  }

  // API calls get a 401; page navigations get redirected to the login form.
  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
