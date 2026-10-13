import Link from "next/link";
import { AnalyseForm } from "@/components/analyse-form";
import { LiveState } from "@/components/live-state";
import { createSupabaseClient } from "@/lib/supabase/server";

type AnalysisRow = {
  id: string;
  status: string;
  stage: string;
  message: string | null;
  commit_sha: string | null;
  created_at: string;
  finished_at: string | null;
  error: string | null;
  projects: { repo_url: string } | null;
};

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function Dashboard() {
  // No organization filter on either query. The policies read the
  // organization off the session token, so this is every row we may see.
  const supabase = await createSupabaseClient();
  const [analyses, orgs] = await Promise.all([
    supabase
      .from("analyses")
      .select("id, status, stage, message, commit_sha, created_at, finished_at, error, projects(repo_url)")
      .order("created_at", { ascending: false })
      .limit(100)
      .overrideTypes<AnalysisRow[], { merge: false }>(),
    supabase.from("organizations").select("name").limit(1),
  ]);

  if (analyses.error) throw new Error(`Could not load analyses: ${analyses.error.message}`);
  if (orgs.error) throw new Error(`Could not load organization: ${orgs.error.message}`);

  const rows = analyses.data;
  // An organization nothing has synced into the table yet has no name to show.
  const orgName = orgs.data[0]?.name;

  return (
    <div className="p-3">
      <AnalyseForm />
      <div className="mb-2 flex items-baseline gap-2">
        {orgName && <h1 className="text-sm font-medium">{orgName}</h1>}
        <span className="text-xs text-muted">
          {rows.length} {rows.length === 1 ? "analysis" : "analyses"}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="border border-border bg-surface px-3 py-6 text-xs text-muted">
          No analyses in this organization yet. Ones you run will be listed here.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="border-b border-border bg-background text-muted">
              <tr>
                <th className="px-3 py-1.5 font-normal">repository</th>
                <th className="px-3 py-1.5 font-normal">state</th>
                <th className="px-3 py-1.5 font-normal">commit</th>
                <th className="px-3 py-1.5 text-right font-normal">started</th>
                <th className="px-3 py-1.5 text-right font-normal">finished</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const [owner, name] = (a.projects?.repo_url ?? "").split("/");
                return (
                  <tr
                    key={a.id}
                    className="border-b border-border align-top last:border-b-0 hover:bg-background"
                  >
                    <td className="px-3 py-1.5 font-mono">
                      <Link href={a.status === "complete" ? `/analyses/${a.id}/map` : `/analyses/${a.id}`}>
                        {name ? (
                          <>
                            <span className="text-muted">{owner}/</span>
                            {name}
                          </>
                        ) : (
                          owner
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <Link href={`/analyses/${a.id}`} className="block">
                        <LiveState
                          id={a.id}
                          initial={{
                            stage: a.stage,
                            message: a.stage === "failed" ? a.error : a.message,
                          }}
                        />
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted">{a.commit_sha?.slice(0, 7) ?? "—"}</td>
                    <td
                      className="px-3 py-1.5 text-right tabular-nums text-muted"
                      title={a.created_at}
                    >
                      {ago(a.created_at)}
                    </td>
                    <td
                      className="px-3 py-1.5 text-right tabular-nums text-muted"
                      title={a.finished_at ?? undefined}
                    >
                      {a.finished_at ? ago(a.finished_at) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
