-- This migration intentionally changes legacy/public availability. Review before production deploy.
-- Paid/internal issuance remains service-role only.
revoke all on function public.claim_three_usage_trial_key() from public, anon, authenticated;
grant execute on function public.claim_three_usage_trial_key() to service_role;

revoke all on function public.cleanup_expired_access_tokens() from public, anon, authenticated;
revoke all on function public.get_trial_key_status(uuid) from public, anon, authenticated;
revoke all on function public.log_trial_usage_start(uuid, uuid) from public, anon, authenticated;
revoke all on function public.log_trial_usage_end(bigint, integer) from public, anon, authenticated;
revoke all on function public.validate_trial_key_usage(uuid) from public, anon, authenticated;
grant execute on function public.cleanup_expired_access_tokens() to service_role;
grant execute on function public.get_trial_key_status(uuid) to service_role;
grant execute on function public.log_trial_usage_start(uuid, uuid) to service_role;
grant execute on function public.log_trial_usage_end(bigint, integer) to service_role;
grant execute on function public.validate_trial_key_usage(uuid) to service_role;

revoke all on function public.get_user_setting(text, jsonb) from public, anon;
revoke all on function public.set_user_setting(text, jsonb) from public, anon;
grant execute on function public.get_user_setting(text, jsonb) to authenticated, service_role;
grant execute on function public.set_user_setting(text, jsonb) to authenticated, service_role;

drop policy if exists "Allow logging trial usage" on public.trial_usage_logs;
drop policy if exists "Allow updating trial usage logs" on public.trial_usage_logs;
drop policy if exists "Users can view their own trial usage logs" on public.trial_usage_logs;
revoke all on table public.trial_usage_logs from public, anon, authenticated;
grant select, insert, update, delete on table public.trial_usage_logs to service_role;

alter table public.licenses enable row level security;
alter table public.licenses force row level security;
revoke all on table public.licenses from public, anon, authenticated;
grant select, insert, update, delete on table public.licenses to service_role;
drop policy if exists licenses_service_role_all on public.licenses;
create policy licenses_service_role_all on public.licenses
for all to service_role using (true) with check (true);

alter table public.payment_config enable row level security;
alter table public.payment_config force row level security;
revoke all on table public.payment_config from public, anon, authenticated;
grant select on table public.payment_config to anon, authenticated;
grant select, insert, update, delete on table public.payment_config to service_role;
drop policy if exists payment_config_public_read on public.payment_config;
create policy payment_config_public_read on public.payment_config
for select to anon, authenticated using (true);
drop policy if exists payment_config_service_role_all on public.payment_config;
create policy payment_config_service_role_all on public.payment_config
for all to service_role using (true) with check (true);
