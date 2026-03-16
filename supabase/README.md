# Supabase backend setup for access-token auth

This app now expects **access tokens** on the client. Provider keys (Gemini/Groq/Azure) are resolved server-side through a Supabase Edge Function.

## 1) Apply migration

Run `supabase/migrations/20260314_access_token_provider_secrets.sql` on your project.
Run `supabase/migrations/20260314_token_quota_and_consume.sql` on your project.
Run `supabase/migrations/20260315_harden_access_token_security.sql` on your project.
Run `supabase/migrations/20260316_subscriptions_rls.sql` on your project.

## 2) Deploy edge function

Deploy `supabase/functions/resolve-provider-secrets/index.ts` as function slug:

`resolve-provider-secrets`

## 3) Configure Electron runtime

Set environment variables before running/packaging the app:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRETS_FUNCTION` (optional, defaults to `resolve-provider-secrets`)
- `HINTIO_INTERNAL_RUNTIME_SECRET` (required for secure internal-only secret resolution)

## 4) Create access token records

Store **SHA-256 hash** of each token in `public.access_tokens.token_hash`.

Example hash generation (Node.js):

```js
require('crypto').createHash('sha256').update('your-access-token').digest('hex')
```

Insert matching secret row in `public.provider_secrets`.

## Notes

- Clients never submit raw provider keys.
- Token validation + key resolution happen in the edge function using `service_role`.
- Non-consuming preflight requests (`consume: false`) validate token status but do **not** return provider secrets.
- Provider secrets are issued only on credit-consuming requests (`consume: true`) via `consume_interview_credit`.
- Edge function now requires `Authorization: Bearer <SKI-...>` and validates `apikey` header against `SUPABASE_ANON_KEY` when configured.
- Tables and RPC execution are hardened to `service_role` only via RLS policies and grants.
- Optional `pg_cron` job cleans up expired tokens every 6 hours when extension is available.

## Auth hardening checklist (Supabase Auth settings)

This app uses access-token auth for provider secret resolution. If you also enable Supabase user auth on **free tier**, prefer low-email-volume options:

- **Prefer Google OAuth sign-in**: Auth → Providers → Google. This avoids most email-sending quota usage.
- **Email verification optional on free tier**: if you keep Email/Password enabled, you may disable "Confirm email" to avoid quota pressure.
- **Session expiration**: Auth → Sessions → set JWT/session lifetime (for example 1–8 hours) and require refresh.
- **Password reset token expiry**: Auth → Email Templates / Security → set short recovery-link/token expiry.
- **Brute-force protection**: keep built-in bot/abuse protections and rate limits for sign-in and recovery endpoints.

App-level additions in this repo:

- DB migration `20260316_auth_rate_limit_and_expiry_hardening.sql` adds server-side token-attempt rate limiting.
- Access tokens are now required to have bounded expiry (`expires_at` mandatory, max 30-day window).
- Calibration transcription/analysis now runs via secure main-process IPC and never exposes provider secrets in renderer code.
