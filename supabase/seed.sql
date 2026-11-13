-- Local development seed. Runs only on `supabase db reset` against the LOCAL database.
-- Never run against staging or production. Any demo rows added here must be clearly labelled as demo
-- and must never be presented as live participation (see AGENTS.md honesty rules).

-- DEMO deposit policy for LOCAL development only (owner decision OD-04 sets real values via /admin/auctions/policy).
insert into core.system_settings (key, value) values ('auction.deposit.global_min_paise', '50000') on conflict (key) do nothing;
