"use client";

import React, { useEffect, useState } from "react";
import { Car, Plane, Mail, Lock, Eye, EyeOff, LoaderCircle, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

type Mode = "signin" | "signup" | "setpw";

const friendlyError = (message: string) => {
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Email or password isn't right — or this account was created with a sign-in link. Use 'Forgot / set password' below.";
  if (m.includes("already registered") || m.includes("already in use"))
    return "That email already has an account — switch to Sign In, or use 'Forgot / set password'.";
  if (m.includes("password") && m.includes("at least"))
    return "Password needs to be at least 6 characters.";
  if (m.includes("expired"))
    return "That link has expired — request a fresh one below.";
  if (m.includes("rate") || m.includes("security") || m.includes("too many"))
    return "Too many attempts — wait a minute, then try again.";
  return message;
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState("");

  // Auto-complete any auth material already in the URL — covers legacy
  // magic links still sitting in inboxes and the recovery link landing.
  //   ?code=          PKCE exchange (same-browser links)
  //   ?token_hash=    server-style OTP links (any context)
  //   #access_token=  implicit fragments (survive proxy redirects)
  //   ?recovery=1     password-reset landing → show set-password form
  //   existing session → straight to the dashboard
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const codeParam = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const recovery = params.get("recovery");
      const bypassParam = params.get("bypass");
      // /login?bypass=<key> → straight to the bypass endpoint; the route
      // validates the key and sets the 1-year admin cookie itself.
      // /login?bypass=true just reveals the key field.
      if (bypassParam && bypassParam !== "true" && bypassParam !== "1") {
        window.location.assign(
          `${window.location.origin}/api/auth/admin-bypass?key=${encodeURIComponent(bypassParam)}`
        );
        return;
      }
      if (bypassParam === "true" || bypassParam === "1") {
        setShowAdmin(true);
      }
      const hasImplicitHash = Boolean(
        hash.get("access_token") || hash.get("refresh_token")
      );
      const msg = params.get("error_description") ?? params.get("error");

      const run = async () => {
        if (codeParam) {
          setCompleting(true);
          const { error: err } = await client.auth.exchangeCodeForSession(codeParam);
          if (!err) return router.replace("/");
          setError(friendlyError(err.message));
          setCompleting(false);
          return;
        }
        if (tokenHash && type) {
          setCompleting(true);
          const { error: err } = await client.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as EmailOtpType,
          });
          if (!err) {
            if (type === "recovery") {
              setMode("setpw");
              setCompleting(false);
              return;
            }
            return router.replace("/");
          }
          setError(friendlyError(err.message));
          setCompleting(false);
          return;
        }
        if (hasImplicitHash) {
          setCompleting(true);
          // detectSessionInUrl parses the fragment during client init —
          // poll briefly for the session to materialise.
          for (let i = 0; i < 5; i++) {
            const { data: { session } } = await client.auth.getSession();
            if (session) return router.replace("/");
            await new Promise((r) => setTimeout(r, 200));
          }
          setError("Couldn't complete that sign-in link — try signing in below.");
          setCompleting(false);
          return;
        }
        const { data: { session } } = await client.auth.getSession();
        if (session) {
          if (recovery) {
            setMode("setpw");
            return;
          }
          return router.replace("/");
        }
        if (msg) setError(decodeURIComponent(msg.replace(/\+/g, " ")));
      };

      void run();
    });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured on this deployment.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");

    if (mode === "setpw") {
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        setBusy(false);
        return;
      }
      const { error: err } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (err) setError(friendlyError(err.message));
      else router.replace("/");
      return;
    }

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        setBusy(false);
        return;
      }
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      setBusy(false);
      if (err) {
        setError(friendlyError(err.message));
      } else if (data.session) {
        router.replace("/");
      } else {
        setNotice(
          "Account created — check your email to confirm the address, then sign in."
        );
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
      }
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (err) setError(friendlyError(err.message));
    else router.replace("/");
  };

  const sendRecovery = async () => {
    if (!supabase) {
      setError("Supabase is not configured on this deployment.");
      return;
    }
    if (!email) {
      setError("Enter your email first, then tap the recovery link.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/login?recovery=1")}`,
    });
    setBusy(false);
    if (err) setError(friendlyError(err.message));
    else
      setNotice(
        "Check your email — the recovery link brings you back here to set a new password."
      );
  };

  const goAdminBypass = () => {
    if (!adminKey) return;
    // Full navigation — the endpoint sets the cookie and redirects to /.
    window.location.assign(
      `${window.location.origin}/api/auth/admin-bypass?key=${encodeURIComponent(adminKey)}`
    );
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const passwordField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string
  ) => (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          required
          minLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder="••••••••"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 pr-10 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400 transition-colors"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="relative bg-amber-400 text-slate-950 p-2.5 rounded-xl font-bold shadow-lg shadow-amber-400/10">
            <Car className="w-6 h-6" />
            <div className="absolute -top-1.5 -right-1.5 bg-slate-900 border border-amber-400/40 rounded-full p-1 shadow-md">
              <Plane className="w-3 h-3 text-amber-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">AeroDriver</h1>
            <p className="text-xs text-slate-400">Chauffeur & Flight Monitoring</p>
          </div>
        </div>

        {completing ? (
          <div className="text-center py-6">
            <LoaderCircle className="w-10 h-10 text-amber-400 mx-auto mb-3 animate-spin" />
            <p className="text-sm font-bold text-white">Completing sign-in…</p>
            <p className="text-xs text-slate-400 mt-1.5">
              Verifying your sign-in link with Supabase.
            </p>
            {error && (
              <p className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mt-4">
                {error}
              </p>
            )}
          </div>
        ) : mode === "setpw" ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center">
              <KeyRound className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-white">Set your new password</p>
              <p className="text-xs text-slate-400 mt-1.5">
                You&apos;re signed in from your recovery link — choose a
                password for next time.
              </p>
            </div>
            {passwordField("New Password", password, setPassword, "new-password")}
            {passwordField("Confirm Password", confirmPassword, setConfirmPassword, "new-password")}
            {error && (
              <p className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || password.length < 6}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all shadow-md shadow-amber-400/10"
            >
              <KeyRound className="w-4 h-4" />
              {busy ? "Saving…" : "Save Password & Continue"}
            </button>
          </form>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 mb-5">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`text-xs font-bold py-2 rounded-lg transition-colors ${
                    mode === m
                      ? "bg-amber-400 text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m === "signin" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Driver Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400 transition-colors"
                />
              </div>
              {passwordField(
                "Password",
                password,
                setPassword,
                mode === "signin" ? "current-password" : "new-password"
              )}
              {mode === "signup" &&
                passwordField("Confirm Password", confirmPassword, setConfirmPassword, "new-password")}

              {error && (
                <p className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              {notice && (
                <p className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !isSupabaseConfigured}
                className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all shadow-md shadow-amber-400/10"
              >
                {mode === "signin" ? <Lock className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                {busy
                  ? "Working…"
                  : mode === "signin"
                    ? "Sign In"
                    : "Create Account"}
              </button>

              {mode === "signin" && (
                <button
                  type="button"
                  onClick={sendRecovery}
                  disabled={busy}
                  className="w-full text-[11px] font-semibold text-slate-400 hover:text-amber-300 transition-colors text-center"
                >
                  Forgot password, or signed up with a magic link?{" "}
                  <span className="text-amber-400">Email me a reset link</span>
                </button>
              )}

              {!isSupabaseConfigured && (
                <p className="text-[11px] text-slate-500 text-center">
                  Supabase env vars are not configured — running in local-only mode.
                </p>
              )}
            </form>
          </>
        )}

        {/* Admin quick access — key is validated server-side against
            ADMIN_BYPASS_KEY; a wrong key just bounces back here. */}
        {!completing && isSupabaseConfigured && (
          <div className="mt-6 pt-4 border-t border-slate-800/60">
            {!showAdmin ? (
              <button
                type="button"
                onClick={() => setShowAdmin(true)}
                className="w-full text-[10px] font-semibold text-slate-600 hover:text-slate-400 transition-colors text-center tracking-wider uppercase"
              >
                Admin Quick Access
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goAdminBypass()}
                  placeholder="Admin key"
                  aria-label="Admin key"
                  autoComplete="off"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={goAdminBypass}
                  disabled={!adminKey}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold px-4 py-2 rounded-lg text-xs transition-colors border border-slate-700"
                >
                  Enter
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
