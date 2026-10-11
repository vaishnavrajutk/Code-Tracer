// What the detail pane says, derived from the parser's files and edges.
// Pure, so every number in the pane is a count of a list that is also shown.

export interface SummaryFile {
  path: string;
  kind: string | null;
}
export interface SummaryEdge {
  from: string;
  to: string;
}

export interface EdgeIndex {
  /** Files this one imports, sorted. */
  imports: Map<string, string[]>;
  /** Files importing this one, sorted. */
  dependents: Map<string, string[]>;
  /** Distinct (importer, imported) pairs. */
  edgeCount: number;
}

// Counts and lists come from the same sets, so "7" always has seven rows.
// Self-imports are not a connection between two files and are left out.
export function indexEdges(edges: SummaryEdge[]): EdgeIndex {
  const out = new Map<string, Set<string>>();
  const into = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    const s = m.get(k) ?? new Set<string>();
    s.add(v);
    m.set(k, s);
  };
  for (const e of edges) {
    if (e.from === e.to) continue;
    add(out, e.from, e.to);
    add(into, e.to, e.from);
  }
  const sorted = (m: Map<string, Set<string>>) =>
    new Map([...m].map(([k, v]) => [k, [...v].sort()] as const));
  let edgeCount = 0;
  for (const s of out.values()) edgeCount += s.size;
  return { imports: sorted(out), dependents: sorted(into), edgeCount };
}

export interface Ranked {
  path: string;
  count: number;
}

export interface RepoSummary {
  files: number;
  imports: number;
  /** Files with at least one dependent, most depended-on first. */
  mostDependedOn: Ranked[];
  /** Files nothing imports, with how many things each imports, most first. */
  entryPoints: Ranked[];
  /** Files no convention could identify. */
  unclassified: number;
}

export function summarize(files: SummaryFile[], index: EdgeIndex): RepoSummary {
  const dependents = (p: string) => index.dependents.get(p)?.length ?? 0;
  const imports = (p: string) => index.imports.get(p)?.length ?? 0;
  const byCountThenPath = (a: Ranked, b: Ranked) => b.count - a.count || a.path.localeCompare(b.path);
  return {
    files: files.length,
    imports: index.edgeCount,
    mostDependedOn: files
      .map((f) => ({ path: f.path, count: dependents(f.path) }))
      .filter((r) => r.count > 0)
      .sort(byCountThenPath),
    entryPoints: files
      .filter((f) => dependents(f.path) === 0)
      .map((f) => ({ path: f.path, count: imports(f.path) }))
      .sort(byCountThenPath),
    unclassified: files.filter((f) => f.kind === null).length,
  };
}

/** How many files of each kind, most first. `null` is the unclassified bucket. */
export function kindCounts(files: SummaryFile[]): { kind: string | null; count: number }[] {
  const counts = new Map<string | null, number>();
  for (const f of files) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  return [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || (a.kind ?? "").localeCompare(b.kind ?? ""));
}

/** Same definition the map's node uses: distinct files outside `paths` that
 *  import something inside, and distinct files outside that something inside imports. */
export function boundary(paths: string[], index: EdgeIndex): { fanIn: number; fanOut: number } {
  const inside = new Set(paths);
  const from = new Set<string>();
  const to = new Set<string>();
  for (const p of paths) {
    for (const d of index.dependents.get(p) ?? []) if (!inside.has(d)) from.add(d);
    for (const i of index.imports.get(p) ?? []) if (!inside.has(i)) to.add(i);
  }
  return { fanIn: from.size, fanOut: to.size };
}

// File type is read off the path, which is a fact about the file and needs no
// framework knowledge, so it lives here and not in the adapter.
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "no extension" : name.slice(dot);
}

/** How many of `paths` have each extension, most first. */
export function typeCounts(paths: string[]): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of paths) counts.set(extensionOf(p), (counts.get(extensionOf(p)) ?? 0) + 1);
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}
