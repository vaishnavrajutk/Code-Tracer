-- Phase 7: what a run needs to store. The parser's per-file and per-edge
-- columns, the whole coverage report, and a stage that moves while a run is
-- in flight. `status` stays the coarse state the dashboard already reads.

-- One analysis per repository. A repeat paste lands on the existing row; a
-- re-run replaces that row's files, it never adds a second analysis.
alter table public.projects
  add constraint projects_org_id_repo_url_key unique (org_id, repo_url);
create unique index analyses_project_id_key on public.analyses (project_id);
drop index public.analyses_project_id_idx;

alter table public.analyses
  add column stage text not null default 'queued'
    check (stage in ('queued', 'fetching', 'parsing', 'storing', 'complete', 'failed')),
  add column message text,
  -- Which stage a failed run died in. Null unless status is failed.
  add column failed_stage text,
  -- Moves on every stage change, so "no change in a few minutes" is readable.
  add column updated_at timestamptz not null default now(),
  -- The parser's coverage report, verbatim. Shown as stored, never recomputed.
  add column coverage jsonb;

update public.analyses set stage = case status
  when 'parsing' then 'parsing'
  else status
end;

alter table public.files
  add column folder text not null default '.',
  add column lines integer not null default 0,
  add column bytes integer not null default 0,
  add column hash text not null default '',
  add column kind text,
  add column framework_reached boolean not null default false,
  add column fan_in integer not null default 0,
  add column fan_out integer not null default 0,
  add constraint files_analysis_id_path_key unique (analysis_id, path);

alter table public.files
  alter column folder drop default,
  alter column lines drop default,
  alter column bytes drop default,
  alter column hash drop default,
  alter column framework_reached drop default,
  alter column fan_in drop default,
  alter column fan_out drop default;

alter table public.edges
  add column kind text not null default 'import'
    check (kind in ('import', 're-export', 'dynamic-import')),
  add column specifier text not null default '',
  add column line integer not null default 0;

alter table public.edges
  alter column kind drop default,
  alter column specifier drop default,
  alter column line drop default;
