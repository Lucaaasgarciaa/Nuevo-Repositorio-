import { parseTime, startOfDay, addDays, dayKey, formatTime, formatDateTime } from './dates.js';
import { formatTaskList } from './messages.js';
import { phoneToJid } from './phone.js';

const TICK_MS = 30_000;
const NOTION_POLL_MS = 5 * 60_000;

/**
 * Cada 30 s: envía los mensajes programados que tocan, el resumen diario
 * de tareas y los avisos de tareas con hora.
 */
export class Scheduler {
  constructor({ store, notion, whatsapp, commands, config, logger, now = () => new Date() }) {
    this.store = store;
    this.notion = notion;
    this.whatsapp = whatsapp;
    this.commands = commands;
    this.config = config;
    this.logger = logger;
    this.now = now;
    this.lastNotionPoll = 0;
    this.running = false;
  }

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop() {
    clearInterval(this.timer);
  }

  async tick() {
    if (this.running || !this.whatsapp.isConnected()) return;
    this.running = true;
    try {
      await this.sendDueMessages();
      await this.dailySummary();
      await this.taskReminders();
    } catch (err) {
      this.logger?.error({ err }, 'Error en el programador');
    } finally {
      this.running = false;
    }
  }

  notifyOwner(text) {
    return this.whatsapp.sendText(this.whatsapp.ownerJid(), text);
  }

  async sendDueMessages() {
    const now = this.now();
    for (const item of this.store.dueScheduled(now)) {
      const lateMs = now - new Date(item.sendAt);
      const to = item.name ? `${item.name} (+${item.to})` : `+${item.to}`;

      if (lateMs > this.config.maxLateHours * 3_600_000) {
        this.store.updateScheduled(item.id, { status: 'expired' });
        await this.notifyOwner(
          `⚠️ No envié el mensaje #${item.id} para ${to} (era para el ${formatDateTime(new Date(item.sendAt))} ` +
          `y el bot estaba apagado). Si aún quieres mandarlo, vuelve a programarlo:\n\n"${item.text}"`,
        );
        continue;
      }

      try {
        await this.whatsapp.sendText(phoneToJid(item.to), item.text);
        this.store.updateScheduled(item.id, { status: 'sent', sentAt: now.toISOString() });
        const late = lateMs > 5 * 60_000 ? ' (con retraso, el bot estaba apagado)' : '';
        await this.notifyOwner(`📤 Enviado el mensaje #${item.id} a ${to}${late}.`);
      } catch (err) {
        const attempts = (item.attempts || 0) + 1;
        const failed = attempts >= 3;
        this.store.updateScheduled(item.id, { attempts, status: failed ? 'failed' : 'pending' });
        this.logger?.error({ err, id: item.id }, 'No se pudo enviar el mensaje programado');
        if (failed) await this.notifyOwner(`❌ No pude enviar el mensaje #${item.id} a ${to}: ${err.message}`);
      }
    }
  }

  async dailySummary() {
    if (!this.notion.enabled) return;
    const time = this.config.dailySummaryTime && parseTime(this.config.dailySummaryTime);
    if (!time) return;
    const now = this.now();
    const today = dayKey(now);
    const at = startOfDay(now);
    at.setHours(time.hours, time.minutes);
    if (now < at || this.store.lastSummaryDay === today) return;

    const tasks = await this.notion.getPendingTasks(startOfDay(now));
    this.store.lastSummaryDay = today;
    const pending = this.store.pendingScheduled()
      .filter((m) => dayKey(new Date(m.sendAt)) === today);

    let text = '☀️ *Buenos días*\n';
    if (tasks.length) {
      const list = formatTaskList(tasks, now);
      this.commands.lastTasks = list.ordered;
      text += `Tienes ${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'} para hoy:\n${list.text}`;
    } else {
      text += 'No tienes tareas para hoy en Notion. 🎉';
    }
    if (pending.length) {
      text += `\n\n📬 Hoy se enviarán ${pending.length} mensajes programados (/programados).`;
    }
    if (tasks.length) text += '\n\n_Responde /hecho <nº> para marcar una como hecha._';
    await this.notifyOwner(text);
  }

  async taskReminders() {
    const minutes = this.config.taskReminderMinutes;
    if (!this.notion.enabled || !(minutes > 0)) return;
    const now = this.now();
    if (now - this.lastNotionPoll < Math.min(NOTION_POLL_MS, minutes * 60_000)) return;
    this.lastNotionPoll = now.getTime();

    const tasks = await this.notion.getPendingTasks(addDays(startOfDay(now), 1));
    for (const task of tasks) {
      if (!task.hasTime) continue;
      const remindAt = task.date.getTime() - minutes * 60_000;
      // Avisa desde X min antes hasta la hora de la tarea.
      if (now.getTime() < remindAt || now > task.date) continue;
      const key = `${task.id}@${task.date.toISOString()}`;
      if (this.store.wasReminded(key)) continue;
      this.store.markReminded(key, now);
      await this.notifyOwner(`⏰ *Recordatorio*: ${task.title} a las ${formatTime(task.date)}\n${task.url}`);
    }
  }
}
