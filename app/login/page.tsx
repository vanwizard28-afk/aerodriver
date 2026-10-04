"use client";

import React, { useEffect, useState } from "react";
import { Car, Plane, Mail, ShieldCheck, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const friendlyError = (message: string) => {
  const m = message.toLowerCase();
  if (m.includes("expired"))
    return "That code has expired — request a fresh one below.";
  if (m.includes("invalid") || m.includes("token"))
    return "That code isn't right — check the digits and try again.";
  if (m.includes("rate") || m.includes("security") || m.includes("too many"))
    return "Too many attempts — wait a minute, then request a new code.";
  return message;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Auto-complete any auth material already in the URL — a magic link
  // opened in an unexpected context lands here (or on / via the proxy,
  // which forwards to /auth/confirm). Handles, in order:
  //   ?code=          PKCE exchange (same-browser links)
  //   ?token_hash=    server-style OTP links (works from any context)
  //   #access_token=  implicit fragments (browsers inherit them across
  //                   the proxy's redirect to /login)
  //   existing session or ?error — just act accordingly.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const codeParam = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
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
          if (!err) return router.replace("/");
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
          setError("Couldn't complete that sign-in link — request a new code below.");
          setCompleting(false);
          return;
        }
        const { data: { session } } = await client.auth.getSession();
        if (session) return router.replace("/");
        if (msg) setError(decodeURIComponent(msg.replace(/\+/g, " ")));
      };

      void run();
    });
  }, [router]);

  const sendCode = async () => {
    if (!supabase) {
      setError("Supabase is not configured on this deployment.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Magic-link taps get routed to the server exchange endpoint;
        // if the template also renders {{ .Token }} the code path works
        // from the same single email.
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setBusy(false);
    if (err) setError(friendlyError(err.message));
    else setSent(true);
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    void sendCode();
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured on this deployment.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (err) {
      setError(friendlyError(err.message));
    } else {
      // Session is now in the shared persistent cookie — dashboard proxy
      // and getSession() both see it immediately.
      router.replace("/");
    }
  };

  const resend = () => {
    setCode("");
    void sendCode();
  };

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
        ) : sent ? (
          <form onSubmit={submitCode} className="space-y-4">
            <div className="text-center">
              <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-white">Enter your code</p>
              <p className="text-xs text-slate-400 mt-1.5">
                We sent a 6-digit code to{" "}
                <span className="text-amber-400">{email}</span>. Enter it
                below — no links to open.
              </p>
            </div>
            <div>
              <label
                htmlFor="otp-code"
                className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 text-center"
              >
                6-Digit Code
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-3 text-center text-2xl font-mono font-bold tracking-[0.5em] text-amber-300 placeholder:text-slate-700 placeholder:tracking-[0.5em] outline-none focus:border-amber-400 transition-colors"
              />
            </div>
            {error && (
              <p className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || code.length !== 6 || !isSupabaseConfigured}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all shadow-md shadow-amber-400/10"
            >
              <ShieldCheck className="w-4 h-4" />
              {busy ? "Verifying…" : "Verify Code"}
            </button>
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setCode("");
                  setError("");
                }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Use a different email
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={busy}
                className="text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors"
              >
                Resend code
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitEmail} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Driver Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-400 transition-colors"
              />
            </div>
            {error && (
              <p className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !isSupabaseConfigured}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all shadow-md shadow-amber-400/10"
            >
              <Mail className="w-4 h-4" />
              {busy ? "Sending code…" : "Email me a sign-in code"}
            </button>
            {!isSupabaseConfigured && (
              <p className="text-[11px] text-slate-500 text-center">
                Supabase env vars are not configured — running in local-only mode.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
