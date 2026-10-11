import {
  DIRECTORY_EXCLUSION_REASONS,
  EDGE_KINDS,
  type ImportCounts,
  type ImportExample,
  type ParseResult,
  SCHEMA_VERSION,
  SKIP_REASONS,
} from "./types";

// Turns JSON read back from disk into a ParseResult, or throws saying where it
// stopped matching. The output file is a contract, so this checks it rather
// than casting.

type Obj = Record<string, unknown>;

function fail(where: string, expected: string): never {
  throw new Error(`Parser output invalid at ${where}: expected ${expected}`);
}
function obj(v: unknown, where: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(where, "an object");
  return v as Obj;
}
function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where, "an array");
  return v;
}
function str(v: unknown, where: string): string {
  if (typeof v !== "string") fail(where, "a string");
  return v;
}
function num(v: unknown, where: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(where, "a number");
  return v;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string): T {
  const s = str(v, where);
  const hit = allowed.find((a) => a === s);
  if (hit === undefined) fail(where, `one of ${allowed.join(", ")}`);
  return hit;
}

function counts(v: unknown, where: string): ImportCounts {
  const o = obj(v, where);
  const c = {
    seen: num(o.seen, `${where}.seen`),
    resolved: num(o.resolved, `${where}.resolved`),
    external: num(o.external, `${where}.external`),
    excluded: num(o.excluded, `${where}.excluded`),
    unresolved: num(o.unresolved, `${where}.unresolved`),
  };
  if (c.seen !== c.resolved + c.external + c.excluded + c.unresolved) {
    fail(where, "seen to equal resolved + external + excluded + unresolved");
  }
  return c;
}

function example(v: unknown, where: string): ImportExample {
  const o = obj(v, where);
  return {
    from: str(o.from, `${where}.from`),
    line: num(o.line, `${where}.line`),
    kind: oneOf(o.kind, EDGE_KINDS, `${where}.kind`),
    specifier: o.specifier === null ? null : str(o.specifier, `${where}.specifier`),
    detail: str(o.detail, `${where}.detail`),
  };
}

export function validateParseResult(value: unknown): ParseResult {
  const top = obj(value, "$");
  if (top.schemaVersion !== SCHEMA_VERSION) fail("$.schemaVersion", String(SCHEMA_VERSION));

  const files = arr(top.files, "$.files").map((v, i) => {
    const w = `$.files[${i}]`;
    const o = obj(v, w);
    return {
      path: str(o.path, `${w}.path`),
      folder: str(o.folder, `${w}.folder`),
      lines: num(o.lines, `${w}.lines`),
      bytes: num(o.bytes, `${w}.bytes`),
      hash: str(o.hash, `${w}.hash`),
      kind: o.kind === null ? null : str(o.kind, `${w}.kind`),
      fanIn: num(o.fanIn, `${w}.fanIn`),
      fanOut: num(o.fanOut, `${w}.fanOut`),
    };
  });

  // The invariant everything downstream leans on: no edge touches a missing node.
  const paths = new Set(files.map((f) => f.path));
  const edges = arr(top.edges, "$.edges").map((v, i) => {
    const w = `$.edges[${i}]`;
    const o = obj(v, w);
    const edge = {
      from: str(o.from, `${w}.from`),
      to: str(o.to, `${w}.to`),
      kind: oneOf(o.kind, EDGE_KINDS, `${w}.kind`),
      specifier: str(o.specifier, `${w}.specifier`),
      line: num(o.line, `${w}.line`),
    };
    if (!paths.has(edge.from) || !paths.has(edge.to)) fail(w, "both ends to be files in the output");
    return edge;
  });

  const cov = obj(top.coverage, "$.coverage");
  const cf = obj(cov.files, "$.coverage.files");
  const skips = arr(cf.skips, "$.coverage.files.skips").map((v, i) => {
    const w = `$.coverage.files.skips[${i}]`;
    const o = obj(v, w);
    return { path: str(o.path, `${w}.path`), reason: oneOf(o.reason, SKIP_REASONS, `${w}.reason`) };
  });
  const found = num(cf.found, "$.coverage.files.found");
  const parsed = num(cf.parsed, "$.coverage.files.parsed");
  const skipped = num(cf.skipped, "$.coverage.files.skipped");
  if (found !== parsed + skipped || skipped !== skips.length || parsed !== files.length) {
    fail("$.coverage.files", "found = parsed + skipped, matching the lists");
  }

  const ci = obj(cov.imports, "$.coverage.imports");
  const bk = obj(ci.byKind, "$.coverage.imports.byKind");
  const ext = obj(ci.external, "$.coverage.imports.external");
  const exc = obj(ci.excluded, "$.coverage.imports.excluded");
  const unr = obj(ci.unresolved, "$.coverage.imports.unresolved");

  return {
    schemaVersion: SCHEMA_VERSION,
    root: str(top.root, "$.root"),
    adapter: str(top.adapter, "$.adapter"),
    files,
    edges,
    coverage: {
      files: { found, parsed, skipped, skips, nonSource: num(cf.nonSource, "$.coverage.files.nonSource") },
      excludedDirectories: arr(cov.excludedDirectories, "$.coverage.excludedDirectories").map((v, i) => {
        const w = `$.coverage.excludedDirectories[${i}]`;
        const o = obj(v, w);
        return {
          path: str(o.path, `${w}.path`),
          reason: oneOf(o.reason, DIRECTORY_EXCLUSION_REASONS, `${w}.reason`),
        };
      }),
      imports: {
        total: counts(ci.total, "$.coverage.imports.total"),
        byKind: {
          import: counts(bk.import, "$.coverage.imports.byKind.import"),
          "re-export": counts(bk["re-export"], "$.coverage.imports.byKind.re-export"),
          "dynamic-import": counts(bk["dynamic-import"], "$.coverage.imports.byKind.dynamic-import"),
        },
        external: {
          "node-builtin": num(ext["node-builtin"], "external.node-builtin"),
          "node-modules": num(ext["node-modules"], "external.node-modules"),
          "declared-dependency": num(ext["declared-dependency"], "external.declared-dependency"),
          url: num(ext.url, "external.url"),
          "outside-repository": num(ext["outside-repository"], "external.outside-repository"),
        },
        excluded: {
          "excluded-directory": num(exc["excluded-directory"], "excluded.excluded-directory"),
          "skipped-file": num(exc["skipped-file"], "excluded.skipped-file"),
          "non-source-file": num(exc["non-source-file"], "excluded.non-source-file"),
        },
        unresolved: {
          "file-not-found": tally(unr["file-not-found"], "unresolved.file-not-found"),
          "alias-target-not-found": tally(unr["alias-target-not-found"], "unresolved.alias-target-not-found"),
          "workspace-package": tally(unr["workspace-package"], "unresolved.workspace-package"),
          "unknown-package": tally(unr["unknown-package"], "unresolved.unknown-package"),
          "non-literal-dynamic-import": tally(unr["non-literal-dynamic-import"], "unresolved.non-literal-dynamic-import"),
          "resolved-to-unknown-file": tally(unr["resolved-to-unknown-file"], "unresolved.resolved-to-unknown-file"),
        },
      },
    },
  };
}

function tally(v: unknown, where: string) {
  const o = obj(v, where);
  return {
    count: num(o.count, `${where}.count`),
    examples: arr(o.examples, `${where}.examples`).map((e, i) => example(e, `${where}.examples[${i}]`)),
  };
}
