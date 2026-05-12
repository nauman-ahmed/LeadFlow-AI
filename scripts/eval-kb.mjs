#!/usr/bin/env node
// Run the KB eval set against the running /api/chat/message endpoint.
//
// Usage:
//   npm run dev:web    # in another terminal (server must be running)
//   npm run eval:kb
//
// What it does:
//   For each line of evals/kb.{en,fr}.jsonl:
//     1. POST a fresh chat to /api/chat/message with a unique session_id.
//     2. Score the reply: at least one expected_any keyword must appear.
//        Optional expected_fallback=true requires rag.used_fallback in the response.
//     3. Print per-test pass/fail and a final tally.
//     4. Write a Markdown report to evals/reports/.

import { loadEnv, REPO_ROOT } from './_load-env.mjs';
loadEnv();

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const API_URL = process.env.LEADFLOW_API_URL || 'http://localhost:3000/api/chat/message';
const REPORTS_DIR = resolve(REPO_ROOT, 'evals', 'reports');

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function containsAny(haystack, needles) {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(String(n).toLowerCase()));
}

async function runOne(test) {
  const sessionId = `eval-${test.id}-${randomUUID().slice(0, 8)}`;
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message: test.input,
      language: test.language
    })
  });

  if (!res.ok) {
    return {
      ...test,
      status: 'error',
      reason: `HTTP ${res.status}`,
      reply: '',
      rag: null
    };
  }

  const data = await res.json();
  const reply = data.reply ?? '';
  const rag = data.rag ?? {};

  const checks = [];

  if (Array.isArray(test.expected_any) && test.expected_any.length > 0) {
    const hit = containsAny(reply, test.expected_any);
    checks.push({
      name: 'expected_any',
      pass: hit,
      detail: hit ? '' : `none of: ${test.expected_any.join(', ')}`
    });
  }

  if (test.expected_fallback === true) {
    checks.push({
      name: 'expected_fallback',
      pass: !!rag.used_fallback,
      detail: rag.used_fallback ? '' : `rag.used_fallback was false (top_score=${rag.top_score})`
    });
  }

  if (Array.isArray(test.must_not_say) && test.must_not_say.length > 0) {
    const bad = test.must_not_say.find((n) => reply.toLowerCase().includes(String(n).toLowerCase()));
    checks.push({
      name: 'must_not_say',
      pass: !bad,
      detail: bad ? `contained forbidden phrase: ${bad}` : ''
    });
  }

  const pass = checks.every((c) => c.pass);
  return { ...test, status: pass ? 'pass' : 'fail', checks, reply, rag };
}

async function main() {
  const en = readJsonl(resolve(REPO_ROOT, 'evals', 'kb.en.jsonl'));
  const fr = readJsonl(resolve(REPO_ROOT, 'evals', 'kb.fr.jsonl'));
  const all = [...en, ...fr];
  if (all.length === 0) {
    console.error('No eval cases found.');
    process.exit(1);
  }

  console.log(`📊 LeadFlow KB eval — ${all.length} cases (en: ${en.length}, fr: ${fr.length})`);
  console.log(`   endpoint: ${API_URL}\n`);

  const results = [];
  let pass = 0;
  let fail = 0;
  let errors = 0;

  for (const test of all) {
    process.stdout.write(`  [${test.language}] ${test.id} … `);
    try {
      const r = await runOne(test);
      results.push(r);
      if (r.status === 'pass') {
        pass += 1;
        console.log('✓');
      } else if (r.status === 'error') {
        errors += 1;
        console.log(`💥 ${r.reason}`);
      } else {
        fail += 1;
        const fails = r.checks.filter((c) => !c.pass).map((c) => c.name);
        console.log(`✗ (${fails.join(', ')})`);
      }
    } catch (err) {
      errors += 1;
      console.log(`💥 ${err.message}`);
      results.push({ ...test, status: 'error', reason: err.message });
    }
  }

  const total = pass + fail + errors;
  const passRate = ((pass / total) * 100).toFixed(0);
  console.log(`\n📈 ${pass}/${total} passed (${passRate}%) · ${fail} failed · ${errors} errors`);

  // Write Markdown report
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(REPORTS_DIR, `${stamp}.md`);

  const lines = [
    `# KB eval report — ${new Date().toISOString()}`,
    ``,
    `- Endpoint: \`${API_URL}\``,
    `- Total: ${total} (pass: ${pass}, fail: ${fail}, error: ${errors})`,
    `- Pass rate: ${passRate}%`,
    ``,
    `## Cases`,
    ``
  ];
  for (const r of results) {
    lines.push(`### ${r.status === 'pass' ? '✅' : r.status === 'error' ? '💥' : '❌'} [${r.language}] ${r.id}`);
    lines.push('');
    lines.push(`**Input:** ${r.input}`);
    lines.push('');
    if (r.reply) {
      lines.push(`**Reply:** ${r.reply.slice(0, 500)}${r.reply.length > 500 ? '…' : ''}`);
      lines.push('');
    }
    if (r.rag) {
      lines.push(
        `**RAG:** top_score=${r.rag.top_score}, hits=${r.rag.hits}, used_fallback=${r.rag.used_fallback}`
      );
      lines.push('');
    }
    if (r.checks) {
      for (const c of r.checks) {
        lines.push(`- ${c.pass ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
      }
      lines.push('');
    } else if (r.reason) {
      lines.push(`**Error:** ${r.reason}`);
      lines.push('');
    }
  }

  writeFileSync(reportPath, lines.join('\n'));
  console.log(`\n📝 Report: ${reportPath}`);

  if (fail > 0 || errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
