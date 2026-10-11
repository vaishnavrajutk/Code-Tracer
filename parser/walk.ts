import fs from "node:fs";
import path from "node:path";
import type {
  DirectoryExclusionReason,
  ExcludedDirectory,
  SkippedFile,
} from "./types";

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

// Whole directories are kept or dropped by name. Never by size or rank: keeping
// the biggest files and dropping the leaf one of them imports would leave edges
// pointing at nodes that don't exist.
const IGNORED_DIRECTORY_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
]);

const MAX_BYTES = 1024 * 1024;

export function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(name));
}

export function directoryExclusion(
  name: string,
): DirectoryExclusionReason | null {
  if (IGNORED_DIRECTORY_NAMES.has(name)) return "ignored-name";
  if (name.startsWith(".")) return "hidden-directory";
  return null;
}

export interface Candidate {
  path: string;
  abs: string;
}

export interface WalkResult {
  candidates: Candidate[];
  skipped: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
  nonSourceFiles: number;
  packageJsons: string[];
}

export function walkRepository(root: string): WalkResult {
  const result: WalkResult = {
    candidates: [],
    skipped: [],
    excludedDirectories: [],
    nonSourceFiles: 0,
    packageJsons: [],
  };

  function visit(dirAbs: string, dirRel: string): void {
    const entries = fs
      .readdirSync(dirAbs, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      const abs = path.join(dirAbs, entry.name);

      // Symlinks are never followed: they can leave the repo or loop.
      if (entry.isSymbolicLink()) {
        if (isSourceFile(entry.name)) {
          result.skipped.push({ path: rel, reason: "symlink" });
        } else if (fs.statSync(abs, { throwIfNoEntry: false })?.isDirectory()) {
          result.excludedDirectories.push({ path: rel, reason: "symlink" });
        } else {
          result.nonSourceFiles++;
        }
        continue;
      }

      if (entry.isDirectory()) {
        const reason = directoryExclusion(entry.name);
        if (reason) result.excludedDirectories.push({ path: rel, reason });
        else visit(abs, rel);
        continue;
      }
      if (!entry.isFile()) continue;

      if (entry.name === "package.json") result.packageJsons.push(rel);
      if (!isSourceFile(entry.name)) {
        result.nonSourceFiles++;
        continue;
      }
      if (/\.min\.[cm]?js$/.test(entry.name)) {
        result.skipped.push({ path: rel, reason: "minified" });
      } else if (fs.statSync(abs).size > MAX_BYTES) {
        result.skipped.push({ path: rel, reason: "too-large" });
      } else {
        result.candidates.push({ path: rel, abs });
      }
    }
  }

  visit(root, "");
  return result;
}
