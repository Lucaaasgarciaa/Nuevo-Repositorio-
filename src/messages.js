import { startOfDay, addDays, formatTime, formatDay, formatDateTime } from './dates.js';

/**
 * Agrupa las tareas en atrasadas / hoy / próximas y las numera.
 * Devuelve el texto y las tareas en el orden en que aparecen numeradas.
 */
export function formatTaskList(tasks, now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const groups = [
    ['⚠️ *Atrasadas*', tasks.filter((t) => t.date < today)],
    ['📅 *Hoy*', tasks.filter((t) => t.date >= today && t.date < tomorrow)],
    ['🔜 *Próximos días*', tasks.filter((t) => t.date >= tomorrow)],
  ];

  const ordered = [];
  const lines = [];
  for (const [label, items] of groups) {
    if (!items.length) continue;
    lines.push('', label);
    for (const task of items) {
      ordered.push(task);
      const when = task.date >= today && task.date < tomorrow
        ? (task.hasTime ? formatTime(task.date) : '')
        : (task.hasTime ? formatDateTime(task.date) : formatDay(task.date));
      lines.push(`${ordered.length}. ${task.title}${when ? ` — ${when}` : ''}`);
    }
  }
  return { text: lines.join('\n').trim(), ordered };
}

export function formatScheduled(item) {
  const to = item.name ? `${item.name} (+${item.to})` : `+${item.to}`;
  const preview = item.text.length > 80 ? `${item.text.slice(0, 80)}…` : item.text;
  return `#${item.id} · ${formatDateTime(new Date(item.sendAt))} → ${to}\n   "${preview}"`;
}

export const HELP = `🤖 *Comandos*

*Tareas de Notion*
/tareas — tareas pendientes (atrasadas, hoy y próximos 7 días)
/hecho 2 — marca como hecha la tarea nº 2 de la última lista

*Mensajes programados*
/programar <cuándo> | <para> | <mensaje>
   Ej: /programar mañana 9:30 | juan | Hola Juan, te paso el presupuesto 👍
   Ej: /programar 03/11 10:00 | +34600112233 | Buenos días...
   <cuándo>: en 30m · en 2h · hoy 18:00 · mañana 9:30 · lunes 10:00 · 27/10 9:30
/programados — lista de mensajes pendientes
/cancelar 5 — cancela el mensaje #5

*Contactos*
/contacto juan +34600112233 — guarda un alias
/contactos — lista de alias
/borrarcontacto juan

/ayuda — esta ayuda`;
