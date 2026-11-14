-- Phase 9 hardening (TD-69): explicit statement / lock timeouts for the service_role used by jobs and webhooks.
-- anon (3 s) and authenticated (8 s) keep Supabase's defaults. Without this, service_role requests only inherit the
-- authenticator login role's 8 s by accident. PostgREST applies the impersonated role's settings per request.
alter role service_role set statement_timeout = '30s';
alter role service_role set lock_timeout = '10s';
