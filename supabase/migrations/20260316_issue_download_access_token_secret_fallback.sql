create or replace function public.issue_download_access_token(
    p_plan_type text default null,
    p_gemini_api_key text default null,
    p_groq_api_key text default null,
    p_azure_api_key text default null,
    p_azure_endpoint text default null,
    p_azure_deployment text default null,
    p_cloud_token text default null
)
returns table (
    access_token text,
    token_id uuid,
    plan_type text,
    expires_at timestamptz,
    max_interviews integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_plan text;
    monthly_count integer := 0;
    three_count integer := 0;
    token_value text;
    token_hash text;
    inserted_token_id uuid;
    expiry_time timestamptz := now() + interval '30 days';
    interview_limit integer;
    template_secrets record;
    final_gemini_api_key text;
    final_groq_api_key text;
    final_azure_api_key text;
    final_azure_endpoint text;
    final_azure_deployment text;
    final_cloud_token text;
begin
    selected_plan := lower(coalesce(trim(p_plan_type), 'auto'));

    if selected_plan not in ('auto', 'monthly_full', 'three_usage') then
        raise exception 'Unsupported plan type: %', selected_plan;
    end if;

    if selected_plan = 'auto' then
        select
            count(*) filter (where coalesce(s.metadata->>'plan_type', '') = 'monthly_full')::int,
            count(*) filter (where coalesce(s.metadata->>'plan_type', '') = 'three_usage')::int
        into monthly_count, three_count
        from public.access_tokens t
        join public.provider_secrets s on s.token_id = t.id
        where coalesce(s.metadata->>'issued_for', '') = 'free_download';

        if monthly_count <= three_count then
            selected_plan := 'monthly_full';
        else
            selected_plan := 'three_usage';
        end if;
    end if;

    select
        s.gemini_api_key,
        s.groq_api_key,
        s.azure_api_key,
        s.azure_endpoint,
        s.azure_deployment,
        s.cloud_token
    into template_secrets
    from public.provider_secrets s
    where coalesce(s.groq_api_key, '') <> ''
      and coalesce(s.azure_api_key, '') <> ''
      and coalesce(s.azure_endpoint, '') <> ''
      and coalesce(s.azure_deployment, '') <> ''
    order by s.updated_at desc
    limit 1;

    final_gemini_api_key := coalesce(nullif(coalesce(p_gemini_api_key, ''), ''), template_secrets.gemini_api_key);
    final_groq_api_key := coalesce(nullif(coalesce(p_groq_api_key, ''), ''), template_secrets.groq_api_key);
    final_azure_api_key := coalesce(nullif(coalesce(p_azure_api_key, ''), ''), template_secrets.azure_api_key);
    final_azure_endpoint := coalesce(nullif(coalesce(p_azure_endpoint, ''), ''), template_secrets.azure_endpoint);
    final_azure_deployment := coalesce(nullif(coalesce(p_azure_deployment, ''), ''), template_secrets.azure_deployment);
    final_cloud_token := coalesce(nullif(coalesce(p_cloud_token, ''), ''), template_secrets.cloud_token);

    if coalesce(final_groq_api_key, '') = ''
        or coalesce(final_azure_api_key, '') = ''
        or coalesce(final_azure_endpoint, '') = ''
        or coalesce(final_azure_deployment, '') = '' then
        raise exception 'Managed provider secrets are not configured';
    end if;

    interview_limit := case when selected_plan = 'monthly_full' then 2147483647 else 3 end;
    token_value := 'SKI-' || upper(encode(extensions.gen_random_bytes(12), 'hex'));
    token_hash := encode(extensions.digest(convert_to(token_value, 'UTF8'), 'sha256'), 'hex');

    insert into public.access_tokens (
        token_hash,
        label,
        is_active,
        expires_at,
        max_interviews,
        interviews_used,
        sold_to,
        sold_price_inr
    )
    values (
        token_hash,
        'free-download:' || selected_plan,
        true,
        expiry_time,
        interview_limit,
        0,
        'free_download',
        0
    )
    returning id into inserted_token_id;

    insert into public.provider_secrets (
        token_id,
        provider_mode,
        gemini_api_key,
        groq_api_key,
        azure_api_key,
        azure_endpoint,
        azure_deployment,
        cloud_token,
        metadata
    )
    values (
        inserted_token_id,
        'managed',
        nullif(coalesce(final_gemini_api_key, ''), ''),
        nullif(coalesce(final_groq_api_key, ''), ''),
        nullif(coalesce(final_azure_api_key, ''), ''),
        nullif(coalesce(final_azure_endpoint, ''), ''),
        nullif(coalesce(final_azure_deployment, ''), ''),
        nullif(coalesce(final_cloud_token, ''), ''),
        jsonb_build_object(
            'plan_type', selected_plan,
            'issued_for', 'free_download',
            'issued_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    );

    return query
    select token_value, inserted_token_id, selected_plan, expiry_time, interview_limit;
end;
$$;

revoke all on function public.issue_download_access_token(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.issue_download_access_token(text, text, text, text, text, text, text) to service_role;
