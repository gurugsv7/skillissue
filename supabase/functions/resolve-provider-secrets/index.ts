// @ts-nocheck
// @ts-ignore -- Deno npm specifier is resolved in Supabase Edge runtime
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-intent, x-runtime-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ResolveRow = {
    token_id: string;
    provider_mode: string;
    gemini_api_key: string | null;
    groq_api_key: string | null;
    azure_api_key: string | null;
    azure_endpoint: string | null;
    azure_deployment: string | null;
    cloud_token: string | null;
    expires_at: string | null;
    metadata: Record<string, unknown> | null;
    max_interviews: number;
    interviews_used: number;
};

type RequestPayload = {
    accessToken?: string;
    consume?: boolean;
};

// Gemini model the desktop client should use. Free tier covers the Flash /
// Flash-Lite families; gemini-3.7-flash is the latest stable Flash.
const MANAGED_GEMINI_MODEL = (Deno.env.get('HINTIO_MANAGED_GEMINI_MODEL') ?? '').trim() || 'gemini-3.7-flash';

// Extra Gemini keys, comma/whitespace separated. Each free-tier key is ~10
// requests/minute, so issuing several from separate accounts lets the client
// spread load and fail over instantly instead of stalling on a 429.
const MANAGED_GEMINI_EXTRA_KEYS = (Deno.env.get('HINTIO_MANAGED_GEMINI_API_KEYS') ?? '').trim();

// OpenAI is the primary LLM. Comma-separate several keys to raise the ceiling —
// the client spreads load across them and fails over instantly on a 429.
const MANAGED_OPENAI_KEYS = (Deno.env.get('HINTIO_MANAGED_OPENAI_API_KEYS') ?? Deno.env.get('HINTIO_MANAGED_OPENAI_API_KEY') ?? '').trim();
const MANAGED_OPENAI_MODEL = (Deno.env.get('HINTIO_MANAGED_OPENAI_MODEL') ?? '').trim() || 'gpt-5.6-luna';

function splitKeys(raw: string): string[] {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const candidate of raw.split(/[\s,;]+/)) {
        const key = candidate.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
    }
    return keys;
}

function buildGeminiKeyList(rowKey: string): string[] {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const candidate of [rowKey, MANAGED_GEMINI_EXTRA_KEYS].join(',').split(/[\s,;]+/)) {
        const key = candidate.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
    }
    return keys;
}

const ACCESS_TOKEN_REGEX = /^SKI-[A-Za-z0-9_-]{20,252}$/;
const GENERIC_ACCESS_TOKEN_REGEX = /^[A-Za-z0-9_-]{6,256}$/;

function isAllowedAccessTokenFormat(accessToken: string): boolean {
    return ACCESS_TOKEN_REGEX.test(accessToken) || GENERIC_ACCESS_TOKEN_REGEX.test(accessToken);
}

function getClientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for') ?? '';
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
    return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

async function sha256Hex(value: string): Promise<string> {
    const encoded = new TextEncoder().encode(value);
    const digestBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digestBuffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const expectedAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const expectedRuntimeSecret = Deno.env.get('HINTIO_INTERNAL_RUNTIME_SECRET') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
        return new Response(JSON.stringify({ error: 'Supabase service runtime missing env vars' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const apikeyHeader = (req.headers.get('apikey') ?? '').trim();
    if (expectedAnonKey && apikeyHeader !== expectedAnonKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized request' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const runtimeSecretHeader = (req.headers.get('x-runtime-secret') ?? '').trim();
    if (runtimeSecretHeader && (!expectedRuntimeSecret || runtimeSecretHeader !== expectedRuntimeSecret)) {
        return new Response(JSON.stringify({ error: 'Unauthorized internal runtime request' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const isInternalRuntimeRequest = Boolean(expectedRuntimeSecret) && Boolean(runtimeSecretHeader) && runtimeSecretHeader === expectedRuntimeSecret;

    const clientIntent = (req.headers.get('x-client-intent') ?? '').trim().toLowerCase();
    if (!isInternalRuntimeRequest && clientIntent !== 'desktop-runtime') {
        return new Response(JSON.stringify({ error: 'Invalid client intent' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const userAgent = (req.headers.get('user-agent') ?? '').toLowerCase();
    const suspiciousAgent =
        !userAgent ||
        userAgent.includes('python-requests') ||
        userAgent.includes('curl/') ||
        userAgent.includes('wget/') ||
        userAgent.includes('scrapy') ||
        userAgent.includes('postmanruntime');

    if (!isInternalRuntimeRequest && suspiciousAgent) {
        return new Response(JSON.stringify({ error: 'Automated client rejected' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const authHeader = req.headers.get('authorization') ?? '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

    const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('application/json')) {
        return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
            status: 415,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    let payload: RequestPayload = {};
    let consume = false;
    try {
        payload = (await req.json().catch(() => ({}))) as RequestPayload;
        if (payload.consume !== undefined && typeof payload.consume !== 'boolean') {
            return new Response(JSON.stringify({ error: 'consume must be a boolean' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        consume = payload.consume === true;
    } catch {
        payload = {};
        consume = false;
    }

    const accessToken = bearerToken.trim();
    if (!accessToken) {
        return new Response(JSON.stringify({ error: 'Missing access token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (!isAllowedAccessTokenFormat(accessToken)) {
        return new Response(JSON.stringify({ error: 'Invalid access token format' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (payload.accessToken && payload.accessToken.trim() && payload.accessToken.trim() !== accessToken) {
        return new Response(JSON.stringify({ error: 'Access token mismatch between body and authorization header' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const clientIp = getClientIp(req);
    const tokenHash = await sha256Hex(accessToken);
    const rateLimitIdentifier = `${clientIp}:${tokenHash}`;
    const { data: rateLimitAllowed, error: rateLimitError } = await client.rpc('enforce_access_token_rate_limit', {
        p_identifier: rateLimitIdentifier,
        p_max_attempts: 12,
        p_window_seconds: 300,
    });

    if (rateLimitError) {
        return new Response(JSON.stringify({ error: 'Auth rate limiter unavailable' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (!rateLimitAllowed) {
        return new Response(JSON.stringify({ error: 'Too many authentication attempts. Please wait and try again.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const burstIdentifier = `burst:${clientIp}`;
    const { data: burstAllowed, error: burstRateLimitError } = await client.rpc('enforce_access_token_rate_limit', {
        p_identifier: burstIdentifier,
        p_max_attempts: 45,
        p_window_seconds: 60,
    });

    if (burstRateLimitError) {
        return new Response(JSON.stringify({ error: 'Burst rate limiter unavailable' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (!burstAllowed) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const rpcName = consume ? 'consume_interview_credit' : 'resolve_provider_secrets';
    const { data, error } = await client.rpc(rpcName, {
        access_token: accessToken,
    });

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const row = (Array.isArray(data) ? data[0] : data) as ResolveRow | undefined;
    if (!row) {
        return new Response(JSON.stringify({ error: 'Invalid or expired access token' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const includeSecrets = consume || isInternalRuntimeRequest;

    return new Response(
        JSON.stringify({
            success: true,
            data: {
                tokenId: row.token_id,
                providerMode: row.provider_mode,
                geminiApiKey: includeSecrets ? (row.gemini_api_key ?? '') : '',
                geminiApiKeys: includeSecrets ? buildGeminiKeyList(row.gemini_api_key ?? '') : [],
                openaiApiKeys: includeSecrets ? splitKeys(MANAGED_OPENAI_KEYS) : [],
                openaiModel: MANAGED_OPENAI_MODEL,
                geminiModel: MANAGED_GEMINI_MODEL,
                groqApiKey: includeSecrets ? (row.groq_api_key ?? '') : '',
                azureApiKey: includeSecrets ? (row.azure_api_key ?? '') : '',
                azureEndpoint: includeSecrets ? (row.azure_endpoint ?? '') : '',
                azureDeployment: includeSecrets ? (row.azure_deployment ?? '') : '',
                cloudToken: includeSecrets ? (row.cloud_token ?? '') : '',
                expiresAt: row.expires_at,
                metadata: row.metadata ?? {},
                maxInterviews: row.max_interviews ?? 0,
                interviewsUsed: row.interviews_used ?? 0,
                interviewsRemaining: Math.max(0, (row.max_interviews ?? 0) - (row.interviews_used ?? 0)),
                creditConsumed: consume,
                secretsIssued: includeSecrets,
            },
        }),
        {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
});
