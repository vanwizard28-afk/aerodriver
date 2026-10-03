"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Plane } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (!supabase) {
        router.replace("/login");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type") as EmailOtpType | null;
      const linkError =
        params.get("error_description") ?? params.get("error");

      try {
        if (linkError) throw new Error(linkError);
        if (code) {
          // PKCE flow — the code verifier lives in this browser's storage.
          const { error: err } = await supabase.auth.exchangeCodeForSession(code);
          if (err) throw err;
        } else if (tokenHash && type) {
          // token_hash flow — email template links straight to the callback.
          const { error: err } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (err) throw err;
        } else {
          // Implicit flow — supabase-js detects #access_token/#refresh_token
          // in the URL hash automatically (detectSessionInUrl) and stores
          // the session during client init; getSession resolves once done.
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) throw new Error("No session found in this link");
        }
        if (!cancelled) router.replace("/");
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "This sign-in link did not work"
        );
        timer = setTimeout(() => router.replace("/login"), 3000);
      }
    };
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-sm font-bold text-red-400 mb-1.5">{error}</p>
            <p className="text-xs text-slate-400">Redirecting to sign in…</p>
          </>
        ) : (
          <>
            <Plane className="w-8 h-8 text-amber-400 mx-auto mb-3 animate-pulse" />
            <p className="text-sm font-bold text-white">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}
