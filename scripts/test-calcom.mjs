#!/usr/bin/env node
// scripts/test-calcom.mjs
//
// Smoke-test Cal.com integration end-to-end:
//   1. Reads CAL_API_KEY / CAL_EVENT_TYPE_ID / CAL_DEFAULT_TIMEZONE from .env
//   2. Lists the next ~5 available slots
//   3. Optionally creates a real booking and immediately cancels it
//      (pass --book to opt in; otherwise dry-run only)
//
// Run:
//   node scripts/test-calcom.mjs                       # availability check only
//   node scripts/test-calcom.mjs --book                # availability + book + cancel
//   node scripts/test-calcom.mjs --book --keep         # book without cancelling
//
// Via npm (note the `--` separator so npm forwards the flags):
//   npm run test:calcom                                # availability only
//   npm run test:calcom -- --book                      # availability + book + cancel
//   npm run test:calcom -- --book --keep               # book without cancelling
//
// Why this exists: the chat path depends on Cal returning a known shape. This
// script lets us validate the API key, event type, and timezone in 1 second
// without spinning up Next.js or the widget.

import { loadEnv } from './_load-env.mjs';

loadEnv();

const ARGS = new Set(process.argv.slice(2));
// npm strips `--book` when invoked as `npm run test:calcom --book` and
// surfaces it as `npm_config_book=true`. Accept both for ergonomics.
const SHOULD_BOOK = ARGS.has('--book') || process.env.npm_config_book === 'true';
const KEEP_BOOKING = ARGS.has('--keep') || process.env.npm_config_keep === 'true';

const CAL_API_BASE = 'https://api.cal.com';
const SLOTS_API_VERSION = '2024-09-04';
const BOOKINGS_API_VERSION = '2026-02-25';
const CANCEL_API_VERSION = '2024-08-13';

function fail(message, hint) {
  console.error(`\n  ✗ ${message}`);
  if (hint) console.error(`    → ${hint}`);
  process.exit(1);
}

function ok(message) {
  console.log(`  ✓ ${message}`);
}

const CAL_API_KEY = process.env.CAL_API_KEY;
const CAL_EVENT_TYPE_ID = process.env.CAL_EVENT_TYPE_ID;
const CAL_DEFAULT_TIMEZONE = process.env.CAL_DEFAULT_TIMEZONE || 'UTC';

console.log('\nLeadFlow — Cal.com smoke test');
console.log('─'.repeat(40));

if (!CAL_API_KEY) {
  fail('CAL_API_KEY is missing in .env', 'Cal.com → Settings → Developer → API Keys → Create new');
}
if (!CAL_EVENT_TYPE_ID) {
  fail('CAL_EVENT_TYPE_ID is missing in .env', 'Open your event type page; the ID is in the URL');
}
ok(`Using event type ${CAL_EVENT_TYPE_ID} in tz ${CAL_DEFAULT_TIMEZONE}`);

async function call(path, init) {
  const res = await fetch(`${CAL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CAL_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    fail(`Cal.com ${path} returned ${res.status}`, JSON.stringify(body)?.slice(0, 240));
  }
  return body;
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

// -----------------------------------------------------------------------------
// Availability
// -----------------------------------------------------------------------------

const startDate = isoDate(new Date());
const endDate = isoDate(new Date(Date.now() + 14 * 24 * 3600 * 1000));

const slotsUrl = new URL(`${CAL_API_BASE}/v2/slots`);
slotsUrl.searchParams.set('eventTypeId', CAL_EVENT_TYPE_ID);
slotsUrl.searchParams.set('start', startDate);
slotsUrl.searchParams.set('end', endDate);
slotsUrl.searchParams.set('timeZone', CAL_DEFAULT_TIMEZONE);

console.log(`\nChecking availability ${startDate} → ${endDate}`);

const slotsRes = await call(slotsUrl.pathname + '?' + slotsUrl.searchParams.toString(), {
  method: 'GET',
  headers: { 'cal-api-version': SLOTS_API_VERSION }
});

if (slotsRes?.status !== 'success' || !slotsRes.data) {
  fail('Unexpected /v2/slots payload shape', JSON.stringify(slotsRes).slice(0, 240));
}

const flat = [];
const now = Date.now();
for (const day of Object.keys(slotsRes.data).sort()) {
  for (const slot of slotsRes.data[day] ?? []) {
    if (!slot?.start) continue;
    if (Date.parse(slot.start) <= now) continue;
    flat.push(slot.start);
  }
}

ok(`Found ${flat.length} future slot(s) in the next 14 days`);
for (const slot of flat.slice(0, 5)) {
  console.log(`     • ${slot}  (${new Date(slot).toLocaleString('en-US', { timeZone: CAL_DEFAULT_TIMEZONE })})`);
}

if (!SHOULD_BOOK) {
  console.log('\nDone. Pass --book to also create + cancel a test booking.\n');
  process.exit(0);
}

// -----------------------------------------------------------------------------
// Booking + cancel
// -----------------------------------------------------------------------------

const firstSlot = flat[0];
if (!firstSlot) fail('No future slots to book against');

console.log(`\nBooking the first available slot: ${firstSlot}`);

const booking = await call('/v2/bookings', {
  method: 'POST',
  headers: { 'cal-api-version': BOOKINGS_API_VERSION },
  body: JSON.stringify({
    start: firstSlot,
    eventTypeId: Number(CAL_EVENT_TYPE_ID),
    attendee: {
      name: 'LeadFlow Smoke Test',
      email: 'leadflow-smoke@example.com',
      timeZone: CAL_DEFAULT_TIMEZONE,
      language: 'en'
    },
    metadata: { source: 'leadflow_smoke_test' }
  })
});

if (booking?.status !== 'success' || !booking.data?.uid) {
  fail('Booking response missing uid', JSON.stringify(booking).slice(0, 240));
}
ok(`Booking created: uid=${booking.data.uid}, status=${booking.data.status}`);

if (KEEP_BOOKING) {
  console.log('\n--keep specified, leaving the test booking in place. Done.\n');
  process.exit(0);
}

console.log('\nCancelling the test booking…');
await call(`/v2/bookings/${encodeURIComponent(booking.data.uid)}/cancel`, {
  method: 'POST',
  headers: { 'cal-api-version': CANCEL_API_VERSION },
  body: JSON.stringify({ cancellationReason: 'LeadFlow smoke test cleanup' })
});
ok('Booking cancelled.\n');
