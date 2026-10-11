-- Dev data: nothing creates a real analysis yet. Three organizations: two with five
-- analyses covering every state, one with a queued and a complete one, so the dashboard can be checked
-- against a boundary. Re-runnable: rows are upserted by id.
insert into public.organizations (id, name) values
  ('org_3KENbRUPDyH6swj0i7LqiLBdhTg', 'Vaishnav''s Team'),
  ('org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', 'Second team'),
  ('org_3KEWQoCIWe40Rh9OsaCCGUaoJfW', 'Demo 2')
on conflict (id) do nothing;

insert into public.projects (id, org_id, repo_url) values
  ('00000000-0000-0000-0000-0000000000a1', 'org_3KENbRUPDyH6swj0i7LqiLBdhTg', 'vercel/next.js'),
  ('00000000-0000-0000-0000-0000000000a2', 'org_3KENbRUPDyH6swj0i7LqiLBdhTg', 'tailwindlabs/tailwindcss'),
  ('00000000-0000-0000-0000-0000000000a3', 'org_3KENbRUPDyH6swj0i7LqiLBdhTg', 'shadcn-ui/ui'),
  ('00000000-0000-0000-0000-0000000000c1', 'org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', 'facebook/react'),
  ('00000000-0000-0000-0000-0000000000c2', 'org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', 'vitejs/vite'),
  ('00000000-0000-0000-0000-0000000000c3', 'org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', 'sveltejs/svelte'),
  ('00000000-0000-0000-0000-0000000000d1', 'org_3KEWQoCIWe40Rh9OsaCCGUaoJfW', 'expressjs/express'),
  ('00000000-0000-0000-0000-0000000000d2', 'org_3KEWQoCIWe40Rh9OsaCCGUaoJfW', 'colinhacks/zod')
on conflict (id) do update set repo_url = excluded.repo_url;

insert into public.analyses (id, org_id, project_id, status, commit_sha, created_at, finished_at, error) values
  ('00000000-0000-0000-0000-0000000001a1', 'org_3KENbRUPDyH6swj0i7LqiLBdhTg', '00000000-0000-0000-0000-0000000000a1', 'complete', '4f1c2a9', now() - interval '3 days', now() - interval '3 days' + interval '4 minutes', null),
  ('00000000-0000-0000-0000-0000000001a2', 'org_3KENbRUPDyH6swj0i7LqiLBdhTg', '00000000-0000-0000-0000-0000000000a1', 'parsing', 'a93be01', now() - interval '3 minutes', null, null),
  ('00000000-0000-0000-0000-0000000001a3', 'org_3KENbRUPDyH6swj0i7LqiLBdhTg', '00000000-0000-0000-0000-0000000000a2', 'queued', null, now() - interval '2 minutes', null, null),
  ('00000000-0000-0000-0000-0000000001a4', 'org_3KENbRUPDyH6swj0i7LqiLBdhTg', '00000000-0000-0000-0000-0000000000a3', 'failed', null, now() - interval '5 hours', now() - interval '5 hours' + interval '1 minute', 'Repository archive download timed out'),
  ('00000000-0000-0000-0000-0000000001a5', 'org_3KENbRUPDyH6swj0i7LqiLBdhTg', '00000000-0000-0000-0000-0000000000a3', 'complete', '0c7d9e2', now() - interval '24 hours', now() - interval '24 hours' + interval '2 minutes', null),
  ('00000000-0000-0000-0000-0000000001c1', 'org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', '00000000-0000-0000-0000-0000000000c1', 'complete', '7be41d0', now() - interval '2 days', now() - interval '2 days' + interval '3 minutes', null),
  ('00000000-0000-0000-0000-0000000001c2', 'org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', '00000000-0000-0000-0000-0000000000c1', 'parsing', 'c18a5f3', now() - interval '6 minutes', null, null),
  ('00000000-0000-0000-0000-0000000001c3', 'org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', '00000000-0000-0000-0000-0000000000c2', 'queued', null, now() - interval '1 minute', null, null),
  ('00000000-0000-0000-0000-0000000001c4', 'org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', '00000000-0000-0000-0000-0000000000c3', 'failed', null, now() - interval '9 hours', now() - interval '9 hours' + interval '1 minute', 'Repository not found or not public'),
  ('00000000-0000-0000-0000-0000000001c5', 'org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', '00000000-0000-0000-0000-0000000000c3', 'complete', '2d90e7b', now() - interval '30 hours', now() - interval '30 hours' + interval '2 minutes', null),
  ('00000000-0000-0000-0000-0000000001d1', 'org_3KEWQoCIWe40Rh9OsaCCGUaoJfW', '00000000-0000-0000-0000-0000000000d1', 'complete', '9a3f6c4', now() - interval '4 days', now() - interval '4 days' + interval '2 minutes', null),
  ('00000000-0000-0000-0000-0000000001d2', 'org_3KEWQoCIWe40Rh9OsaCCGUaoJfW', '00000000-0000-0000-0000-0000000000d2', 'queued', null, now() - interval '1 minute', null, null)
on conflict (id) do update set
  status = excluded.status, commit_sha = excluded.commit_sha, created_at = excluded.created_at,
  finished_at = excluded.finished_at, error = excluded.error, project_id = excluded.project_id;
