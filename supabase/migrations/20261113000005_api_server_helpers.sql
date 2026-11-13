-- 0005 — Server-only helpers exposed through PostgREST for the Next.js server (service role only).
-- anon/authenticated cannot execute these.

create or replace function api.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language sql
security definer
set search_path = ''
as $$ select core.rate_limit_hit(p_bucket, p_max, p_window_seconds); $$;

create or replace function api.record_security_event(p_kind text, p_user uuid, p_subject_hash text)
returns void
language sql
security definer
set search_path = ''
as $$ select core.record_security_event(p_kind, p_user, p_subject_hash); $$;

revoke all on function api.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function api.record_security_event(text, uuid, text) from public, anon, authenticated;
grant execute on function api.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function api.record_security_event(text, uuid, text) to service_role;
