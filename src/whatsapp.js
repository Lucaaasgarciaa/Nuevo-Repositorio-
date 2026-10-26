import makeWASocket, {
  DisconnectReason,
  Browsers,
  areJidsSameUser,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
} from 'baileys';
import qrcode from 'qrcode-terminal';
import { phoneToJid } from './phone.js';

/**
 * Conexión a WhatsApp como "dispositivo vinculado" (igual que WhatsApp Web).
 *
 * Modos:
 *  - Sin OWNER_NUMBER: el bot está vinculado a tu número y le hablas desde
 *    tu chat contigo mismo ("Tú"). Los recordatorios llegan a ese chat.
 *  - Con OWNER_NUMBER: el bot está vinculado a otro número y solo atiende
 *    los mensajes que le mandas desde OWNER_NUMBER.
 */
export class WhatsApp {
  constructor({ authDir, ownerNumber, pairingNumber, logger, onCommand }) {
    this.authDir = authDir;
    this.ownerNumber = ownerNumber;
    this.pairingNumber = pairingNumber;
    this.logger = logger;
    this.onCommand = onCommand;
    this.sock = null;
    this.connected = false;
    this.startedAt = Math.floor(Date.now() / 1000);
    this.sentIds = new Set();
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({}));
    const sock = makeWASocket({
      version,
      auth: state,
      logger: this.logger.child({ module: 'baileys' }, { level: 'warn' }),
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    if (this.pairingNumber && !state.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(this.pairingNumber);
          this.logger.info(`Código de vinculación: ${code}`);
          this.logger.info('WhatsApp > Dispositivos vinculados > Vincular con número de teléfono');
        } catch (err) {
          this.logger.error({ err }, 'No se pudo pedir el código de vinculación');
        }
      }, 3000);
    }

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr && !this.pairingNumber) {
        this.logger.info('Escanea este QR con WhatsApp > Dispositivos vinculados > Vincular un dispositivo');
        qrcode.generate(qr, { small: true });
      }
      if (connection === 'open') {
        this.connected = true;
        this.logger.info(`Conectado a WhatsApp como ${sock.user?.id}`);
      }
      if (connection === 'close') {
        this.connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          this.logger.error(`Sesión cerrada desde el móvil. Borra la carpeta "${this.authDir}" y vuelve a vincular.`);
          process.exit(1);
        }
        this.logger.warn({ code }, 'Conexión cerrada, reconectando...');
        setTimeout(() => this.connect().catch((err) => this.logger.error({ err }, 'Error al reconectar')), 3000);
      }
    });

    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) this.handleMessage(msg).catch((err) => this.logger.error({ err }, 'Error al procesar mensaje'));
    });
  }

  isConnected() {
    return this.connected;
  }

  /** Chat donde el bot te escribe los recordatorios. */
  ownerJid() {
    if (this.ownerNumber) return phoneToJid(this.ownerNumber);
    return jidNormalizedUser(this.sock.user.id);
  }

  isFromOwner(msg) {
    const { key } = msg;
    const chats = [key.remoteJid, key.remoteJidAlt].filter(Boolean);
    if (this.ownerNumber) {
      return !key.fromMe && chats.some((jid) => areJidsSameUser(jid, phoneToJid(this.ownerNumber)));
    }
    const me = [this.sock.user?.id, this.sock.user?.lid].filter(Boolean);
    return key.fromMe && chats.some((jid) => me.some((mine) => areJidsSameUser(jid, mine)));
  }

  async handleMessage(msg) {
    if (!msg.message || this.sentIds.has(msg.key.id)) return;
    // Ignora mensajes antiguos que llegan al sincronizar.
    if (Number(msg.messageTimestamp) < this.startedAt - 60) return;
    if (!this.isFromOwner(msg)) return;

    const content = normalizeMessageContent(msg.message);
    const text = content?.conversation || content?.extendedTextMessage?.text;
    if (!text?.trim().startsWith('/')) return;

    const reply = await this.onCommand(text);
    if (reply) await this.sendText(msg.key.remoteJid, reply);
  }

  async sendText(jid, text) {
    if (!this.connected) throw new Error('WhatsApp no está conectado');
    const sent = await this.sock.sendMessage(jid, { text });
    if (sent?.key?.id) {
      this.sentIds.add(sent.key.id);
      if (this.sentIds.size > 500) this.sentIds.delete(this.sentIds.values().next().value);
    }
    return sent;
  }

  async isOnWhatsApp(phone) {
    const [result] = (await this.sock.onWhatsApp(phone)) || [];
    return Boolean(result?.exists);
  }
}
