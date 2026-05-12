import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROMPT_VERSION = '1.0.0';

function findPromptsDir(): string {
  // When running `next dev` from apps/web, cwd is apps/web.
  // When running from the repo root via `npm run dev:web`, cwd is also apps/web
  // (npm cd's into the workspace). So `../../prompts` is reliable.
  const candidates = [
    resolve(process.cwd(), '..', '..', 'prompts'),
    resolve(process.cwd(), 'prompts'),
    resolve(process.cwd(), '..', 'prompts')
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(`prompts/ folder not found. Tried: ${candidates.join(', ')}`);
}

let cachedDir: string | null = null;
function promptsDir(): string {
  if (cachedDir) return cachedDir;
  cachedDir = findPromptsDir();
  return cachedDir;
}

type PromptName = 'system' | 'qualification' | 'fallback';
type Language = 'en' | 'fr';

const cache = new Map<string, string>();

export function loadPrompt(name: PromptName, language: Language): string {
  const key = `${language}/${name}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const path = resolve(promptsDir(), language, `${name}.md`);
  const raw = readFileSync(path, 'utf8');
  // Strip YAML front matter.
  const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = (match ? match[1] : raw).trim();
  cache.set(key, body);
  return body;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : ''
  );
}

export function promptVersion(): string {
  return PROMPT_VERSION;
}
