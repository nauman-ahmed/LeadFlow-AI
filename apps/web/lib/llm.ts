import { env, type LLMProvider } from './env';

export interface EmbedResult {
  vector: number[];
  model: string;
  dimensions: number;
}

/** Qwen (DashScope compatible mode) and OpenAI share the same request shape. */
interface OpenAICompatApi {
  label: string;
  baseUrl: string;
  apiKey: string;
  apiKeyName: string;
}

function openAICompatApi(provider: 'openai' | 'qwen'): OpenAICompatApi {
  const api =
    provider === 'qwen'
      ? {
          label: 'Qwen',
          baseUrl: env.QWEN_BASE_URL,
          apiKey: env.DASHSCOPE_API_KEY,
          apiKeyName: 'DASHSCOPE_API_KEY'
        }
      : {
          label: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: env.OPENAI_API_KEY,
          apiKeyName: 'OPENAI_API_KEY'
        };
  if (!api.apiKey) throw new Error(`${api.apiKeyName} missing`);
  return api;
}

async function postOpenAICompat(
  api: OpenAICompatApi,
  path: string,
  body: Record<string, unknown>,
  what: string,
  signal?: AbortSignal
) {
  const res = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${api.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${api.label} ${what} ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

export async function embed(text: string): Promise<EmbedResult> {
  const provider = env.EMBEDDING_PROVIDER;

  if (provider === 'qwen' || provider === 'openai') {
    const api = openAICompatApi(provider);
    const model = provider === 'qwen' ? env.QWEN_EMBEDDING_MODEL : env.OPENAI_EMBEDDING_MODEL;
    const body: Record<string, unknown> = { model, input: text };
    if (provider === 'qwen') {
      // Must match the pgvector column size in infra/supabase/schema.sql.
      body.dimensions = env.QWEN_EMBEDDING_DIMENSIONS;
      body.encoding_format = 'float';
    }
    const j = await postOpenAICompat(api, '/embeddings', body, 'embed');
    const v = j.data[0].embedding as number[];
    return { vector: v, model, dimensions: v.length };
  }

  // Ollama
  const res = await fetch(`${env.OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.OLLAMA_EMBEDDING_MODEL, prompt: text })
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Ollama embed ${res.status}: ${err.slice(0, 200)}`);
  }
  const j = await res.json();
  const v = j.embedding as number[];
  return { vector: v, model: env.OLLAMA_EMBEDDING_MODEL, dimensions: v.length };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  provider: LLMProvider;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 400;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const provider = env.LLM_PROVIDER;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (provider === 'qwen' || provider === 'openai') {
      const api = openAICompatApi(provider);
      const model = provider === 'qwen' ? env.QWEN_CHAT_MODEL : env.OPENAI_CHAT_MODEL;
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      };
      if (provider === 'qwen') {
        // Qwen3 models think before answering by default. That adds seconds of
        // latency and hundreds of hidden tokens per reply, so it's off unless
        // QWEN_ENABLE_THINKING=true.
        body.enable_thinking = env.QWEN_ENABLE_THINKING;
      }
      const j = await postOpenAICompat(api, '/chat/completions', body, 'chat', controller.signal);
      return {
        content: (j.choices[0].message.content ?? '') as string,
        model,
        provider
      };
    }

    // Ollama
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.OLLAMA_CHAT_MODEL,
        messages,
        stream: false,
        options: { temperature, num_predict: maxTokens }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Ollama chat ${res.status}: ${err.slice(0, 200)}`);
    }
    const j = await res.json();
    return {
      content: (j.message?.content ?? '') as string,
      model: env.OLLAMA_CHAT_MODEL,
      provider: 'ollama'
    };
  } finally {
    clearTimeout(timer);
  }
}
