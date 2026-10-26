import { Store } from '../src/store.js';
import { Commands } from '../src/commands.js';

export const config = {
  defaultCountryCode: '34',
  dailySummaryTime: '08:00',
  taskReminderMinutes: 15,
  maxLateHours: 6,
};

export function fakeWhatsApp({ connected = true, failSend = false } = {}) {
  return {
    sent: [],
    isConnected: () => connected,
    ownerJid: () => 'me@s.whatsapp.net',
    isOnWhatsApp: async (phone) => phone !== '34611111111',
    async sendText(jid, text) {
      if (failSend) throw new Error('fallo de red');
      this.sent.push({ jid, text });
    },
  };
}

export function fakeNotion(tasks = []) {
  return {
    enabled: true,
    tasks,
    done: [],
    async getPendingTasks(until) {
      const limit = new Date(until);
      limit.setHours(23, 59, 59);
      return this.tasks.filter((t) => !t.done && t.date <= limit);
    },
    async markDone(id) {
      this.done.push(id);
    },
  };
}

export function setup({ now, tasks, whatsapp } = {}) {
  const clock = { now: now ?? new Date(2026, 9, 26, 11, 0) };
  const store = new Store(null);
  const notion = fakeNotion(tasks);
  const wa = whatsapp ?? fakeWhatsApp();
  const commands = new Commands({ store, notion, whatsapp: wa, config, now: () => clock.now });
  return { clock, store, notion, whatsapp: wa, commands };
}
