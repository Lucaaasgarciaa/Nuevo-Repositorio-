import fs from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({
  nextId: 1,
  scheduled: [],
  contacts: {},
  sentReminders: {},
  lastSummaryDay: null,
});

/** Estado persistente en un fichero JSON (escritura atómica). */
export class Store {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    if (file && fs.existsSync(file)) {
      this.data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // --- Mensajes programados ---

  addScheduled({ to, name, text, sendAt }) {
    const item = {
      id: this.data.nextId++,
      to,
      name: name || null,
      text,
      sendAt: sendAt.toISOString(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.data.scheduled.push(item);
    this.save();
    return item;
  }

  pendingScheduled() {
    return this.data.scheduled
      .filter((m) => m.status === 'pending')
      .sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  }

  dueScheduled(now) {
    return this.pendingScheduled().filter((m) => new Date(m.sendAt) <= now);
  }

  updateScheduled(id, changes) {
    const item = this.data.scheduled.find((m) => m.id === id);
    if (!item) return null;
    Object.assign(item, changes);
    this.save();
    return item;
  }

  cancelScheduled(id) {
    const item = this.data.scheduled.find((m) => m.id === id && m.status === 'pending');
    if (!item) return null;
    return this.updateScheduled(id, { status: 'cancelled' });
  }

  // --- Contactos ---

  setContact(alias, phone) {
    this.data.contacts[alias.toLowerCase()] = phone;
    this.save();
  }

  getContact(alias) {
    return this.data.contacts[alias.toLowerCase()] ?? null;
  }

  removeContact(alias) {
    const key = alias.toLowerCase();
    if (!(key in this.data.contacts)) return false;
    delete this.data.contacts[key];
    this.save();
    return true;
  }

  contacts() {
    return Object.entries(this.data.contacts).sort(([a], [b]) => a.localeCompare(b));
  }

  // --- Recordatorios ---

  wasReminded(key) {
    return key in this.data.sentReminders;
  }

  markReminded(key, now = new Date()) {
    this.data.sentReminders[key] = now.toISOString();
    // Limpia avisos de hace más de 14 días.
    const limit = now.getTime() - 14 * 86_400_000;
    for (const [k, at] of Object.entries(this.data.sentReminders)) {
      if (new Date(at).getTime() < limit) delete this.data.sentReminders[k];
    }
    this.save();
  }

  get lastSummaryDay() {
    return this.data.lastSummaryDay;
  }

  set lastSummaryDay(day) {
    this.data.lastSummaryDay = day;
    this.save();
  }
}
