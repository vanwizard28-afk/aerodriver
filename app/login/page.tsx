"use client";

import React, { useEffect, useState } from "react";
import { Car, Plane, Mail, CheckCircle2 } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Surface errors bounced back from Supabase / the callback route.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const msg = params.get("error_description") ?? params.get("error");
    if (msg) queueMicrotask(() => setError(decodeURIComponent(msg.replace(/\+/g, " "))));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured on this deployment.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
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

        {sent ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-bold text-white">Check your inbox</p>
            <p className="text-xs text-slate-400 mt-1.5">
              We sent a sign-in link to <span className="text-amber-400">{email}</span>.
              Open it on this device to continue.
            </p>
          </div>
        ) : (
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
              {busy ? "Sending link…" : "Email me a sign-in link"}
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
