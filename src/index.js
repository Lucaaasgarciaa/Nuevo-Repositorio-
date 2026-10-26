import path from 'node:path';
import pino from 'pino';
import { config } from './config.js';
import { Store } from './store.js';
import { NotionTasks } from './notion.js';
import { Commands } from './commands.js';
import { Scheduler } from './scheduler.js';
import { WhatsApp } from './whatsapp.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const store = new Store(path.join(config.dataDir, 'store.json'));
const notion = new NotionTasks(config.notion);
if (!notion.enabled) logger.warn('Notion no está configurado: solo funcionarán los mensajes programados.');

let commands;
const whatsapp = new WhatsApp({
  authDir: config.authDir,
  ownerNumber: config.ownerNumber,
  pairingNumber: config.pairingNumber,
  logger,
  onCommand: (text) => commands.handle(text),
});
commands = new Commands({ store, notion, whatsapp, config });
const scheduler = new Scheduler({ store, notion, whatsapp, commands, config, logger });

logger.info(`Zona horaria: ${config.timezone}`);
await whatsapp.connect();
scheduler.start();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    scheduler.stop();
    process.exit(0);
  });
}
