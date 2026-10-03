// Verifies Supabase connectivity and that the AeroDriver schema is present.
// Usage: node scripts/verify-supabase.mjs   (reads .env.local)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, key);
const tables = ["profiles", "flights", "transfers", "driver_schedule"];

let ok = true;
for (const t of tables) {
  const { count, error } = await supabase
    .from(t)
    .select("*", { count: "exact", head: true });
  if (error) {
    ok = false;
    console.log(`x  ${t}: ${error.message}`);
  } else {
    console.log(`ok ${t}: reachable (${count ?? 0} rows visible to anon)`);
  }
}

console.log(
  ok
    ? "\nSupabase connection OK — all tables present."
    : "\nSome checks failed — has the migration been applied?"
);
process.exit(ok ? 0 : 1);
