module.exports = {
    url: process.env.SUPABASE_URL || 'https://vsybqtunyuanxspxhzue.supabase.co',
    anonKey: process.env.SUPABASE_ANON_KEY || 'sb_publishable_3QAlmxPFz8uNsjg1GaV00A_fznmgMEm',
    resolveSecretsFunction: process.env.SUPABASE_SECRETS_FUNCTION || 'resolve-provider-secrets',
};
