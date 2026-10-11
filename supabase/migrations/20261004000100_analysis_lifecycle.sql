-- The dashboard shows an analysis's whole lifecycle: which commit, when it
-- started and finished, and why it failed. States are renamed to match the
-- stages a run actually goes through.
alter table public.analyses drop constraint analyses_status_check;

update public.analyses set status = 'parsing' where status = 'running';
update public.analyses set status = 'complete' where status = 'done';

alter table public.analyses
  add constraint analyses_status_check
    check (status in ('queued', 'parsing', 'complete', 'failed')),
  add column commit_sha text,
  add column finished_at timestamptz,
  add column error text;
