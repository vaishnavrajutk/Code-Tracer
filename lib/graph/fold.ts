// Folding: how a repository's directory tree becomes a readable number of
// nodes. Pure over the file list; the repository's own shape decides the
// depth, nothing is picked in advance.

export interface FoldFile {
  path: string;
  /** Directory the file sits in, "." for the repo root. */
  folder: string;
}

export interface FoldedNode {
  /** The surviving directory every file in `files` was merged up into. */
  id: string;
  files: string[];
}

export interface Folding {
  threshold: number;
  nodes: FoldedNode[];
  nodeOf: Map<string, string>;
}

// "Roughly two dozen" is the most a person can read on one canvas.
const TARGET_NODES = 24;
const ROOT = ".";

const depth = (dir: string) => (dir === ROOT ? 0 : dir.split("/").length);
const parentOf = (dir: string) => {
  const i = dir.lastIndexOf("/");
  return i < 0 ? ROOT : dir.slice(0, i);
};

function foldAt(files: FoldFile[], threshold: number): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  // Every directory starts as its own node, empty ancestors included, so a
  // merge always has a parent to land in.
  for (const f of files) {
    let dir = f.folder;
    const list = groups.get(dir) ?? [];
    list.push(f.path);
    groups.set(dir, list);
    while (dir !== ROOT) {
      dir = parentOf(dir);
      if (!groups.has(dir)) groups.set(dir, []);
    }
  }

  let deepest = 0;
  for (const dir of groups.keys()) deepest = Math.max(deepest, depth(dir));

  for (let d = deepest; d >= 1; d--) {
    // Decide the whole level from a snapshot taken before any of it merges.
    // A merge here only grows a parent at d-1, which this pass never reads,
    // so no merge changes what another merge at the same depth sees.
    const merging = [...groups]
      .filter(([dir, list]) => depth(dir) === d && list.length < threshold)
      .map(([dir]) => dir);
    for (const dir of merging) {
      const up = groups.get(parentOf(dir));
      if (!up) continue;
      up.push(...(groups.get(dir) ?? []));
      groups.delete(dir);
    }
  }
  return groups;
}

export function fold(files: FoldFile[]): Folding {
  // Lowest threshold that lands at or under the target. The root has nowhere
  // to merge, so it survives however small it is.
  let groups = foldAt(files, 2);
  let threshold = 2;
  const count = (g: Map<string, string[]>) => [...g.values()].filter((l) => l.length > 0).length;
  while (count(groups) > TARGET_NODES && threshold <= files.length) {
    threshold++;
    groups = foldAt(files, threshold);
  }

  const nodes = [...groups]
    .filter(([, list]) => list.length > 0)
    .map(([id, list]) => ({ id, files: list }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const nodeOf = new Map<string, string>();
  for (const n of nodes) for (const p of n.files) nodeOf.set(p, n.id);
  return { threshold, nodes, nodeOf };
}

/** Shortest trailing run of path segments that is unique among `ids`. */
export function shortLabels(ids: string[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const id of ids) {
    if (id === ROOT) {
      labels.set(id, ROOT);
      continue;
    }
    const parts = id.split("/");
    let n = 1;
    const tail = (other: string, k: number) => other.split("/").slice(-k).join("/");
    while (n < parts.length && ids.some((o) => o !== id && o !== ROOT && tail(o, n) === tail(id, n))) n++;
    labels.set(id, tail(id, n));
  }
  return labels;
}
