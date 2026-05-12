// Loads + validates env vars at request time. Throws clear errors when missing.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const env = {
  get SUPABASE_URL() { return required('SUPABASE_URL'); },
  get SUPABASE_SERVICE_ROLE_KEY() { return required('SUPABASE_SERVICE_ROLE_KEY'); },
  get SUPABASE_ANON_KEY() { return optional('SUPABASE_ANON_KEY'); },

  get N8N_WEBHOOK_BASE_URL() { return optional('N8N_WEBHOOK_BASE_URL', 'http://localhost:5678/webhook'); },
  get N8N_WEBHOOK_SECRET() { return optional('N8N_WEBHOOK_SECRET', ''); },

  get LEADFLOW_DEFAULT_LANGUAGE() { return (optional('LEADFLOW_DEFAULT_LANGUAGE', 'en') as 'en' | 'fr'); },
  get LEADFLOW_TENANT_NAME() { return optional('LEADFLOW_TENANT_NAME', 'Acme CRM Onboarding'); }
};
