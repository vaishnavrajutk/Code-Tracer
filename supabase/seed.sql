-- Dev data: the organizations the sign-in accounts belong to. Analyses are not
-- seeded; they come from running the pipeline. Re-runnable.
insert into public.organizations (id, name) values
  ('org_3KENbRUPDyH6swj0i7LqiLBdhTg', 'Vaishnav''s Team'),
  ('org_3KEVCXIMn9Ix5r76hN0vGYhhpMP', 'Second team'),
  ('org_3KEWQoCIWe40Rh9OsaCCGUaoJfW', 'Demo 2')
on conflict (id) do nothing;
