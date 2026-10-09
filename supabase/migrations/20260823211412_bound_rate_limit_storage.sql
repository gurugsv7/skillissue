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

    -- Amortized cleanup keeps unique invalid-token/IP combinations bounded without
    -- adding a database scan to every authentication attempt.
    if random() < 0.01 then
        delete from public.access_token_rate_limits
        where updated_at < now() - interval '24 hours';
    end if;

    return current_attempts <= p_max_attempts;
end;
$$;

revoke all on function public.enforce_access_token_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.enforce_access_token_rate_limit(text, integer, integer) to service_role;
