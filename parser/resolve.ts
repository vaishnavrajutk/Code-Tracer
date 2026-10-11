import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { ts } from "ts-morph";
import type { RawImport } from "./extract";
import { directoryExclusion, isSourceFile } from "./walk";
import type {
  ExcludedReason,
  ExternalReason,
  SkipReason,
  UnresolvedReason,
} from "./types";

export type Outcome =
  | { status: "resolved"; to: string }
  | { status: "external"; reason: ExternalReason }
  | { status: "excluded"; reason: ExcludedReason }
  | { status: "unresolved"; reason: UnresolvedReason; detail: string };

export interface ResolverInput {
  root: string;
  /** Repo-relative paths of every parsed file: the only valid edge targets. */
  files: ReadonlySet<string>;
  skipped: ReadonlyMap<string, SkipReason>;
  packageJsons: readonly string[];
}

interface TsConfig {
  options: ts.CompilerOptions;
  cache: ts.ModuleResolutionCache;
}

const BUILTINS = new Set(builtinModules);

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function matchesAlias(specifier: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => {
    const star = p.indexOf("*");
    if (star === -1) return p === specifier;
    const prefix = p.slice(0, star);
    const suffix = p.slice(star + 1);
    return (
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix)
    );
  });
}

export function createResolver(input: ResolverInput) {
  const { root, files, skipped } = input;

  // package.json knowledge: which names a directory declares, and which names
  // belong to packages inside this repo (a monorepo's workspaces).
  const declared = new Map<string, Set<string>>();
  const workspaceNames = new Set<string>();
  for (const rel of input.packageJsons) {
    try {
      const json: unknown = JSON.parse(
        fs.readFileSync(path.join(root, rel), "utf8"),
      );
      if (typeof json !== "object" || json === null) continue;
      const names = new Set<string>();
      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        const deps = (json as Record<string, unknown>)[field];
        if (typeof deps === "object" && deps !== null) {
          for (const n of Object.keys(deps)) names.add(n);
        }
      }
      declared.set(path.posix.dirname(rel), names);
      const name = (json as Record<string, unknown>).name;
      if (typeof name === "string") workspaceNames.add(name);
    } catch {
      // Unreadable package.json: its dependencies stay undeclared, which
      // shows up as unknown-package rather than being guessed at.
    }
  }

  function isDeclared(fromRel: string, pkg: string): boolean {
    let dir = path.posix.dirname(fromRel);
    for (;;) {
      if (declared.get(dir)?.has(pkg)) return true;
      if (dir === ".") return false;
      dir = path.posix.dirname(dir);
    }
  }

  // The nearest tsconfig.json above a file governs how its imports resolve,
  // the same way the compiler would pick it.
  const configs = new Map<string, TsConfig>();
  function configFor(dirAbs: string): TsConfig {
    const hit = configs.get(dirAbs);
    if (hit) return hit;
    const file = path.join(dirAbs, "tsconfig.json");
    let options: ts.CompilerOptions;
    if (fs.existsSync(file)) {
      const read = ts.readConfigFile(file, ts.sys.readFile);
      if (read.error) {
        throw new Error(
          `Cannot read ${file}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`,
        );
      }
      // files: [] stops the compiler from enumerating the whole project; only
      // the options matter here.
      const parsed = ts.parseJsonConfigFileContent(
        { ...read.config, files: [], include: undefined },
        ts.sys,
        dirAbs,
        undefined,
        file,
      );
      options = { ...parsed.options, allowJs: true, noEmit: true };
    } else if (dirAbs !== root) {
      const up = configFor(path.dirname(dirAbs));
      configs.set(dirAbs, up);
      return up;
    } else {
      options = {
        allowJs: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      };
    }
    const config = {
      options,
      cache: ts.createModuleResolutionCache(dirAbs, (f) => f, options),
    };
    configs.set(dirAbs, config);
    return config;
  }

  function inRepo(abs: string): string | null {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel;
  }

  function classifyInRepo(rel: string): Outcome {
    if (files.has(rel)) return { status: "resolved", to: rel };
    if (skipped.has(rel)) return { status: "excluded", reason: "skipped-file" };
    if (rel.split("/").slice(0, -1).some((seg) => directoryExclusion(seg))) {
      return { status: "excluded", reason: "excluded-directory" };
    }
    if (!isSourceFile(rel)) {
      return { status: "excluded", reason: "non-source-file" };
    }
    // A source file the compiler found but the walk didn't: never guess.
    return {
      status: "unresolved",
      reason: "resolved-to-unknown-file",
      detail: `resolved to ${rel}, which is not in the file list`,
    };
  }

  return function resolve(fromRel: string, imp: RawImport): Outcome {
    const spec = imp.specifier;
    if (spec === null) {
      return {
        status: "unresolved",
        reason: "non-literal-dynamic-import",
        detail: `import(${imp.argumentText}) is not a string literal`,
      };
    }

    if (spec.startsWith("node:") || BUILTINS.has(spec)) {
      return { status: "external", reason: "node-builtin" };
    }
    if (/^(https?|data):/.test(spec)) {
      return { status: "external", reason: "url" };
    }

    const fromAbs = path.join(root, fromRel);
    const config = configFor(path.dirname(fromAbs));
    const resolved = ts.resolveModuleName(
      spec,
      fromAbs,
      config.options,
      ts.sys,
      config.cache,
    ).resolvedModule;

    if (resolved) {
      if (resolved.isExternalLibraryImport) {
        return { status: "external", reason: "node-modules" };
      }
      const rel = inRepo(resolved.resolvedFileName);
      if (rel === null) return { status: "external", reason: "outside-repository" };
      return classifyInRepo(rel);
    }

    if (spec.startsWith(".") || spec.startsWith("/")) {
      // CSS, images and the like: real files, deliberately not nodes.
      const target = path.resolve(path.dirname(fromAbs), spec);
      if (
        !isSourceFile(target) &&
        fs.statSync(target, { throwIfNoEntry: false })?.isFile()
      ) {
        return { status: "excluded", reason: "non-source-file" };
      }
      return {
        status: "unresolved",
        reason: "file-not-found",
        detail: `no file matches ${spec} relative to ${path.posix.dirname(fromRel)}`,
      };
    }

    // Bare specifier the compiler couldn't resolve. A cloned repo has no
    // node_modules, so package imports land here too: tell them apart by what
    // the repo itself declares.
    const pkg = packageName(spec);
    if (workspaceNames.has(pkg)) {
      return {
        status: "unresolved",
        reason: "workspace-package",
        detail: `${pkg} is a package inside this repo; workspace links are not followed`,
      };
    }
    if (isDeclared(fromRel, pkg)) {
      return { status: "external", reason: "declared-dependency" };
    }
    const paths = config.options.paths;
    if (paths && matchesAlias(spec, Object.keys(paths))) {
      return {
        status: "unresolved",
        reason: "alias-target-not-found",
        detail: `${spec} matches a tsconfig path alias but no target file exists`,
      };
    }
    return {
      status: "unresolved",
      reason: "unknown-package",
      detail: `${pkg} is not declared in any package.json above this file and matches no path alias`,
    };
  };
}
