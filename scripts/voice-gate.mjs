#!/usr/bin/env node
// Voice gatekeeper: a tiny local proxy that exposes ONLY the Vapi endpoint.
//
// Vapi has to reach /api/voice/server from the internet, so in local dev you
// put a public tunnel (e.g. cloudflared) in front of the app. Pointing that
// tunnel straight at Next.js would also publish /admin, which has no login and
// shows real lead names and emails. This proxy sits between the tunnel and the
// app and forwards `POST /api/voice/server` only; every other request gets 404.
// The voice endpoint still checks VAPI_WEBHOOK_SECRET itself.
//
// Usage:
//   npm run voice:gate                                  # app on LEADFLOW_APP_URL (default :3000)
//   npm run voice:gate -- --upstream http://localhost:3001
//   npm run voice:gate -- --port 3002                   # port the gate listens on (default 3002)
//
// Then, in another terminal:
//   cloudflared tunnel --url http://127.0.0.1:3002
// and set the printed https://<name>.trycloudflare.com/api/voice/server as the
// server URL of the Vapi assistant and each of its tools.

import http from 'node:http';
import { loadEnv } from './_load-env.mjs';

loadEnv();

const ALLOWED_METHOD = 'POST';
const ALLOWED_PATH = '/api/voice/server';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const upstreamRaw = arg('upstream') || process.env.LEADFLOW_APP_URL || 'http://localhost:3000';
const upstream = new URL(/^\d+$/.test(upstreamRaw) ? `http://localhost:${upstreamRaw}` : upstreamRaw);
const listenPort = Number(arg('port') || process.env.VOICE_GATE_PORT || 3002);

if (upstream.protocol !== 'http:') {
  console.error(`[voice-gate] upstream must be a local http:// URL, got ${upstream.href}`);
  process.exit(1);
}

const log = (...parts) => console.log(new Date().toISOString(), ...parts);

const server = http.createServer((req, res) => {
  const path = (req.url || '').split('?')[0];
  if (req.method !== ALLOWED_METHOD || path !== ALLOWED_PATH) {
    res.writeHead(404).end();
    log('blocked', req.method, path);
    return;
  }

  const upstreamReq = http.request(
    {
      hostname: upstream.hostname,
      port: upstream.port || 80,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: upstream.host }
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
      log('forwarded', path, upstreamRes.statusCode);
    }
  );
  upstreamReq.on('error', (err) => {
    log('upstream error', err.message);
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstreamReq);
});

// Listen on loopback only: the tunnel connects locally, nothing else should.
server.listen(listenPort, '127.0.0.1', () => {
  console.log(`[voice-gate] 127.0.0.1:${listenPort} → ${upstream.origin}${ALLOWED_PATH} (everything else 404)`);
  console.log(`[voice-gate] next: cloudflared tunnel --url http://127.0.0.1:${listenPort}`);
});
