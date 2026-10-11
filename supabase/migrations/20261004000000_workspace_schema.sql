-- Phase 2: the workspace schema. Every row belongs to an organization, and
-- the database alone decides who can read it.

-- Row-level security is on for every table by default. A table created later
-- without it would return every row to everyone, silently; this makes that
-- impossible rather than unlikely.
create or replace function public.enable_rls_on_new_table()
returns event_trigger
language plpgsql
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type = 'table'
      and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', cmd.object_identity);
  end loop;
end;
$$;

create event trigger enable_rls_on_new_table
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.enable_rls_on_new_table();

-- The organization the signed-in session belongs to, read off the Clerk token
-- (session token v2 keeps it at o.id). Null when no organization is active,
-- which matches no row.
create or replace function public.requesting_org_id()
returns text
language sql
stable
as $$
  select auth.jwt() -> 'o' ->> 'id'
$$;

-- Clerk's organization id is the key, so it is text rather than a uuid.
create table public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  repo_url text not null,
  created_at timestamptz not null default now()
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  created_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  path text not null
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  from_file_id uuid not null references public.files (id) on delete cascade,
  to_file_id uuid not null references public.files (id) on delete cascade
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  path text not null
);

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  body text not null
);

create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  role text not null
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  body text not null
);

-- Foreign keys are not indexed by Postgres; cascades and joins need these.
create index projects_org_id_idx on public.projects (org_id);
create index analyses_org_id_created_at_idx on public.analyses (org_id, created_at desc);
create index analyses_project_id_idx on public.analyses (project_id);
create index files_org_id_idx on public.files (org_id);
create index files_analysis_id_idx on public.files (analysis_id);
create index edges_org_id_idx on public.edges (org_id);
create index edges_analysis_id_idx on public.edges (analysis_id);
create index edges_from_file_id_idx on public.edges (from_file_id);
create index edges_to_file_id_idx on public.edges (to_file_id);
create index routes_org_id_idx on public.routes (org_id);
create index routes_analysis_id_idx on public.routes (analysis_id);
create index routes_file_id_idx on public.routes (file_id);
create index explanations_org_id_idx on public.explanations (org_id);
create index explanations_analysis_id_idx on public.explanations (analysis_id);
create index explanations_file_id_idx on public.explanations (file_id);
create index file_roles_org_id_idx on public.file_roles (org_id);
create index file_roles_analysis_id_idx on public.file_roles (analysis_id);
create index file_roles_file_id_idx on public.file_roles (file_id);
create index insights_org_id_idx on public.insights (org_id);
create index insights_analysis_id_idx on public.insights (analysis_id);

-- Read-only for signed-in members of the organization. There are no write
-- policies yet, so no client can write; server code does that later.
-- Explicit enable is idempotent with the event trigger and reads clearly.
alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

create policy "members read their organization"
  on public.organizations for select to authenticated
  using (id = (select public.requesting_org_id()));

create policy "members read their rows" on public.projects for select to authenticated
  using (org_id = (select public.requesting_org_id()));
create policy "members read their rows" on public.analyses for select to authenticated
  using (org_id = (select public.requesting_org_id()));
create policy "members read their rows" on public.files for select to authenticated
  using (org_id = (select public.requesting_org_id()));
create policy "members read their rows" on public.edges for select to authenticated
  using (org_id = (select public.requesting_org_id()));
create policy "members read their rows" on public.routes for select to authenticated
  using (org_id = (select public.requesting_org_id()));
create policy "members read their rows" on public.explanations for select to authenticated
  using (org_id = (select public.requesting_org_id()));
create policy "members read their rows" on public.file_roles for select to authenticated
  using (org_id = (select public.requesting_org_id()));
create policy "members read their rows" on public.insights for select to authenticated
  using (org_id = (select public.requesting_org_id()));
