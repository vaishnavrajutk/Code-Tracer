// The shape `parseDirectory` returns and the CLI writes to disk. Everything
// built after the parser reads this, so changing it is a contract change:
// bump SCHEMA_VERSION.
export const SCHEMA_VERSION = 1;

export const EDGE_KINDS = ["import", "re-export", "dynamic-import"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

// Why a source file was found but not parsed.
export const SKIP_REASONS = [
  "too-large",
  "minified",
  "symlink",
  "unreadable",
  "parse-failed",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const DIRECTORY_EXCLUSION_REASONS = [
  "ignored-name",
  "hidden-directory",
  "symlink",
] as const;
export type DirectoryExclusionReason =
  (typeof DIRECTORY_EXCLUSION_REASONS)[number];

// Outcomes for an import that did not become an edge. Every import seen lands
// in exactly one of: resolved, external, excluded, unresolved.
export const EXTERNAL_REASONS = [
  "node-builtin",
  "node-modules",
  "declared-dependency",
  "url",
  "outside-repository",
] as const;
export type ExternalReason = (typeof EXTERNAL_REASONS)[number];

export const EXCLUDED_REASONS = [
  "excluded-directory",
  "skipped-file",
  "non-source-file",
] as const;
export type ExcludedReason = (typeof EXCLUDED_REASONS)[number];

export const UNRESOLVED_REASONS = [
  "file-not-found",
  "alias-target-not-found",
  "workspace-package",
  "unknown-package",
  "non-literal-dynamic-import",
  "resolved-to-unknown-file",
] as const;
export type UnresolvedReason = (typeof UNRESOLVED_REASONS)[number];

export interface FileNode {
  /** Repo-relative, forward slashes. Unique; edges refer to this. */
  path: string;
  /** The directory the file sits in ("." for the repo root). Finest grouping;
   *  anything coarser is derived downstream. */
  folder: string;
  lines: number;
  bytes: number;
  /** sha256 of the file contents, hex. */
  hash: string;
  /** What the adapter says this file is, or null when it can't tell. */
  kind: string | null;
  /** Distinct files importing this one / distinct files this one imports. */
  fanIn: number;
  fanOut: number;
}

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** First occurrence only; later duplicates are folded into this edge. */
  specifier: string;
  line: number;
}

export interface SkippedFile {
  path: string;
  reason: SkipReason;
}

export interface ExcludedDirectory {
  path: string;
  reason: DirectoryExclusionReason;
}

export interface ImportCounts {
  seen: number;
  resolved: number;
  external: number;
  excluded: number;
  unresolved: number;
}

export interface ImportExample {
  from: string;
  line: number;
  kind: EdgeKind;
  /** null for a dynamic import whose argument isn't a string literal. */
  specifier: string | null;
  detail: string;
}

export interface UnresolvedTally {
  count: number;
  /** A capped sample, in the order found. */
  examples: ImportExample[];
}

export interface Coverage {
  files: {
    /** Source files found in directories that were walked. found = parsed + skipped. */
    found: number;
    parsed: number;
    skipped: number;
    skips: SkippedFile[];
    /** Files that aren't source (images, markdown, ...). Not part of `found`. */
    nonSource: number;
  };
  /** Directories not walked into, so their contents are not counted anywhere above. */
  excludedDirectories: ExcludedDirectory[];
  imports: {
    /** Counted per import statement, before duplicate edges are folded. */
    total: ImportCounts;
    byKind: Record<EdgeKind, ImportCounts>;
    external: Record<ExternalReason, number>;
    excluded: Record<ExcludedReason, number>;
    unresolved: Record<UnresolvedReason, UnresolvedTally>;
  };
}

export interface ParseResult {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Absolute path that was parsed. */
  root: string;
  adapter: string;
  files: FileNode[];
  edges: Edge[];
  coverage: Coverage;
}
