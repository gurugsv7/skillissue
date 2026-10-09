drop policy if exists "Allow updating trial usage logs" on public.trial_usage_logs;
create policy "Allow updating trial usage logs"
on public.trial_usage_logs for update to public
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own trial usage logs" on public.trial_usage_logs;
create policy "Users can view their own trial usage logs"
on public.trial_usage_logs for select to public
using ((select auth.uid()) = user_id);
