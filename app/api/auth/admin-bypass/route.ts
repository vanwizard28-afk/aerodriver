import { NextResponse } from "next/server";

// Admin quick-access: validates ?key= against the server-only
// ADMIN_BYPASS_KEY env var and, on match, sets a year-long cookie the
// proxy treats as authenticated (dashboard runs in local-only mode).
// With ADMIN_BYPASS_KEY unset this endpoint is inert.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const key = searchParams.get("key") ?? "";
  const expected = process.env.ADMIN_BYPASS_KEY;

  if (!expected) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Admin bypass is not enabled on this deployment")}`
    );
  }
  if (key !== expected) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Invalid admin key")}`
    );
  }

  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set("aerodriver_admin", key, {
    path: "/",
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
