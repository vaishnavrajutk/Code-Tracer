"use client";

import { useState, type ReactNode } from "react";
import { INSIGHT_TEXT, type Insights } from "@/lib/graph/insights";
import { DEFAULT_DEPTH, reach, type Direction } from "@/lib/graph/reach";
import type { Selection } from "@/lib/graph/highlight";
import { boundary, kindCounts, typeCounts, type EdgeIndex, type RepoSummary } from "@/lib/graph/summary";
import type { FileNode } from "@/parser/types";

export type Tab = "structure" | "explanation";

export interface PaneData {
  name: string;
  adapter: string;
  files: FileNode[];
  byPath: Map<string, FileNode>;
  index: EdgeIndex;
  summary: RepoSummary;
  insights: Insights;
  /** Folded node id -> the files inside it. */
  nodeFiles: Map<string, string[]>;
}

interface Props {
  data: PaneData;
  selection: Selection | null;
  tab: Tab;
  onTab: (t: Tab) => void;
  onSelectPath: (path: string) => void;
  hover: Selection | null;
  onHover: (s: Selection | null) => void;
  /** Whether the pane's file `path` is the one being hovered on the map. */
  isHot: (path: string) => boolean;
  nodeOf: (path: string) => string;
}

// Lists on the resting summary are capped; the total is always stated.
const TOP = 10;

const unclassified = "unclassified";

function Heading({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <h3 className="mt-5 mb-1 flex justify-between border-t border-border pt-3 text-[10px] uppercase tracking-wide text-muted">
      <span>{children}</span>
      {note && <span className="tabular-nums">{note}</span>}
    </h3>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background px-2 py-1.5">
      <div className="text-lg leading-tight tabular-nums">{fmt(value)}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between py-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export function DetailPane(props: Props) {
  const { selection, tab, onTab } = props;
  const tabs: { id: Tab; label: string }[] = [
    { id: "structure", label: "Structure" },
    { id: "explanation", label: "Explanation" },
  ];
  return (
    <div className="flex h-full flex-col text-xs">
      <div role="tablist" className="flex shrink-0 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`px-3 py-1.5 ${tab === t.id ? "border-b border-accent text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "explanation" ? (
          <p className="text-muted">No explanation yet.</p>
        ) : selection === null ? (
          <Summary {...props} />
        ) : selection.kind === "file" ? (
          <FileView key={selection.path} {...props} path={selection.path} />
        ) : (
          <FolderView data={props.data} id={selection.id} />
        )}
        {tab === "structure" && <InsightsPanel {...props} />}
      </div>
    </div>
  );
}

function PathButton({
  path,
  note,
  bar,
  props,
}: {
  path: string;
  note?: ReactNode;
  /** 0..1 share of the list's largest count, drawn behind the row. */
  bar?: { share: number; className: string };
  props: Props;
}) {
  const hot = props.isHot(path);
  return (
    <li>
      <button
        type="button"
        title={path}
        onClick={() => props.onSelectPath(path)}
        onMouseEnter={() => props.onHover({ kind: "file", path, node: props.nodeOf(path) })}
        onMouseLeave={() => props.onHover(null)}
        className={`relative flex w-full items-baseline justify-between gap-2 px-1.5 py-1 text-left hover:bg-background ${hot ? "bg-background" : ""}`}
      >
        {bar && (
          <span
            aria-hidden
            style={{ width: `${Math.max(2, bar.share * 100)}%` }}
            className={`absolute inset-y-0 left-0 opacity-15 ${bar.className}`}
          />
        )}
        <span className="relative min-w-0 break-all font-mono">{path}</span>
        {note !== undefined && <span className="relative shrink-0 tabular-nums">{note}</span>}
      </button>
    </li>
  );
}

function PathList({ paths, props }: { paths: string[]; props: Props }) {
  if (paths.length === 0) return <p className="px-1 py-0.5 text-muted">none</p>;
  return (
    <ul>
      {paths.map((p) => (
        <PathButton key={p} path={p} props={props} />
      ))}
    </ul>
  );
}

function Summary(props: Props) {
  const { data } = props;
  const s = data.summary;
  const framework = data.adapter === "none" ? "none detected" : data.adapter;
  return (
    <>
      <h2 className="font-mono text-base">{data.name}</h2>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Tile label="Files" value={s.files} />
        <Tile label="Imports" value={s.imports} />
        <Tile label="Unidentified" value={s.unclassified} />
      </div>
      <dl className="mt-3">
        <Stat label="Framework" value={framework} />
        {/* Routes come from a framework adapter; the parser output carries none. */}
        <Stat label="Routes" value="not extracted" />
      </dl>

      <Heading note={`top ${Math.min(TOP, s.mostDependedOn.length)} of ${fmt(s.mostDependedOn.length)}`}>
        Most depended on
      </Heading>
      <ul>
        {s.mostDependedOn.slice(0, TOP).map((r) => (
          <PathButton
            key={r.path}
            path={r.path}
            note={r.count}
            bar={{ share: r.count / s.mostDependedOn[0].count, className: "bg-incoming" }}
            props={props}
          />
        ))}
      </ul>

      <Heading note={`top ${Math.min(TOP, s.entryPoints.length)} of ${fmt(s.entryPoints.length)}`}>
        Nothing imports these
      </Heading>
      <ul>
        {s.entryPoints.slice(0, TOP).map((r) => (
          <PathButton
            key={r.path}
            path={r.path}
            note={r.count}
            bar={{ share: r.count / Math.max(1, s.entryPoints[0].count), className: "bg-outgoing" }}
            props={props}
          />
        ))}
      </ul>
    </>
  );
}

function FileView(props: Props & { path: string }) {
  const { data, path } = props;
  const file = data.byPath.get(path);
  if (!file) return null;
  const imports = data.index.imports.get(path) ?? [];
  const dependents = data.index.dependents.get(path) ?? [];
  return (
    <>
      <h2 className="break-all font-mono text-sm">{path}</h2>
      <p className="mt-1 text-muted">{file.kind ?? unclassified}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Tile label="Lines" value={file.lines} />
        <Tile label="Imports" value={imports.length} />
        <Tile label="Imported by" value={dependents.length} />
      </div>
      <Heading note={String(imports.length)}>Imports</Heading>
      <PathList paths={imports} props={props} />
      <Heading note={String(dependents.length)}>Imported by</Heading>
      <PathList paths={dependents} props={props} />
      <Walk props={props} path={path} />
    </>
  );
}

const WALKS: { direction: Direction; label: string; title: string }[] = [
  { direction: "dependents", label: "Blast radius", title: "Everything that breaks if this file changes" },
  { direction: "imports", label: "Dependency chain", title: "Everything this file needs" },
];

// Both buttons are the same walk over the index already in memory, so the
// list is there on the same frame as the click.
function Walk({ props, path }: { props: Props; path: string }) {
  const [direction, setDirection] = useState<Direction | null>(null);
  const reached = direction ? reach(props.data.index, path, direction) : null;
  const levels = reached ? [...new Set(reached.map((r) => r.distance))].sort((a, b) => a - b) : [];
  return (
    <>
      <div className="mt-5 flex gap-1.5 border-t border-border pt-3">
        {WALKS.map((w) => (
          <button
            key={w.direction}
            type="button"
            title={w.title}
            aria-pressed={direction === w.direction}
            onClick={() => setDirection(direction === w.direction ? null : w.direction)}
            className={`flex-1 border px-2 py-1 ${direction === w.direction ? "border-accent text-accent" : "border-border hover:bg-background"}`}
          >
            {w.label}
          </button>
        ))}
      </div>
      {reached && direction && (
        <>
          <Heading note={`${reached.length} within ${DEFAULT_DEPTH} steps`}>
            {WALKS.find((w) => w.direction === direction)?.label}
          </Heading>
          {reached.length === 0 && <p className="px-1 py-0.5 text-muted">none</p>}
          {levels.map((d) => (
            <div key={d}>
              <p className="px-1.5 pt-1 text-[10px] text-muted">
                {d === 1 ? "directly" : `${d} steps away`}
              </p>
              <PathList paths={reached.filter((r) => r.distance === d).map((r) => r.path).sort()} props={props} />
            </div>
          ))}
        </>
      )}
    </>
  );
}

// Starts collapsed, below everything else. Not-imported leads because it says
// where reading starts; the two that read nearer to a verdict follow.
function InsightsPanel(props: Props) {
  const [open, setOpen] = useState(false);
  const i = props.data.insights;
  const count = i.notImported.length + i.heavilyImported.length + i.cycles.length + i.long.length;
  return (
    <section className="mt-5 border-t border-border pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full justify-between text-left text-[10px] uppercase tracking-wide text-muted hover:text-foreground"
      >
        <span>{open ? "▾" : "▸"} Insights</span>
        <span className="tabular-nums">{count}</span>
      </button>
      {open && (
        <>
          <InsightGroup text={INSIGHT_TEXT.notImported} total={i.notImported.length}>
            <PathList paths={i.notImported} props={props} />
          </InsightGroup>
          <InsightGroup
            text={INSIGHT_TEXT.heavilyImported}
            total={i.heavilyImported.length}
            note={`more than ${Math.floor(i.importerThreshold)} importers`}
          >
            <ul>
              {i.heavilyImported.map((r) => (
                <PathButton key={r.path} path={r.path} note={r.count} props={props} />
              ))}
            </ul>
          </InsightGroup>
          <InsightGroup text={INSIGHT_TEXT.cycle} total={i.cycles.length}>
            {i.cycles.map((c) => (
              <div key={c.path[0]} className="mb-2">
                <p className="px-1.5 text-[10px] text-muted">
                  {c.path.length} files in a loop
                  {c.groupSize > c.path.length ? `, ${c.groupSize} in the group` : ""}
                </p>
                <PathList paths={c.path} props={props} />
                <p className="px-1.5 text-[10px] text-muted">…which imports {c.path[0]} again</p>
              </div>
            ))}
          </InsightGroup>
          <InsightGroup
            text={INSIGHT_TEXT.long}
            total={i.long.length}
            note={`more than ${Math.floor(i.lineThreshold)} lines`}
          >
            <ul>
              {i.long.map((r) => (
                <PathButton key={r.path} path={r.path} note={`${fmt(r.lines)} lines`} props={props} />
              ))}
            </ul>
          </InsightGroup>
        </>
      )}
    </section>
  );
}

function InsightGroup({
  text,
  total,
  note,
  children,
}: {
  text: string;
  total: number;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3">
      <p>
        {text} <span className="tabular-nums text-muted">{total}</span>
        {note && total > 0 && <span className="text-muted"> · {note}</span>}
      </p>
      {total === 0 ? <p className="px-1 py-0.5 text-muted">none</p> : children}
    </div>
  );
}

function FolderView({ data, id }: { data: PaneData; id: string }) {
  const paths = [...(data.nodeFiles.get(id) ?? [])].sort();
  const kinds = kindCounts(paths.flatMap((p) => data.byPath.get(p) ?? []));
  const { fanIn, fanOut } = boundary(paths, data.index);
  return (
    <>
      <h2 className="break-all font-mono text-sm">{id}</h2>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Tile label="Files" value={paths.length} />
        <Tile label="In" value={fanIn} />
        <Tile label="Out" value={fanOut} />
      </div>
      <p className="mt-1 text-[10px] text-muted">
        In: outside files importing from here. Out: outside files imported from here.
      </p>
      <Heading>File types</Heading>
      <ul>
        {typeCounts(paths).map((t) => (
          <li key={t.type} className="flex justify-between px-1 py-0.5">
            <span className="font-mono">{t.type}</span>
            <span className="tabular-nums text-muted">{t.count}</span>
          </li>
        ))}
      </ul>
      <Heading>Kinds of file</Heading>
      <ul>
        {kinds.map((k) => (
          <li key={k.kind ?? unclassified} className="flex justify-between px-1 py-0.5">
            <span>{k.kind ?? unclassified}</span>
            <span className="tabular-nums text-muted">{k.count}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
