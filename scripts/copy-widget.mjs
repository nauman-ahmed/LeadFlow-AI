// Copies the built widget bundle from apps/widget/dist into apps/web/public so
// Next.js serves it at /leadflow-widget.js. Runs automatically after
// `npm run build:widget` (postbuild hook).

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const src = resolve(repoRoot, 'apps/widget/dist/leadflow-widget.js');
const destDir = resolve(repoRoot, 'apps/web/public');
const dest = resolve(destDir, 'leadflow-widget.js');

if (!existsSync(src)) {
  console.error(`[copy-widget] source not found: ${src}`);
  console.error(`[copy-widget] did you run "npm run build" inside apps/widget?`);
  process.exit(1);
}

if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

copyFileSync(src, dest);
console.log(`[copy-widget] copied ${src} -> ${dest}`);
