/**
 * Spoken UTC offsets: "utc 1", "UTC+1", "gmt-5" → IANA `Etc/GMT…` (sign inverted per tzdb).
 */
export function normalizeUtcOffsetEtcGmt(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === 'utc' || t === 'gmt') return 'Etc/UTC';

  const m = t.match(/^(?:utc|gmt)\s*([+-]?)\s*(\d{1,2})\s*$/i);
  if (!m) return null;

  let offsetHours: number;
  if (m[1] === '-') offsetHours = -parseInt(m[2]!, 10);
  else if (m[1] === '+') offsetHours = parseInt(m[2]!, 10);
  else offsetHours = parseInt(m[2]!, 10); // "utc 1" → +1

  if (!Number.isFinite(offsetHours) || offsetHours < -14 || offsetHours > 14) return null;
  if (offsetHours === 0) return 'Etc/UTC';

  const inverted = -offsetHours;
  const signStr = inverted >= 0 ? '+' : '-';
  const abs = Math.abs(inverted);
  return `Etc/GMT${signStr}${abs}`;
}

/** Region/city from speech + UTC offset phrases. */
export function normalizeVoiceTimeZone(raw: string): string {
  const etc = normalizeUtcOffsetEtcGmt(raw);
  if (etc) return etc;
  return normalizeIanaTimeZone(raw);
}

/**
 * Best-effort normalization for timezones coming from voice STT
 * (e.g. "Europe Berlin" → "Europe/Berlin", "America New York" → "America/New_York").
 */
export function normalizeIanaTimeZone(input: string): string {
  const t = input.trim().replace(/\s+/g, ' ');
  if (!t) return t;

  if (t.includes('/')) {
    const parts = t.split('/');
    if (parts.length < 2) return t;
    const region = parts[0]!;
    const city = parts.slice(1).join('/').replace(/\s+/g, '_');
    return `${region}/${city}`;
  }

  const idx = t.indexOf(' ');
  if (idx > 0) {
    const region = t.slice(0, idx);
    const city = t.slice(idx + 1).replace(/\s+/g, '_');
    return `${region}/${city}`;
  }

  return t;
}
