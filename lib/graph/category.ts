import { extensionOf } from "./summary";

// A rail category is a value of one file attribute. `null` kind is the
// unclassified bucket, the same one the rail lists.
export type Category = { by: "kind"; value: string | null } | { by: "type"; value: string };

export interface CategoryFile {
  path: string;
  kind: string | null;
}

export function inCategory(file: CategoryFile, c: Category): boolean {
  return c.by === "kind" ? file.kind === c.value : extensionOf(file.path) === c.value;
}

export interface CategoryMatch {
  files: ReadonlySet<string>;
  /** Matching files per map node. Every node is present, zero included. */
  perNode: ReadonlyMap<string, number>;
}

// Nodes partition the files, so the per-node counts sum to the rail's count.
export function matchCategory(
  files: CategoryFile[],
  c: Category,
  nodeOf: ReadonlyMap<string, string>,
  nodeIds: Iterable<string>,
): CategoryMatch {
  const matched = new Set(files.filter((f) => inCategory(f, c)).map((f) => f.path));
  const perNode = new Map<string, number>();
  for (const id of nodeIds) perNode.set(id, 0);
  for (const p of matched) {
    const id = nodeOf.get(p);
    if (id !== undefined) perNode.set(id, (perNode.get(id) ?? 0) + 1);
  }
  return { files: matched, perNode };
}
