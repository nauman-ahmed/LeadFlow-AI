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
  get LEADFLOW_TENANT_NAME() { return optional('LEADFLOW_TENANT_NAME', 'Acme CRM Onboarding'); },
  get LEADFLOW_RAG_SIMILARITY_THRESHOLD() {
    return parseFloat(optional('LEADFLOW_RAG_SIMILARITY_THRESHOLD', '0.55'));
  },
  get LEADFLOW_QUALIFICATION_THRESHOLD() {
    return parseInt(optional('LEADFLOW_QUALIFICATION_THRESHOLD', '60'), 10);
  },

  // Cal.com (Sprint 3)
  get CAL_API_KEY() { return optional('CAL_API_KEY'); },
  get CAL_EVENT_TYPE_ID() { return optional('CAL_EVENT_TYPE_ID'); },
  get CAL_WEBHOOK_SECRET() { return optional('CAL_WEBHOOK_SECRET'); },
  get CAL_DEFAULT_TIMEZONE() { return optional('CAL_DEFAULT_TIMEZONE', 'UTC'); },

  // LLM provider selection
  get LLM_PROVIDER() { return (optional('LLM_PROVIDER', 'ollama') as 'ollama' | 'openai'); },
  get EMBEDDING_PROVIDER() {
    return (optional('EMBEDDING_PROVIDER', optional('LLM_PROVIDER', 'ollama')) as 'ollama' | 'openai');
  },

  // OpenAI
  get OPENAI_API_KEY() { return optional('OPENAI_API_KEY'); },
  get OPENAI_CHAT_MODEL() { return optional('OPENAI_CHAT_MODEL', 'gpt-4o-mini'); },
  get OPENAI_SUMMARY_MODEL() { return optional('OPENAI_SUMMARY_MODEL', 'gpt-4o'); },
  get OPENAI_EMBEDDING_MODEL() { return optional('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'); },

  // Ollama
  get OLLAMA_BASE_URL() { return optional('OLLAMA_BASE_URL', 'http://localhost:11434'); },
  get OLLAMA_CHAT_MODEL() { return optional('OLLAMA_CHAT_MODEL', 'mistral:latest'); },
  get OLLAMA_EMBEDDING_MODEL() { return optional('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text'); }
};
