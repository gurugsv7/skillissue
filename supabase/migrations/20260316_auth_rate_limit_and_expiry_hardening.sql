-- Auth hardening: token attempt rate limiting + mandatory token expiry window

create table if not exists public.access_token_rate_limits (
    identifier text primary key,
    window_started_at timestamptz not null,
    attempts integer not null default 0,
    updated_at timestamptz not null default now()
);

revoke all on table public.access_token_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.access_token_rate_limits to service_role;

alter table public.access_token_rate_limits enable row level security;
alter table public.access_token_rate_limits force row level security;

drop policy if exists access_token_rate_limits_service_role_all on public.access_token_rate_limits;
create policy access_token_rate_limits_service_role_all
on public.access_token_rate_limits
for all
to service_role
using (true)
with check (true);

create or replace function public.enforce_access_token_rate_limit(
    p_identifier text,
    p_max_attempts integer default 12,
    p_window_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    current_window timestamptz := now() - make_interval(secs => p_window_seconds);
    current_attempts integer := 0;
begin
    if p_identifier is null or length(trim(p_identifier)) = 0 then
        return false;
    end if;

    insert into public.access_token_rate_limits (identifier, window_started_at, attempts, updated_at)
    values (p_identifier, now(), 1, now())
    on conflict (identifier)
    do update
    set
        attempts = case
            when public.access_token_rate_limits.window_started_at < current_window then 1
            else public.access_token_rate_limits.attempts + 1
        end,
        window_started_at = case
            when public.access_token_rate_limits.window_started_at < current_window then now()
            else public.access_token_rate_limits.window_started_at
        end,
        updated_at = now();

    select attempts
    into current_attempts
    from public.access_token_rate_limits
    where identifier = p_identifier;

    return current_attempts <= p_max_attempts;
end;
$$;

revoke all on function public.enforce_access_token_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.enforce_access_token_rate_limit(text, integer, integer) to service_role;

create or replace function public.cleanup_access_token_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    deleted_count integer;
begin
    delete from public.access_token_rate_limits
    where updated_at < (now() - interval '24 hours');

    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;

revoke all on function public.cleanup_access_token_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_access_token_rate_limits() to service_role;

-- Enforce expiring access-token sessions. Existing NULL expiries are converted to a bounded value.
alter table public.access_tokens
    alter column expires_at set default (now() + interval '30 days');

update public.access_tokens
set expires_at = coalesce(expires_at, created_at + interval '30 days')
where expires_at is null;

alter table public.access_tokens
    alter column expires_at set not null;

-- Keep enforcement backward-compatible: existing legacy tokens may exceed 30 days.
-- We enforce non-null expiry + secure default; optional max-lifetime constraints can be
-- validated later after token inventory cleanup.

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
set search_path = public
as $$
    select
        t.id as token_id,
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
set search_path = public
as $$
    with matched as (
        select t.id
        from public.access_tokens t
        where t.token_hash = encode(extensions.digest(convert_to(access_token, 'UTF8'), 'sha256'), 'hex')
          and t.is_active = true
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
        c.id as token_id,
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

comment on table public.access_token_rate_limits is 'Short-lived, service_role-only access token auth attempt counters.';
comment on function public.enforce_access_token_rate_limit(text, integer, integer)
is 'Server-side auth attempt limiter for access token validation endpoints.';
