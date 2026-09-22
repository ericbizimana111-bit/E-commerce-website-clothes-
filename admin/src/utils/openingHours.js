/**
 * Opening hours as the storefront expects them: "Mon - Sat: 8:00 AM - 6:30 PM".
 * The station form edits hours as day range + two times and composes this
 * text, so every station is written in a shape the customer site can read
 * (it shows "Open now / Closed" from it). parseHours() reads the same shape
 * back for editing; anything else is treated as custom text.
 */
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "08:00" -> "8:00 AM" */
export function to12h(time24) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time24 || '');
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = match[2];
  if (hour > 23 || Number(minute) > 59) return '';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${suffix}`;
}

/** "6:30 PM" -> "18:30" */
export function to24h(text) {
  const match = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec((text || '').trim());
  if (!match) return '';
  let hour = Number(match[1]);
  if (hour < 1 || hour > 12) return '';
  const pm = match[3].toLowerCase() === 'pm';
  if (hour === 12) hour = pm ? 12 : 0;
  else if (pm) hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

const minutes = (time24) => {
  const [h, m] = time24.split(':').map(Number);
  return h * 60 + m;
};

/** Compose the stored text, or null when the parts are incomplete or inverted. */
export function formatHours({ fromDay, toDay, open, close }) {
  if (!DAYS.includes(fromDay) || !DAYS.includes(toDay)) return null;
  if (!to12h(open) || !to12h(close)) return null;
  if (minutes(close) <= minutes(open)) return null;
  const days = fromDay === toDay ? fromDay : `${fromDay} - ${toDay}`;
  return `${days}: ${to12h(open)} - ${to12h(close)}`;
}

const HOURS_RE =
  /^\s*([A-Za-z]{3})\s*(?:-\s*([A-Za-z]{3}))?\s*:\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*-\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*$/;

const asDay = (value) => DAYS.find((d) => d.toLowerCase() === String(value).toLowerCase()) || null;

/** Text -> form parts, or null when it is not in the standard shape. */
export function parseHours(text) {
  const match = HOURS_RE.exec(text || '');
  if (!match) return null;
  const fromDay = asDay(match[1]);
  const toDay = asDay(match[2] || match[1]);
  const open = to24h(match[3]);
  const close = to24h(match[4]);
  if (!fromDay || !toDay || !open || !close) return null;
  return { fromDay, toDay, open, close };
}
