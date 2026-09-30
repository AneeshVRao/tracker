export type SendWindow = { days: number[]; from: number; to: number };

export const COUNTRY_TZ: Record<string, string> = {
  india: 'Asia/Kolkata', usa: 'America/New_York', us: 'America/New_York', 'united states': 'America/New_York',
  uk: 'Europe/London', 'united kingdom': 'Europe/London', england: 'Europe/London', scotland: 'Europe/London',
  'hong kong': 'Asia/Hong_Kong', singapore: 'Asia/Singapore', canada: 'America/Toronto', netherlands: 'Europe/Amsterdam',
  australia: 'Australia/Sydney', switzerland: 'Europe/Zurich', china: 'Asia/Shanghai', japan: 'Asia/Tokyo',
  'south korea': 'Asia/Seoul', korea: 'Asia/Seoul', germany: 'Europe/Berlin', belgium: 'Europe/Brussels',
  france: 'Europe/Paris', italy: 'Europe/Rome', spain: 'Europe/Madrid', sweden: 'Europe/Stockholm',
  denmark: 'Europe/Copenhagen', norway: 'Europe/Oslo', finland: 'Europe/Helsinki', austria: 'Europe/Vienna',
  ireland: 'Europe/Dublin', israel: 'Asia/Jerusalem', uae: 'Asia/Dubai', 'united arab emirates': 'Asia/Dubai',
  taiwan: 'Asia/Taipei', 'new zealand': 'Pacific/Auckland', portugal: 'Europe/Lisbon', poland: 'Europe/Warsaw',
  'czech republic': 'Europe/Prague', greece: 'Europe/Athens', brazil: 'America/Sao_Paulo', mexico: 'America/Mexico_City',
  'saudi arabia': 'Asia/Riyadh', qatar: 'Asia/Qatar', malaysia: 'Asia/Kuala_Lumpur',
  thailand: 'Asia/Bangkok', vietnam: 'Asia/Ho_Chi_Minh', indonesia: 'Asia/Jakarta',
};

export function tzFor(country: string | null, override: string | null): string | null {
  if (override) return override;
  if (!country) return null;
  const first = country.split(/\/|,|;|\band\b/i)[0].trim().toLowerCase();
  return COUNTRY_TZ[first] ?? null;
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localParts(d: Date, tz: string) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    partsFmt.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { day: DAYS.indexOf(p.weekday), hour: Number(p.hour), minute: Number(p.minute) };
}

export function inWindow(d: Date, tz: string, w: SendWindow): boolean {
  const l = localParts(d, tz);
  return w.days.includes(l.day) && l.hour >= w.from && l.hour < w.to;
}

const Q = 15 * 60_000; // every real UTC offset is a multiple of 15 minutes

export function nextSlot(now: Date, tz: string, w: SendWindow): Date {
  if (inWindow(now, tz, w)) return now;
  let t = Math.ceil(now.getTime() / Q) * Q;
  for (let i = 0; i < 8 * 96; i++, t += Q) {
    const l = localParts(new Date(t), tz);
    if (w.days.includes(l.day) && l.hour === w.from && l.minute === 0) return new Date(t);
  }
  throw new Error('No send slot in the next 8 days — check the send window');
}

export const formatIn = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
