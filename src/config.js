const env = process.env;

if (!env.TZ) process.env.TZ = 'Europe/Madrid';

const list = (value, fallback) =>
  (value || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const digits = (value) => (value || '').replace(/\D/g, '');

export const config = {
  timezone: process.env.TZ,
  dataDir: env.DATA_DIR || 'data',
  authDir: env.AUTH_DIR || 'auth',
  notion: {
    token: env.NOTION_TOKEN || '',
    databaseId: (env.NOTION_DATABASE_ID || '').trim(),
    dateProperty: env.NOTION_DATE_PROPERTY || '',
    statusProperty: env.NOTION_STATUS_PROPERTY || '',
    doneValues: list(env.NOTION_DONE_VALUES, 'Hecho,Completado,Terminado,Listo,Done,Completed'),
  },
  dailySummaryTime: env.DAILY_SUMMARY_TIME ?? '08:00',
  taskReminderMinutes: Number(env.TASK_REMINDER_MINUTES ?? 15),
  ownerNumber: digits(env.OWNER_NUMBER),
  defaultCountryCode: digits(env.DEFAULT_COUNTRY_CODE) || '34',
  pairingNumber: digits(env.PAIRING_NUMBER),
  maxLateHours: Number(env.MAX_LATE_HOURS ?? 6),
};
