// Launch-readiness gate (Phase 10, TD-71). Run against the environment a production deploy will use, e.g.
//   node --env-file=.env.production scripts/launch-check.mts
// Exits 1 if any check fails. Prints only check names and non-sensitive details — never secret values.
import { createClient } from "@supabase/supabase-js";
import { checkLaunchEnv, type LaunchCheck } from "../src/modules/core/launch-checks.ts";

const env = process.env;
const results: { group: string; check: LaunchCheck }[] = checkLaunchEnv(env).map((check) => ({ group: "env", check }));

if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.schema("api").rpc("launch_readiness");
  if (error)
    results.push({ group: "db", check: { key: "database_reachable", ok: false, detail: error.code ?? "error" } });
  else for (const check of (data as { checks: LaunchCheck[] }).checks) results.push({ group: "db", check });
} else {
  results.push({ group: "db", check: { key: "database_reachable", ok: false, detail: "Supabase URL or key not set" } });
}

for (const { group, check } of results)
  console.log(`${check.ok ? "PASS" : "FAIL"}  ${group.padEnd(3)}  ${check.key.padEnd(28)} ${check.detail}`);
const failed = results.filter((r) => !r.check.ok).length;
console.log(failed ? `\n${failed} check(s) failed — not ready to launch.` : "\nAll launch checks passed.");
process.exitCode = failed ? 1 : 0;
