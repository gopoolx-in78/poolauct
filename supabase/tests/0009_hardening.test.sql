begin;
select plan(4);

select ok(
  (select rolconfig from pg_roles where rolname = 'service_role') @> array['statement_timeout=30s'],
  'service_role (jobs, webhooks) has an explicit 30 s statement timeout'
);
select ok(
  (select rolconfig from pg_roles where rolname = 'service_role') @> array['lock_timeout=10s'],
  'service_role waits at most 10 s for a lock'
);
select ok(
  (select rolconfig from pg_roles where rolname = 'authenticated') @> array['statement_timeout=8s'],
  'signed-in requests keep the 8 s statement timeout'
);
select ok(
  (select rolconfig from pg_roles where rolname = 'anon') @> array['statement_timeout=3s'],
  'anonymous requests keep the 3 s statement timeout'
);

select * from finish();
rollback;
