import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDirectory } from "../parser/parse";
import type { ParseResult } from "../parser/types";
import { downloadArchive, parseRepoUrl, resolveHead } from "./github";

// No Next, React or session here: the caller hands in a client that is allowed
// to write. Every row written carries org_id explicitly.

export type Stage = "fetching" | "parsing" | "storing";

const BATCH = 1000;

async function check(
  op: PromiseLike<{ error: { message: string } | null }>,
  what: string,
): Promise<void> {
  const { error } = await op;
  if (error) throw new Error(`${what}: ${error.message}`);
}

export interface Submitted {
  analysisId: string;
  /** False when the repository already had an analysis; nothing new was made. */
  created: boolean;
}

// One analysis per repository: the project is unique per organization and the
// analysis unique per project, so a repeat paste finds the existing row.
export async function submitRepository(
  db: SupabaseClient,
  orgId: string,
  repoUrl: string,
): Promise<Submitted> {
  const repo = parseRepoUrl(repoUrl);

  await check(
    db
      .from("projects")
      .upsert(
        { org_id: orgId, repo_url: repo.key },
        { onConflict: "org_id,repo_url", ignoreDuplicates: true },
      ),
    "Could not save the project",
  );
  const project = await db
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .eq("repo_url", repo.key)
    .single();
  if (project.error) throw new Error(`Could not read the project: ${project.error.message}`);

  const find = () =>
    db.from("analyses").select("id").eq("project_id", project.data.id).maybeSingle();

  const existing = await find();
  if (existing.error) throw new Error(`Could not read the analysis: ${existing.error.message}`);
  if (existing.data) return { analysisId: existing.data.id as string, created: false };

  const inserted = await db
    .from("analyses")
    .insert({ org_id: orgId, project_id: project.data.id })
    .select("id")
    .single();
  if (inserted.data) return { analysisId: inserted.data.id as string, created: true };

  // Lost a race with a second submit of the same URL: the unique index refused
  // us, so the other row is the analysis.
  const raced = await find();
  if (raced.data) return { analysisId: raced.data.id as string, created: false };
  throw new Error(`Could not create the analysis: ${inserted.error?.message ?? "unknown"}`);
}

// Runs fetch → parse → store for an existing analysis row. A failed run does
// not throw: the catch at the top records why and in which stage, so a row
// cannot be left saying "parsing" because something went wrong.
export async function runAnalysis(db: SupabaseClient, analysisId: string): Promise<void> {
  let stage: Stage = "fetching";
  let cleanup: (() => void) | null = null;

  const progress = async (next: Stage, message: string) => {
    stage = next;
    await check(
      db
        .from("analyses")
        .update({
          status: "parsing",
          stage: next,
          message,
          failed_stage: null,
          error: null,
          finished_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", analysisId),
      "Could not record progress",
    );
  };

  try {
    const row = await db
      .from("analyses")
      .select("org_id, projects(repo_url)")
      .eq("id", analysisId)
      .single();
    if (row.error) throw new Error(`Could not read the analysis: ${row.error.message}`);
    const orgId = row.data.org_id as string;
    const project = row.data.projects as unknown as { repo_url: string } | null;
    if (!project) throw new Error("Analysis has no project");
    const repo = parseRepoUrl(project.repo_url);

    await progress("fetching", `Resolving ${repo.key}`);
    const sha = await resolveHead(repo);
    await check(
      db.from("analyses").update({ commit_sha: sha }).eq("id", analysisId),
      "Could not record the commit",
    );
    await progress("fetching", `Downloading ${repo.key} at ${sha.slice(0, 7)}`);
    const checkout = await downloadArchive(repo, sha);
    cleanup = checkout.cleanup;

    await progress("parsing", "Reading imports");
    const result = parseDirectory(checkout.dir);
    cleanup();
    cleanup = null;

    await progress(
      "storing",
      `Storing ${result.files.length} files and ${result.edges.length} edges`,
    );
    await store(db, orgId, analysisId, result);

    const { coverage } = result;
    await check(
      db
        .from("analyses")
        .update({
          status: "complete",
          stage: "complete",
          message: `${coverage.files.parsed} of ${coverage.files.found} source files parsed`,
          coverage,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", analysisId),
      "Could not mark the analysis complete",
    );
  } catch (e) {
    cleanup?.();
    const why = e instanceof Error ? e.message : String(e);
    // Absent beats approximate: a half-stored graph must not be readable.
    await db.from("files").delete().eq("analysis_id", analysisId);
    const failed = await db
      .from("analyses")
      .update({
        status: "failed",
        stage: "failed",
        failed_stage: stage,
        error: why,
        message: null,
        coverage: null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysisId);
    // If even this write fails there is nothing left to record it in; say so
    // loudly rather than swallow it.
    if (failed.error) {
      throw new Error(`Run failed (${why}) and could not be recorded: ${failed.error.message}`);
    }
  }
}

// A re-run replaces the previous files; edges go with them by cascade.
async function store(
  db: SupabaseClient,
  orgId: string,
  analysisId: string,
  result: ParseResult,
): Promise<void> {
  await check(db.from("files").delete().eq("analysis_id", analysisId), "Could not clear old files");

  const ids = new Map<string, string>();
  for (let i = 0; i < result.files.length; i += BATCH) {
    const rows = result.files.slice(i, i + BATCH).map((f) => ({
      org_id: orgId,
      analysis_id: analysisId,
      path: f.path,
      folder: f.folder,
      lines: f.lines,
      bytes: f.bytes,
      hash: f.hash,
      kind: f.kind,
      framework_reached: f.frameworkReached,
      fan_in: f.fanIn,
      fan_out: f.fanOut,
    }));
    const { data, error } = await db.from("files").insert(rows).select("id, path");
    if (error) throw new Error(`Could not store files: ${error.message}`);
    for (const r of data) ids.set(r.path as string, r.id as string);
  }

  for (let i = 0; i < result.edges.length; i += BATCH) {
    const rows = result.edges.slice(i, i + BATCH).map((e) => {
      const from = ids.get(e.from);
      const to = ids.get(e.to);
      // The parser only emits edges between files it kept, so a miss is a bug
      // to surface, not a row to drop.
      if (!from || !to) {
        throw new Error(`Edge ${e.from} → ${e.to} refers to a file that was not stored`);
      }
      return {
        org_id: orgId,
        analysis_id: analysisId,
        from_file_id: from,
        to_file_id: to,
        kind: e.kind,
        specifier: e.specifier,
        line: e.line,
      };
    });
    await check(db.from("edges").insert(rows), "Could not store edges");
  }
}
