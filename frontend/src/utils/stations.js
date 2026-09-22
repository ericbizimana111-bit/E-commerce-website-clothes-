/**
 * Pickup-station opening hours.
 *
 * The API returns hours as free text such as "Mon - Sat: 8:00 AM - 6:30 PM".
 * parseHours() understands that shape and isOpenNow() evaluates it in
 * Uganda time (EAT, UTC+3, no daylight saving) so the badge is right no
 * matter where the visitor's device is. Anything unparseable returns null —
 * the UI then simply shows the text without an open/closed badge.
 */
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const HOURS_RE =
  /^\s*([A-Za-z]{3})[a-z]*\s*(?:[-–—]\s*([A-Za-z]{3})[a-z]*)?\s*[:,]?\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*$/;

function toMinutes(hour, minute, meridiem) {
  let h = Number(hour);
  const m = Number(minute || 0);
  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 24 || m > 59) return null;
  return h * 60 + m;
}

export function parseHours(text) {
  if (!text || typeof text !== 'string') return null;
  const match = HOURS_RE.exec(text);
  if (!match) return null;
  const [, fromDay, toDay, h1, m1, mer1, h2, m2, mer2] = match;
  const startDay = DAYS.indexOf(fromDay.toLowerCase());
  const endDay = DAYS.indexOf((toDay || fromDay).toLowerCase());
  if (startDay < 0 || endDay < 0) return null;
  // "8:00 - 6:30 PM": a missing first meridiem borrows nothing, so treat 24h.
  const open = toMinutes(h1, m1, mer1 || (mer2 && Number(h1) < 12 && !mer1 ? null : mer1));
  const close = toMinutes(h2, m2, mer2);
  if (open === null || close === null || close <= open) return null;

  const days = [];
  for (let d = startDay; ; d = (d + 1) % 7) {
    days.push(d);
    if (d === endDay) break;
    if (days.length > 7) return null;
  }
  return { days, open, close };
}

/** Uganda wall-clock parts for a given instant. */
function ugandaParts(now) {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return { day: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

/** true / false, or null when the hours text cannot be understood. */
export function isOpenNow(hoursText, now = new Date()) {
  const parsed = parseHours(hoursText);
  if (!parsed) return null;
  const { day, minutes } = ugandaParts(now);
  return parsed.days.includes(day) && minutes >= parsed.open && minutes < parsed.close;
}

export function mapsUrl(station) {
  const query = [station?.name, station?.addressText, station?.district, 'Uganda'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
