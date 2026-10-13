"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { runAnalysis, submitRepository } from "@/pipeline/run";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseClient } from "@/lib/supabase/server";

export interface FormState {
  error: string | null;
}

// The run continues after the response, so the redirect lands on the progress
// page immediately and the stages tick past there.
export async function analyseRepository(_: FormState, form: FormData): Promise<FormState> {
  const { orgId } = await auth();
  if (!orgId) return { error: "Select an organization first." };
  const url = form.get("url");
  if (typeof url !== "string" || url.trim() === "") return { error: "Paste a repository URL." };

  const db = createAdminClient();
  let analysisId: string;
  try {
    const submitted = await submitRepository(db, orgId, url);
    analysisId = submitted.analysisId;
    if (submitted.created) {
      after(() => runAnalysis(db, submitted.analysisId));
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(`/analyses/${analysisId}`);
}

// A deliberate re-run of an analysis that is not mid-run. The user-scoped read
// is the authorization: a row from another organization is simply not there.
export async function rerunAnalysis(form: FormData): Promise<void> {
  const id = form.get("id");
  if (typeof id !== "string") return;
  const supabase = await createSupabaseClient();
  const { data } = await supabase
    .from("analyses")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data.status !== "complete" && data.status !== "failed")) return;

  const db = createAdminClient();
  // Reset first, so the page we redirect to reads as queued and not as the
  // finished run it is about to replace.
  const reset = await db
    .from("analyses")
    .update({
      status: "queued",
      stage: "queued",
      message: null,
      error: null,
      failed_stage: null,
      finished_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (reset.error) throw new Error(`Could not restart the analysis: ${reset.error.message}`);
  after(() => runAnalysis(db, id));
  redirect(`/analyses/${id}`);
}
