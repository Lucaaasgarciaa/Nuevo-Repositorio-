import { parseWhen, startOfDay, addDays, formatDateTime } from './dates.js';
import { normalizePhone } from './phone.js';
import { formatTaskList, formatScheduled, HELP } from './messages.js';

/**
 * Procesa los comandos que escribe el dueño del bot.
 * `whatsapp.isOnWhatsApp(phone)` comprueba que el destinatario existe.
 */
export class Commands {
  constructor({ store, notion, whatsapp, config, now = () => new Date() }) {
    this.store = store;
    this.notion = notion;
    this.whatsapp = whatsapp;
    this.config = config;
    this.now = now;
    this.lastTasks = [];
  }

  /** Devuelve la respuesta al comando, o null si el texto no es un comando. */
  async handle(text) {
    const match = /^\/(\S+)\s*([\s\S]*)$/.exec(text.trim());
    if (!match) return null;
    const command = match[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const args = match[2].trim();

    try {
      switch (command) {
        case 'ayuda': case 'help': case 'start': return HELP;
        case 'tareas': return await this.tasks();
        case 'hecho': case 'hecha': return await this.done(args);
        case 'programar': return await this.schedule(args);
        case 'programados': return this.listScheduled();
        case 'cancelar': return this.cancel(args);
        case 'contacto': return this.addContact(args);
        case 'contactos': return this.listContacts();
        case 'borrarcontacto': return this.removeContact(args);
        default: return `No conozco el comando /${command}. Escribe /ayuda para ver la lista.`;
      }
    } catch (err) {
      return `❌ ${err.message}`;
    }
  }

  async tasks() {
    if (!this.notion.enabled) return '⚙️ Notion no está configurado (NOTION_TOKEN y NOTION_DATABASE_ID).';
    const now = this.now();
    const tasks = await this.notion.getPendingTasks(addDays(startOfDay(now), 7));
    if (!tasks.length) {
      this.lastTasks = [];
      return '✅ No tienes tareas pendientes para los próximos 7 días.';
    }
    const { text, ordered } = formatTaskList(tasks, now);
    this.lastTasks = ordered;
    return `📝 *Tus tareas*\n${text}\n\n_Responde /hecho <nº> para marcar una como hecha._`;
  }

  async done(args) {
    const n = Number(args);
    if (!Number.isInteger(n) || n < 1) return 'Uso: /hecho <nº> (el número que aparece en /tareas)';
    const task = this.lastTasks[n - 1];
    if (!task) return 'No encuentro esa tarea. Escribe /tareas para ver la lista actualizada.';
    if (task.done) return `Ya estaba marcada: ${task.title}`;
    await this.notion.markDone(task.id);
    this.lastTasks[n - 1] = { ...task, done: true };
    return `✅ Hecha: ${task.title}`;
  }

  async schedule(args) {
    const parts = args.split('|');
    if (parts.length < 3) {
      return 'Uso: /programar <cuándo> | <para> | <mensaje>\nEj: /programar mañana 9:30 | juan | Hola Juan 👋';
    }
    const [whenText, toText] = parts.map((p) => p.trim());
    const text = parts.slice(2).join('|').trim();
    if (!text) return 'El mensaje está vacío.';

    const sendAt = parseWhen(whenText, this.now());
    if (!sendAt) {
      return `No entiendo la fecha "${whenText}". Prueba con: en 30m · hoy 18:00 · mañana 9:30 · lunes 10:00 · 27/10 9:30`;
    }
    if (sendAt <= this.now()) return `Esa hora (${formatDateTime(sendAt)}) ya ha pasado.`;

    const recipient = this.resolveRecipient(toText);
    if (!recipient) {
      return `No sé quién es "${toText}". Usa un número con prefijo (+34600112233) o guarda un alias con /contacto.`;
    }
    if (!(await this.whatsapp.isOnWhatsApp(recipient.phone))) {
      return `El número +${recipient.phone} no tiene WhatsApp.`;
    }

    const item = this.store.addScheduled({ to: recipient.phone, name: recipient.name, text, sendAt });
    return `⏰ Programado:\n${formatScheduled(item)}\n\nPara cancelarlo: /cancelar ${item.id}`;
  }

  resolveRecipient(text) {
    const saved = this.store.getContact(text);
    if (saved) return { phone: saved, name: text.toLowerCase() };
    const phone = normalizePhone(text, this.config.defaultCountryCode);
    return phone ? { phone, name: null } : null;
  }

  listScheduled() {
    const items = this.store.pendingScheduled();
    if (!items.length) return 'No tienes mensajes programados.';
    return `📬 *Mensajes programados*\n\n${items.map(formatScheduled).join('\n\n')}`;
  }

  cancel(args) {
    const id = Number(args.replace('#', ''));
    if (!Number.isInteger(id)) return 'Uso: /cancelar <nº> (mira el número con /programados)';
    const item = this.store.cancelScheduled(id);
    return item ? `🗑️ Cancelado el mensaje #${id}.` : `No hay ningún mensaje pendiente con el número #${id}.`;
  }

  addContact(args) {
    const m = /^(\S+)\s+(.+)$/.exec(args);
    if (!m) return 'Uso: /contacto <alias> <número>\nEj: /contacto juan +34600112233';
    const phone = normalizePhone(m[2], this.config.defaultCountryCode);
    if (!phone) return `"${m[2]}" no parece un número de teléfono.`;
    this.store.setContact(m[1], phone);
    return `👤 Guardado: ${m[1].toLowerCase()} → +${phone}`;
  }

  listContacts() {
    const contacts = this.store.contacts();
    if (!contacts.length) return 'No tienes contactos guardados. Añade uno con /contacto <alias> <número>.';
    return `👥 *Contactos*\n${contacts.map(([alias, phone]) => `• ${alias} → +${phone}`).join('\n')}`;
  }

  removeContact(args) {
    if (!args) return 'Uso: /borrarcontacto <alias>';
    return this.store.removeContact(args) ? `🗑️ Borrado: ${args.toLowerCase()}` : `No tengo guardado a "${args}".`;
  }
}
