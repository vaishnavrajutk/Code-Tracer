// pnpm parse <directory> [--out result.json]
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseDirectory } from "./parse";
import type { ParseResult, UnresolvedReason } from "./types";
import { validateParseResult } from "./validate";

const GLOSS: Record<UnresolvedReason, string> = {
  "file-not-found": "relative import, no file there",
  "alias-target-not-found": "matches a tsconfig path alias, target missing",
  "workspace-package": "package inside this repo, workspace links not followed",
  "unknown-package": "bare name, not declared in any package.json, no alias",
  "non-literal-dynamic-import": "import() with a computed argument",
  "resolved-to-unknown-file": "compiler found a source file the walk didn't",
};

function print(r: ParseResult): void {
  const { files, imports } = r.coverage;
  const folders = new Set(r.files.map((f) => f.folder));
  const line = (s = "") => console.log(s);

  line(`root      ${r.root}`);
  line(`adapter   ${r.adapter}`);
  line();
  line(`files     found ${files.found} = parsed ${files.parsed} + skipped ${files.skipped}   (+${files.nonSource} non-source files ignored)`);
  const LIST_CAP = 10; // the output file has the full lists
  for (const s of files.skips.slice(0, LIST_CAP)) line(`  skipped ${s.reason.padEnd(12)} ${s.path}`);
  if (files.skips.length > LIST_CAP) line(`  … ${files.skips.length - LIST_CAP} more skips`);
  const dirs = r.coverage.excludedDirectories;
  for (const d of dirs.slice(0, LIST_CAP)) line(`  not walked ${d.reason.padEnd(16)} ${d.path}/`);
  if (dirs.length > LIST_CAP) line(`  … ${dirs.length - LIST_CAP} more directories not walked`);
  line(`folders   ${folders.size} distinct`);
  line(`edges     ${r.edges.length} (duplicates removed)`);
  line();
  line("imports   seen  resolved  external  excluded  unresolved");
  const row = (label: string, c: typeof imports.total) =>
    line(`${label.padEnd(10)}${String(c.seen).padStart(4)}${String(c.resolved).padStart(10)}${String(c.external).padStart(10)}${String(c.excluded).padStart(10)}${String(c.unresolved).padStart(12)}`);
  row("all", imports.total);
  row("import", imports.byKind.import);
  row("re-export", imports.byKind["re-export"]);
  row("dynamic", imports.byKind["dynamic-import"]);
  line();
  line(`external  ${JSON.stringify(imports.external)}`);
  line(`excluded  ${JSON.stringify(imports.excluded)}`);
  for (const [reason, t] of Object.entries(imports.unresolved)) {
    if (t.count === 0) continue;
    line();
    line(`unresolved ${reason}: ${t.count}  (${GLOSS[reason as UnresolvedReason]})`);
    for (const e of t.examples.slice(0, 5)) {
      line(`  ${e.from}:${e.line}  ${e.kind}  ${e.specifier ?? "(computed)"}  — ${e.detail}`);
    }
    if (t.count > 5) line(`  … ${t.count - 5} more${t.examples.length < t.count ? "" : " in the output file"}`);
  }

  const top = (key: "fanIn" | "fanOut") =>
    [...r.files].sort((a, b) => b[key] - a[key]).slice(0, 5).map((f) => `${f[key]} ${f.path}`);
  line();
  line("highest fan-in\n  " + top("fanIn").join("\n  "));
  line("highest fan-out\n  " + top("fanOut").join("\n  "));
}

function main(): void {
  const args = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  const out = outAt === -1 ? null : args[outAt + 1];
  const dir = args.find((a, i) => !a.startsWith("--") && (outAt === -1 || i !== outAt + 1));
  if (!dir || (outAt !== -1 && !out)) {
    console.error("usage: pnpm parse <directory> [--out result.json]");
    process.exit(2);
  }

  const result = parseDirectory(dir);
  print(result);

  if (out) {
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    // Read it back through the validator and compare, so a shape that doesn't
    // survive a round trip fails here rather than in a later phase.
    const back = validateParseResult(JSON.parse(fs.readFileSync(out, "utf8")));
    assert.deepStrictEqual(back, JSON.parse(JSON.stringify(result)));
    console.log(`\nwrote ${out} and read it back: types hold`);
  }
}

main();
