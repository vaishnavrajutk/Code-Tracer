import { notFound, redirect } from "next/navigation";
import { Explorer } from "@/components/explorer";
import { loadParseResult } from "@/lib/analysis-result";
import { createSupabaseClient } from "@/lib/supabase/server";

type Row = {
  status: string;
  coverage: unknown;
  projects: { repo_url: string } | null;
};

export default async function AnalysisMap({ params }: PageProps<"/analyses/[id]/map">) {
  const { id } = await params;
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("analyses")
    .select("status, coverage, projects(repo_url)")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<Row, { merge: false }>();
  if (error) throw new Error(`Could not load the analysis: ${error.message}`);
  if (!data) notFound();
  // No graph until the run finished: a half-stored one must not be drawn.
  if (data.status !== "complete" || !data.coverage) redirect(`/analyses/${id}`);

  const result = await loadParseResult(supabase, id, data.coverage);
  return <Explorer name={data.projects?.repo_url ?? id} result={result} />;
}
