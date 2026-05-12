import { env } from './env';

export async function callN8n<T = unknown>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  const url = `${env.N8N_WEBHOOK_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-leadflow-secret': env.N8N_WEBHOOK_SECRET
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`n8n ${path} ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
