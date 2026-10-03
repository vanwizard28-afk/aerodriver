import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase-cookies";

// Canonical Supabase SSR confirm endpoint. Handles the link formats
// whose credentials live in the query string (?code=, ?token_hash=).
// Implicit links carry #access_token in the URL fragment, which never
// reaches the server — those are bounced to the client-side callback
// page (the browser preserves the fragment across the redirect).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return NextResponse.redirect(`${origin}/login`);

  if (!code && !tokenHash) {
    const qs = searchParams.size ? `?${searchParams}` : "";
    return NextResponse.redirect(`${origin}/auth/callback${qs}`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type ?? "magiclink" });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }
  return NextResponse.redirect(`${origin}/`);
}
