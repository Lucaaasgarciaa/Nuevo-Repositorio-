# 🤖 Bot de WhatsApp + Notion

Un bot vinculado a tu WhatsApp que:

- 📝 **Te recuerda las tareas de Notion**: te manda un resumen cada mañana (atrasadas + hoy) y te avisa unos minutos antes de las tareas que tienen hora.
- ✅ **Marca tareas como hechas** en Notion desde WhatsApp.
- ⏰ **Programa mensajes a clientes** para que salgan solos a la hora que digas, igual que un correo programado.

Se conecta como un *dispositivo vinculado* (como WhatsApp Web), así que los mensajes a clientes salen **desde tu número**.

## Cómo se usa

Abre tu chat contigo mismo en WhatsApp (el que aparece como **"Tú"** / "Mensajes para mí") y escribe:

| Comando | Qué hace |
|---|---|
| `/tareas` | Tareas pendientes: atrasadas, hoy y próximos 7 días (numeradas) |
| `/hecho 2` | Marca como hecha en Notion la tarea nº 2 de la lista |
| `/programar mañana 9:30 \| juan \| Hola Juan, te paso el presupuesto` | Programa un mensaje |
| `/programados` | Ver los mensajes pendientes de enviar |
| `/cancelar 5` | Cancelar el mensaje #5 |
| `/contacto juan +34600112233` | Guardar un alias para no escribir el número |
| `/contactos` · `/borrarcontacto juan` | Ver / borrar alias |
| `/ayuda` | Lista de comandos |

**Formatos de fecha** para `/programar`: `en 30m` · `en 2h` · `hoy 18:00` · `mañana 9:30` · `pasado mañana 10:00` · `lunes 10:00` · `27/10 9:30` · `27/10/2026 9:30`.

El mensaje puede tener varias líneas y emojis. Cuando se envía, el bot te lo confirma en tu chat.

## Puesta en marcha

### 1. Notion

1. Ve a <https://www.notion.so/profile/integrations> → **Nueva integración** (interna) y copia el token.
2. Abre tu base de datos de tareas → `•••` → **Conexiones** → añade tu integración.
3. Copia el ID de la base de datos: es el código de 32 caracteres de la URL (`notion.so/xxxxxxxx…?v=…`). También vale pegar la URL entera.

La base de datos necesita una columna de **fecha**. Para saber si una tarea está terminada usa una columna de tipo **Estado**, **Selección** o **Casilla**. Si no indicas los nombres, el bot usa la primera de cada tipo que encuentre.

### 2. Configuración

```bash
npm install
cp .env.example .env   # y rellena NOTION_TOKEN y NOTION_DATABASE_ID
```

Todas las opciones están explicadas en [`.env.example`](.env.example) (hora del resumen diario, minutos de aviso, zona horaria, etc.).

### 3. Vincular WhatsApp

```bash
npm start
```

Aparecerá un **código QR** en la terminal. En el móvil: **WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo** y escanéalo.
Si no puedes ver el QR (por ejemplo en un servidor), pon tu número en `PAIRING_NUMBER` y te dará un código de 8 letras para vincular con *"Vincular con número de teléfono"*.

La sesión se guarda en la carpeta `auth/`, así que solo hay que vincular una vez. Los mensajes programados y los contactos se guardan en `data/store.json`.

### 4. Tenerlo encendido 24/7

El bot solo envía mensajes mientras está encendido. Opciones:

- Un ordenador o Raspberry Pi que esté siempre encendido (`npm start`, o con [pm2](https://pm2.keymetrics.io/): `pm2 start src/index.js --name bot`).
- Un VPS o un servicio con Docker y **disco persistente** (Railway, Fly.io, Render…):

  ```bash
  docker build -t whatsapp-bot .
  docker run -d --restart unless-stopped --env-file .env -v bot-data:/data whatsapp-bot
  docker logs -f <contenedor>   # para ver el QR la primera vez
  ```

Si el bot se apaga y se vuelve a encender, envía los mensajes que se perdieron siempre que no lleven más de `MAX_LATE_HOURS` horas de retraso (6 por defecto). Si llevan más, no los envía y te avisa.

## ⚠️ Cosas a tener en cuenta

- **Notificaciones.** WhatsApp no hace sonar los mensajes que te envías a ti mismo, así que los recordatorios llegan a tu chat "Tú" **sin sonido**. Si quieres que suenen, vincula el bot a **otro número** (por ejemplo un WhatsApp Business con una segunda SIM) y pon tu número personal en `OWNER_NUMBER`. Entonces le hablas al bot como a un contacto más. Eso sí, los mensajes programados saldrán desde el número del bot.
- **No es la API oficial.** Usa [Baileys](https://github.com/WhiskeySockets/Baileys), que se conecta como WhatsApp Web. Para un uso personal y moderado (recordatorios y algunos mensajes a clientes) funciona bien, pero WhatsApp puede bloquear los números que envían spam o mensajes masivos. No lo uses para difusiones.
- Solo responde a comandos que escribes tú: en tu chat "Tú", o desde `OWNER_NUMBER` si lo configuras.

## Desarrollo

```bash
npm test
```

```
src/
  index.js      arranque
  whatsapp.js   conexión a WhatsApp (QR, reconexión, envío)
  notion.js     lectura de tareas y marcar como hechas
  commands.js   comandos que escribes en WhatsApp
  scheduler.js  envío de programados, resumen diario y avisos
  dates.js      "mañana 9:30", "lunes 10:00"… → fecha
  store.js      datos guardados en data/store.json
```
