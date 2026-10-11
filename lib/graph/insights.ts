import type { EdgeIndex } from "./summary";

// Four facts about the edge list. Each kind has one fixed sentence; nothing
// here is generated, and nothing is scored. A file listed is a file for which
// the stated fact is true.

export interface InsightFile {
  path: string;
  lines: number;
  frameworkReached: boolean;
}

export const INSIGHT_TEXT = {
  notImported: "Nothing in the repository imports these files.",
  heavilyImported: "More files import these than is typical for this repository.",
  cycle: "These files import each other in a loop.",
  long: "These files are longer than most in this repository.",
} as const;

export interface Cycle {
  /** One real loop, in import order: each file imports the next, and the last
   *  imports the first. */
  path: string[];
  /** Files in the whole mutually-reachable group, which can be more than the loop. */
  groupSize: number;
}

export interface Insights {
  notImported: string[];
  heavilyImported: { path: string; count: number }[];
  /** Imported by more than this many files to be listed above. */
  importerThreshold: number;
  cycles: Cycle[];
  long: { path: string; lines: number }[];
  /** Longer than this many lines to be listed above. */
  lineThreshold: number;
}

// "Unusual" is relative to the repository: above the upper Tukey fence
// (Q3 + 1.5 × IQR). The floors keep a small or flat repository from calling
// three importers or sixty lines unusual just because everything else is tiny.
const MIN_IMPORTERS = 5;
const MIN_LINES = 300;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

function fence(values: number[], floor: number): number {
  const s = [...values].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  return Math.max(floor - 1, q3 + 1.5 * (q3 - q1));
}

// Tarjan's strongly connected components with an explicit stack, so a deep
// import chain can't overflow the call stack. A group of two or more files is
// one in which every file can reach every other, i.e. contains a cycle.
function stronglyConnected(paths: string[], imports: Map<string, string[]>): string[][] {
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const groups: string[][] = [];
  let counter = 0;

  for (const root of paths) {
    if (order.has(root)) continue;
    const work: { node: string; next: number }[] = [{ node: root, next: 0 }];
    order.set(root, counter);
    low.set(root, counter++);
    stack.push(root);
    onStack.add(root);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const edges = imports.get(frame.node) ?? [];
      if (frame.next < edges.length) {
        const to = edges[frame.next++];
        if (!order.has(to)) {
          order.set(to, counter);
          low.set(to, counter++);
          stack.push(to);
          onStack.add(to);
          work.push({ node: to, next: 0 });
        } else if (onStack.has(to)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, order.get(to)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) === order.get(frame.node)) {
        const group: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          group.push(member);
        } while (member !== frame.node);
        if (group.length > 1) groups.push(group);
      }
    }
  }
  return groups;
}

// Shortest loop through `start`, staying inside its group. Breadth-first, so
// the loop shown is the one that is quickest to check by hand.
function loopThrough(start: string, group: Set<string>, imports: Map<string, string[]>): string[] {
  const parent = new Map<string, string>();
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    for (const to of imports.get(at) ?? []) {
      if (!group.has(to)) continue;
      if (to === start) {
        const loop = [at];
        while (loop[0] !== start) loop.unshift(parent.get(loop[0])!);
        return loop;
      }
      if (parent.has(to)) continue;
      parent.set(to, at);
      queue.push(to);
    }
  }
  // Unreachable: a group of two or more always has a loop through each member.
  return [start];
}

export function findInsights(files: InsightFile[], index: EdgeIndex): Insights {
  const importers = (p: string) => index.dependents.get(p)?.length ?? 0;
  const byPath = (a: string, b: string) => a.localeCompare(b);

  const notImported = files
    .filter((f) => importers(f.path) === 0 && !f.frameworkReached)
    .map((f) => f.path)
    .sort(byPath);

  const importerThreshold = fence(files.map((f) => importers(f.path)), MIN_IMPORTERS);
  const heavilyImported = files
    .map((f) => ({ path: f.path, count: importers(f.path) }))
    .filter((r) => r.count > importerThreshold)
    .sort((a, b) => b.count - a.count || byPath(a.path, b.path));

  const lineThreshold = fence(files.map((f) => f.lines), MIN_LINES);
  const long = files
    .filter((f) => f.lines > lineThreshold)
    .map((f) => ({ path: f.path, lines: f.lines }))
    .sort((a, b) => b.lines - a.lines || byPath(a.path, b.path));

  const cycles = stronglyConnected(files.map((f) => f.path).sort(byPath), index.imports)
    .map((group) => {
      const members = new Set(group);
      return { path: loopThrough([...group].sort(byPath)[0], members, index.imports), groupSize: group.length };
    })
    .sort((a, b) => b.groupSize - a.groupSize || byPath(a.path[0], b.path[0]));

  return { notImported, heavilyImported, importerThreshold, cycles, long, lineThreshold };
}
