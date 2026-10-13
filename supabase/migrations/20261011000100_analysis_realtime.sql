-- Live progress. A trigger on our own table publishes the stage and its
-- message to a topic per analysis; a policy on realtime.messages decides who
-- may subscribe. Topics are dynamic: nothing is registered anywhere.

-- Only the stage and message travel, so the page has nothing to filter. A
-- failed run carries its error as the message.
create or replace function public.publish_analysis_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'stage', new.stage,
      'message', case when new.stage = 'failed' then new.error else new.message end
    ),
    'stage',
    'analysis:' || new.id::text,
    true -- private: delivery is gated by the policy below
  );
  return new;
end;
$$;

create trigger analyses_publish_stage
  after insert or update of stage, message, error on public.analyses
  for each row execute function public.publish_analysis_stage();

-- Without this a private channel delivers nothing. The subquery runs under the
-- subscriber's own row-level security, so another organization's analysis is
-- not subscribable for the same reason it is not selectable.
create policy "members subscribe to their analyses"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'analysis:%'
    and exists (
      select 1 from public.analyses a
      where a.id::text = split_part(realtime.topic(), ':', 2)
    )
  );
