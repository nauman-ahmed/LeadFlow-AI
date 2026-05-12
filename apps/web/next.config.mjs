import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// Load the repo-root .env into process.env so API routes can see Supabase
// credentials without duplicating them inside apps/web. Vars already set in
// the environment win, so deploys can still override.
function loadRootEnv() {
  const file = resolve(repoRoot, '.env');
  if (!existsSync(file)) return;
  const raw = readFileSync(file, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Next.js doesn't try to climb out and pick up
  // an unrelated lockfile from $HOME.
  outputFileTracingRoot: repoRoot,
  async headers() {
    return [
      {
        source: '/leadflow-widget.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300' },
          { key: 'Access-Control-Allow-Origin', value: '*' }
        ]
      },
      {
        source: '/api/chat/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' }
        ]
      }
    ];
  }
};

export default nextConfig;
