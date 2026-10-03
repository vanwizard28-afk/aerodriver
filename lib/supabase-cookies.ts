// Shared cookie config for every @supabase/ssr client.
// - path=/: the session + PKCE verifier cookies are readable by every
//   route on the origin (a path-scoped cookie would be invisible to
//   /auth/confirm if it was written under /login).
// - sameSite=lax: cookies are sent on top-level GET navigations, which
//   is exactly how a magic link arrives (mail app -> browser -> site).
// - maxAge: a persistent cookie rather than a session cookie, so the
//   login survives browser restarts — and, on Android/desktop where the
//   installed PWA shares the browser's cookie jar, survives inside the
//   home-screen app too.
export const SUPABASE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  secure: true,
  maxAge: 60 * 60 * 24 * 365,
} as const;
