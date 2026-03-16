// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-runtime-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RequestPayload = {
    planType?: 'auto' | 'monthly_full' | 'three_usage';
};

function getClientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for') ?? '';
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
    return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const expectedAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const expectedRuntimeSecret = Deno.env.get('HINTIO_INTERNAL_RUNTIME_SECRET') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
        return jsonResponse({ error: 'Supabase service runtime missing env vars' }, 500);
    }

    if (!expectedRuntimeSecret) {
        return jsonResponse({ error: 'Runtime secret not configured' }, 500);
    }

    const apikeyHeader = (req.headers.get('apikey') ?? '').trim();
    if (expectedAnonKey && apikeyHeader !== expectedAnonKey) {
        return jsonResponse({ error: 'Unauthorized request' }, 401);
    }

    const runtimeSecretHeader = (req.headers.get('x-runtime-secret') ?? '').trim();
    if (!runtimeSecretHeader || runtimeSecretHeader !== expectedRuntimeSecret) {
        return jsonResponse({ error: 'Unauthorized internal runtime request' }, 401);
    }

    const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('application/json')) {
        return jsonResponse({ error: 'Content-Type must be application/json' }, 415);
    }

    const payload = await req.json().catch(() => ({})) as RequestPayload;
    const planType = String(payload?.planType || 'auto').trim().toLowerCase();
    if (!['auto', 'monthly_full', 'three_usage'].includes(planType)) {
        return jsonResponse({ error: 'Invalid plan type' }, 400);
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const clientIp = getClientIp(req);
    const { data: allowed, error: rateLimitError } = await client.rpc('enforce_access_token_rate_limit', {
        p_identifier: `issue-download-key:${clientIp}`,
        p_max_attempts: 10,
        p_window_seconds: 3600,
    });

    if (rateLimitError) {
        return jsonResponse({ error: 'Rate limiter unavailable' }, 500);
    }

    if (!allowed) {
        return jsonResponse({ error: 'Too many key requests. Please try again later.' }, 429);
    }

    const envProviderSecrets = {
        gemini: (Deno.env.get('HINTIO_MANAGED_GEMINI_API_KEY') ?? '').trim(),
        groq: (Deno.env.get('HINTIO_MANAGED_GROQ_API_KEY') ?? '').trim(),
        azureKey: (Deno.env.get('HINTIO_MANAGED_AZURE_API_KEY') ?? '').trim(),
        azureEndpoint: (Deno.env.get('HINTIO_MANAGED_AZURE_ENDPOINT') ?? '').trim(),
        azureDeployment: (Deno.env.get('HINTIO_MANAGED_AZURE_DEPLOYMENT') ?? '').trim(),
        cloudToken: (Deno.env.get('HINTIO_MANAGED_CLOUD_TOKEN') ?? '').trim(),
    };

    let fallbackSecrets = {
        gemini_api_key: '',
        groq_api_key: '',
        azure_api_key: '',
        azure_endpoint: '',
        azure_deployment: '',
        cloud_token: '',
    };

    if (!envProviderSecrets.groq || !envProviderSecrets.azureKey || !envProviderSecrets.azureEndpoint || !envProviderSecrets.azureDeployment) {
        const { data: latestSecretRow } = await client
            .from('provider_secrets')
            .select('gemini_api_key,groq_api_key,azure_api_key,azure_endpoint,azure_deployment,cloud_token,updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (latestSecretRow) {
            fallbackSecrets = latestSecretRow;
        }
    }

    const { data, error } = await client.rpc('issue_download_access_token', {
        p_plan_type: planType,
        p_gemini_api_key: envProviderSecrets.gemini || fallbackSecrets.gemini_api_key || '',
        p_groq_api_key: envProviderSecrets.groq || fallbackSecrets.groq_api_key || '',
        p_azure_api_key: envProviderSecrets.azureKey || fallbackSecrets.azure_api_key || '',
        p_azure_endpoint: envProviderSecrets.azureEndpoint || fallbackSecrets.azure_endpoint || '',
        p_azure_deployment: envProviderSecrets.azureDeployment || fallbackSecrets.azure_deployment || '',
        p_cloud_token: envProviderSecrets.cloudToken || fallbackSecrets.cloud_token || '',
    });

    if (error) {
        return jsonResponse({ error: error.message }, 500);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.access_token) {
        return jsonResponse({ error: 'Failed to issue key' }, 500);
    }

    return jsonResponse({
        success: true,
        data: {
            accessToken: row.access_token,
            planType: row.plan_type,
            expiresAt: row.expires_at,
            maxInterviews: row.max_interviews,
            oneTime: true,
            message: 'Copy this key now. It will not be shown again.',
        },
    }, 200);
});
