import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Project } from "ts-morph";
import { type Adapter, fallbackAdapter } from "./adapter";
import { extractImports, type RawImport } from "./extract";
import { computeFan } from "./graph";
import { createResolver } from "./resolve";
import {
  type Edge,
  type EdgeKind,
  type FileNode,
  type ImportCounts,
  type ImportExample,
  type ParseResult,
  SCHEMA_VERSION,
  type SkippedFile,
  type SkipReason,
  type UnresolvedReason,
  type UnresolvedTally,
} from "./types";
import { walkRepository } from "./walk";

const MAX_EXAMPLES = 20;

const zeroCounts = (): ImportCounts => ({
  seen: 0,
  resolved: 0,
  external: 0,
  excluded: 0,
  unresolved: 0,
});
const emptyTally = (): UnresolvedTally => ({ count: 0, examples: [] });

function countLines(text: string): number {
  if (text === "") return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith("\n") ? n - 1 : n;
}

interface ParsedFile {
  node: FileNode;
  imports: RawImport[];
}

// Path in, data out. No network, no framework, no database.
export function parseDirectory(
  rootInput: string,
  options: { adapter?: Adapter } = {},
): ParseResult {
  const adapter = options.adapter ?? fallbackAdapter;
  const root = path.resolve(rootInput);
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${root} is not a directory`);
  }

  const walked = walkRepository(root);
  const skips: SkippedFile[] = [...walked.skipped];
  const parsed: ParsedFile[] = [];

  // In-memory so ts-morph never touches the disk or follows imports itself:
  // resolution is ours, and explicit.
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Phase 1: read and extract everything. A file that fails here becomes a
  // skip, so it is settled before any edge is drawn to it.
  for (const c of walked.candidates) {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(c.abs);
    } catch {
      skips.push({ path: c.path, reason: "unreadable" });
      continue;
    }
    const text = buf.toString("utf8");
    let imports: RawImport[];
    try {
      imports = extractImports(project, c.path, text);
    } catch {
      skips.push({ path: c.path, reason: "parse-failed" });
      continue;
    }
    const folder = path.posix.dirname(c.path);
    parsed.push({
      imports,
      node: {
        path: c.path,
        folder,
        lines: countLines(text),
        bytes: buf.length,
        hash: crypto.createHash("sha256").update(buf).digest("hex"),
        kind: adapter.classify({ path: c.path, folder }),
        frameworkReached: adapter.reachedByFramework({ path: c.path, folder }),
        fanIn: 0,
        fanOut: 0,
      },
    });
  }

  // Phase 2: resolve against the final file list.
  const resolve = createResolver({
    root,
    files: new Set(parsed.map((p) => p.node.path)),
    skipped: new Map<string, SkipReason>(skips.map((s) => [s.path, s.reason])),
    packageJsons: walked.packageJsons,
  });

  const total = zeroCounts();
  const byKind: Record<EdgeKind, ImportCounts> = {
    import: zeroCounts(),
    "re-export": zeroCounts(),
    "dynamic-import": zeroCounts(),
  };
  const external = {
    "node-builtin": 0,
    "node-modules": 0,
    "declared-dependency": 0,
    url: 0,
    "outside-repository": 0,
  };
  const excluded = {
    "excluded-directory": 0,
    "skipped-file": 0,
    "non-source-file": 0,
  };
  const unresolved: Record<UnresolvedReason, UnresolvedTally> = {
    "file-not-found": emptyTally(),
    "alias-target-not-found": emptyTally(),
    "workspace-package": emptyTally(),
    "unknown-package": emptyTally(),
    "non-literal-dynamic-import": emptyTally(),
    "resolved-to-unknown-file": emptyTally(),
  };
  const edges = new Map<string, Edge>();

  for (const file of parsed) {
    for (const imp of file.imports) {
      const outcome = resolve(file.node.path, imp);
      const counts = [total, byKind[imp.kind]];
      for (const c of counts) c.seen++;
      for (const c of counts) c[outcome.status]++;

      if (outcome.status === "resolved") {
        const key = `${file.node.path}\0${outcome.to}\0${imp.kind}`;
        if (!edges.has(key)) {
          edges.set(key, {
            from: file.node.path,
            to: outcome.to,
            kind: imp.kind,
            specifier: imp.specifier ?? "",
            line: imp.line,
          });
        }
      } else if (outcome.status === "external") {
        external[outcome.reason]++;
      } else if (outcome.status === "excluded") {
        excluded[outcome.reason]++;
      } else {
        const tally = unresolved[outcome.reason];
        tally.count++;
        if (tally.examples.length < MAX_EXAMPLES) {
          const example: ImportExample = {
            from: file.node.path,
            line: imp.line,
            kind: imp.kind,
            specifier: imp.specifier,
            detail: outcome.detail,
          };
          tally.examples.push(example);
        }
      }
    }
  }

  const edgeList = [...edges.values()];
  const fan = computeFan(
    parsed.map((p) => p.node.path),
    edgeList,
  );
  const files = parsed.map((p) => ({ ...p.node, ...fan.get(p.node.path)! }));

  return {
    schemaVersion: SCHEMA_VERSION,
    root,
    adapter: adapter.name,
    files,
    edges: edgeList,
    coverage: {
      files: {
        found: parsed.length + skips.length,
        parsed: parsed.length,
        skipped: skips.length,
        skips,
        nonSource: walked.nonSourceFiles,
      },
      excludedDirectories: walked.excludedDirectories,
      imports: { total, byKind, external, excluded, unresolved },
    },
  };
}
