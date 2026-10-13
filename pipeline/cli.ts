// pnpm analyse <github-url> --org <clerk-org-id> [--rerun]
// Runs the whole pipeline from a terminal against the real database.
import { createClient } from "@supabase/supabase-js";
import { runAnalysis, submitRepository } from "./run";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Set it in .env.local.`);
    process.exit(2);
  }
  return v;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const orgAt = args.indexOf("--org");
  const orgId = orgAt === -1 ? undefined : args[orgAt + 1];
  const rerun = args.includes("--rerun");
  const url = args.find((a, i) => !a.startsWith("--") && i !== orgAt + 1);
  if (!url || !orgId) {
    console.error("usage: pnpm analyse <github-url> --org <clerk-org-id> [--rerun]");
    process.exit(2);
  }

  process.loadEnvFile(".env.local");
  const db = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { analysisId, created } = await submitRepository(db, orgId, url);
  console.log(`analysis ${analysisId} ${created ? "created" : "already exists"}`);
  if (!created && !rerun) {
    console.log("not re-run (pass --rerun to run it again)");
  } else {
    await runAnalysis(db, analysisId);
  }

  const { data, error } = await db
    .from("analyses")
    .select("status, stage, failed_stage, error, message, commit_sha, coverage")
    .eq("id", analysisId)
    .single();
  if (error) throw new Error(error.message);
  const [files, edges] = await Promise.all(
    ["files", "edges"].map((t) =>
      db.from(t).select("id", { count: "exact", head: true }).eq("analysis_id", analysisId),
    ),
  );
  console.log(
    JSON.stringify(
      { ...data, coverage: data.coverage ? "stored" : null, files: files.count, edges: edges.count },
      null,
      2,
    ),
  );
  if (data.status === "failed") process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
