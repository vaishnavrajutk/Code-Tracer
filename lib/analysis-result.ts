import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fallbackAdapter } from "@/parser/adapter";
import { type ParseResult, SCHEMA_VERSION } from "@/parser/types";
import { validateParseResult } from "@/parser/validate";

// PostgREST caps a response at 1000 rows, so a large repository is read in
// pages. This ends when the rows do; it is not a poll.
const PAGE = 1000;

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load ${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

interface FileRow {
  id: string;
  path: string;
  folder: string;
  lines: number;
  bytes: number;
  hash: string;
  kind: string | null;
  framework_reached: boolean;
  fan_in: number;
  fan_out: number;
}
interface EdgeRow {
  from_file_id: string;
  to_file_id: string;
  kind: string;
  specifier: string;
  line: number;
}

// Rebuilds what the parser produced from the stored rows, and runs it back
// through the validator so a row that drifted from the contract fails loudly
// here instead of drawing a wrong map. Reads go through the caller's client,
// so the policies decide which rows exist.
export async function loadParseResult(
  db: SupabaseClient,
  analysisId: string,
  coverage: unknown,
): Promise<ParseResult> {
  const files = await readAll<FileRow>(
    (from, to) =>
      db
        .from("files")
        .select("id, path, folder, lines, bytes, hash, kind, framework_reached, fan_in, fan_out")
        .eq("analysis_id", analysisId)
        .order("path")
        .range(from, to)
        .overrideTypes<FileRow[], { merge: false }>(),
    "files",
  );
  const edges = await readAll<EdgeRow>(
    (from, to) =>
      db
        .from("edges")
        .select("from_file_id, to_file_id, kind, specifier, line")
        .eq("analysis_id", analysisId)
        .order("id")
        .range(from, to)
        .overrideTypes<EdgeRow[], { merge: false }>(),
    "edges",
  );

  const pathOf = new Map(files.map((f) => [f.id, f.path]));
  return validateParseResult({
    schemaVersion: SCHEMA_VERSION,
    // The archive's temp directory is gone and was never meaningful.
    root: "",
    // Not stored yet: the only adapter that exists is the fallback.
    adapter: fallbackAdapter.name,
    files: files.map((f) => ({
      path: f.path,
      folder: f.folder,
      lines: f.lines,
      bytes: f.bytes,
      hash: f.hash,
      kind: f.kind,
      frameworkReached: f.framework_reached,
      fanIn: f.fan_in,
      fanOut: f.fan_out,
    })),
    edges: edges.map((e) => ({
      from: pathOf.get(e.from_file_id),
      to: pathOf.get(e.to_file_id),
      kind: e.kind,
      specifier: e.specifier,
      line: e.line,
    })),
    coverage,
  });
}
