import { env } from './env';

export interface EmbedResult {
  vector: number[];
  model: string;
  dimensions: number;
}

export async function embed(text: string): Promise<EmbedResult> {
  if (env.EMBEDDING_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: env.OPENAI_EMBEDDING_MODEL, input: text })
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenAI embed ${res.status}: ${err.slice(0, 200)}`);
    }
    const j = await res.json();
    const v = j.data[0].embedding as number[];
    return { vector: v, model: env.OPENAI_EMBEDDING_MODEL, dimensions: v.length };
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
  provider: 'ollama' | 'openai';
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 400;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (env.LLM_PROVIDER === 'openai') {
      if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: env.OPENAI_CHAT_MODEL,
          messages,
          temperature,
          max_tokens: maxTokens
        }),
        signal: controller.signal
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`OpenAI chat ${res.status}: ${err.slice(0, 200)}`);
      }
      const j = await res.json();
      return {
        content: j.choices[0].message.content as string,
        model: env.OPENAI_CHAT_MODEL,
        provider: 'openai'
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
