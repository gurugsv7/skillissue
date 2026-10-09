alter function public.touch_updated_at() set search_path = '';

-- Make access-token checks agree on every revocation signal.
create or replace function public.resolve_provider_secrets(access_token text)
returns table (
    token_id uuid,
    provider_mode text,
    gemini_api_key text,
    groq_api_key text,
    azure_api_key text,
    azure_endpoint text,
    azure_deployment text,
    cloud_token text,
    expires_at timestamptz,
    metadata jsonb,
    max_interviews integer,
    interviews_used integer
)
language sql
security definer
set search_path = ''
as $$
    select
        t.id,
        s.provider_mode,
        s.gemini_api_key,
        s.groq_api_key,
        s.azure_api_key,
        s.azure_endpoint,
        s.azure_deployment,
        s.cloud_token,
        t.expires_at,
        s.metadata,
        t.max_interviews,
        t.interviews_used
    from public.access_tokens t
    join public.provider_secrets s on s.token_id = t.id
    where t.token_hash = encode(extensions.digest(convert_to(access_token, 'UTF8'), 'sha256'), 'hex')
      and t.is_active = true
      and t.status = 'active'
      and t.expires_at > now()
      and t.interviews_used < t.max_interviews
    limit 1;
$$;

create or replace function public.consume_interview_credit(access_token text)
returns table (
    token_id uuid,
    provider_mode text,
    gemini_api_key text,
    groq_api_key text,
    azure_api_key text,
    azure_endpoint text,
    azure_deployment text,
    cloud_token text,
    expires_at timestamptz,
    metadata jsonb,
    max_interviews integer,
    interviews_used integer
)
language sql
security definer
set search_path = ''
as $$
    with matched as (
        select t.id
        from public.access_tokens t
        where t.token_hash = encode(extensions.digest(convert_to(access_token, 'UTF8'), 'sha256'), 'hex')
          and t.is_active = true
          and t.status = 'active'
          and t.expires_at > now()
          and t.interviews_used < t.max_interviews
        limit 1
        for update
    ), consumed as (
        update public.access_tokens t
        set interviews_used = t.interviews_used + 1,
            updated_at = now()
        from matched m
        where t.id = m.id
        returning t.*
    )
    select
        c.id,
        s.provider_mode,
        s.gemini_api_key,
        s.groq_api_key,
        s.azure_api_key,
        s.azure_endpoint,
        s.azure_deployment,
        s.cloud_token,
        c.expires_at,
        s.metadata,
        c.max_interviews,
        c.interviews_used
    from consumed c
    join public.provider_secrets s on s.token_id = c.id;
$$;

revoke all on function public.resolve_provider_secrets(text) from public, anon, authenticated;
revoke all on function public.consume_interview_credit(text) from public, anon, authenticated;
grant execute on function public.resolve_provider_secrets(text) to service_role;
grant execute on function public.consume_interview_credit(text) to service_role;

-- Atomic rate-limit update with bounded inputs and no follow-up SELECT.
create or replace function public.enforce_access_token_rate_limit(
    p_identifier text,
    p_max_attempts integer default 12,
    p_window_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_attempts integer;
    current_window timestamptz;
begin
    if p_identifier is null
       or length(trim(p_identifier)) = 0
       or length(p_identifier) > 256
       or p_max_attempts not between 1 and 1000
       or p_window_seconds not between 1 and 86400 then
        return false;
    end if;

    current_window := now() - make_interval(secs => p_window_seconds);

    insert into public.access_token_rate_limits (identifier, window_started_at, attempts, updated_at)
    values (p_identifier, now(), 1, now())
    on conflict (identifier) do update
    set attempts = case
            when public.access_token_rate_limits.window_started_at < current_window then 1
            else public.access_token_rate_limits.attempts + 1
        end,
        window_started_at = case
            when public.access_token_rate_limits.window_started_at < current_window then now()
            else public.access_token_rate_limits.window_started_at
        end,
        updated_at = now()
    returning attempts into current_attempts;

    return current_attempts <= p_max_attempts;
end;
$$;

revoke all on function public.enforce_access_token_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.enforce_access_token_rate_limit(text, integer, integer) to service_role;

create index if not exists access_token_rate_limits_updated_at_idx
on public.access_token_rate_limits (updated_at);

-- Avoid re-evaluating auth.uid() for every row in RLS scans.
drop policy if exists subscriptions_authenticated_select_own on public.subscriptions;
create policy subscriptions_authenticated_select_own
on public.subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists premium_questions_paid_users_select on public.premium_interview_questions;
create policy premium_questions_paid_users_select
on public.premium_interview_questions for select to authenticated
using (is_published = true and public.user_has_active_subscription((select auth.uid())));

drop policy if exists "Users can view their own settings" on public.app_settings;
create policy "Users can view their own settings"
on public.app_settings for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own settings" on public.app_settings;
create policy "Users can insert their own settings"
on public.app_settings for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own settings" on public.app_settings;
create policy "Users can update their own settings"
on public.app_settings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
