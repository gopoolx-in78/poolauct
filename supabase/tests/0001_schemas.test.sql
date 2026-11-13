begin;
select plan(12);

select has_schema('core');
select has_schema('poolx');
select has_schema('auction');
select has_schema('ledger');
select has_schema('cms');

-- anon / authenticated have no usage on domain schemas by default
select ok(not has_schema_privilege('anon', 'core', 'usage'), 'anon has no usage on core');
select ok(not has_schema_privilege('anon', 'auction', 'usage'), 'anon has no usage on auction');
select ok(not has_schema_privilege('anon', 'ledger', 'usage'), 'anon has no usage on ledger (authenticated access is RLS-gated, see 0003)');
select ok(has_schema_privilege('service_role', 'auction', 'usage'), 'service_role can use auction');

select has_function('core', 'set_updated_at', array[]::text[]);
select has_function('core', 'forbid_mutation', array[]::text[]);
select has_function('core', 'forbid_delete', array[]::text[]);

select * from finish();
rollback;
