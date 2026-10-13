import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisProgress } from "@/components/analysis-progress";
import { createSupabaseClient } from "@/lib/supabase/server";
import { rerunAnalysis } from "../../actions";

type Row = {
  id: string;
  status: string;
  stage: string;
  message: string | null;
  error: string | null;
  failed_stage: string | null;
  commit_sha: string | null;
  projects: { repo_url: string } | null;
};

export default async function AnalysisPage({ params }: PageProps<"/analyses/[id]">) {
  const { id } = await params;
  // Not an organization filter: another organization's row is simply not
  // returned by the policy, and reads as not found.
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("analyses")
    .select("id, status, stage, message, error, failed_stage, commit_sha, projects(repo_url)")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<Row, { merge: false }>();
  if (error) throw new Error(`Could not load the analysis: ${error.message}`);
  if (!data) notFound();

  const finished = data.status === "complete" || data.status === "failed";
  return (
    <div className="p-3">
      <div className="mb-3 flex items-baseline gap-3">
        <Link href="/" className="text-xs text-muted">
          ← analyses
        </Link>
        <h1 className="font-mono text-sm">{data.projects?.repo_url}</h1>
        {data.commit_sha && (
          <span className="font-mono text-xs text-muted">{data.commit_sha.slice(0, 7)}</span>
        )}
      </div>
      <AnalysisProgress
        id={data.id}
        initial={{
          stage: data.stage,
          message: data.stage === "failed" ? data.error : data.message,
        }}
        failedStage={data.failed_stage}
      />
      {finished && (
        <form action={rerunAnalysis} className="mt-3">
          <input type="hidden" name="id" value={data.id} />
          <button type="submit" className="h-7 border border-border bg-surface px-3 text-xs">
            Run again
          </button>
        </form>
      )}
    </div>
  );
}
