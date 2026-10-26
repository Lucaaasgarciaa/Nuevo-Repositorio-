// Fechas en la zona horaria del proceso (process.env.TZ).

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const UNITS = {
  m: 60_000, min: 60_000, mins: 60_000, minuto: 60_000, minutos: 60_000,
  h: 3_600_000, hora: 3_600_000, horas: 3_600_000,
  d: 86_400_000, dia: 86_400_000, dias: 86_400_000,
};

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isSameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

/** "08:30" -> {hours: 8, minutes: 30}, o null si no es una hora válida. */
export function parseTime(text) {
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Interpreta expresiones como:
 *   "en 30m", "en 2 horas", "hoy 18:00", "mañana a las 9:30",
 *   "pasado mañana 10", "lunes 9:00", "27/10 09:30", "27/10/2026 9:30"
 * Devuelve un Date o null.
 */
export function parseWhen(input, now = new Date()) {
  const text = stripAccents(input.trim().toLowerCase()).replace(/\s+/g, ' ');

  const rel = /^en (\d+) ?([a-z]+)$/.exec(text);
  if (rel) {
    const unit = UNITS[rel[2]];
    return unit ? new Date(now.getTime() + Number(rel[1]) * unit) : null;
  }

  const m = /^(.+?)(?: a las)? (\d{1,2}(?:[:.h]\d{2})?)(?: ?h)?$/.exec(text);
  if (!m) return null;
  const time = parseTime(m[2]);
  if (!time) return null;

  const day = parseDay(m[1], now);
  if (!day) return null;
  let date = new Date(day.date);
  date.setHours(time.hours, time.minutes, 0, 0);
  // "lunes 18:00" dicho un lunes a las 11:00 es hoy; a las 19:00, el lunes que viene.
  if (day.weekday && date <= now) date = addDays(date, 7);
  return date;
}

function parseDay(text, now) {
  const today = startOfDay(now);
  if (text === 'hoy') return { date: today };
  if (text === 'manana') return { date: addDays(today, 1) };
  if (text === 'pasado manana') return { date: addDays(today, 2) };

  const weekday = WEEKDAYS.indexOf(text.replace(/^(el|este|proximo) /, ''));
  if (weekday !== -1) {
    return { date: addDays(today, (weekday - today.getDay() + 7) % 7), weekday: true };
  }

  const dm = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(text);
  if (!dm) return null;
  const dayNum = Number(dm[1]);
  const month = Number(dm[2]) - 1;
  let year = dm[3] ? Number(dm[3]) : today.getFullYear();
  if (year < 100) year += 2000;
  let d = new Date(year, month, dayNum);
  if (d.getMonth() !== month || d.getDate() !== dayNum) return null;
  // Sin año y ya pasada: se entiende el año que viene.
  if (!dm[3] && d < today) d = new Date(year + 1, month, dayNum);
  return { date: d };
}

/**
 * Fecha de Notion ("2026-10-27" o "2026-10-27T10:00:00.000+01:00") a
 * {date, hasTime}. Las fechas sin hora se toman como medianoche local.
 */
export function parseNotionDate(value) {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return {
      date: new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])),
      hasTime: false,
    };
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, hasTime: true };
}

export function formatDateTime(date) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function formatTime(date) {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function formatDay(date) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}
