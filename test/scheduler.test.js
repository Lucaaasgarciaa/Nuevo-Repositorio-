process.env.TZ = 'Europe/Madrid';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/scheduler.js';
import { setup, config, fakeWhatsApp } from './helpers.js';

function makeScheduler(ctx) {
  return new Scheduler({ ...ctx, config, now: () => ctx.clock.now });
}

test('envía los mensajes programados a su hora', async () => {
  const ctx = setup();
  await ctx.commands.handle('/programar hoy 12:00 | 600112233 | Hola!');
  const scheduler = makeScheduler(ctx);
  ctx.store.lastSummaryDay = '2026-10-26';

  await scheduler.tick();
  assert.equal(ctx.whatsapp.sent.length, 0);

  ctx.clock.now = new Date(2026, 9, 26, 12, 0, 10);
  await scheduler.tick();
  assert.deepEqual(ctx.whatsapp.sent[0], { jid: '34600112233@s.whatsapp.net', text: 'Hola!' });
  assert.match(ctx.whatsapp.sent[1].text, /Enviado el mensaje #1/);
  assert.equal(ctx.store.data.scheduled[0].status, 'sent');

  await scheduler.tick();
  assert.equal(ctx.whatsapp.sent.length, 2);
});

test('no envía mensajes con demasiado retraso', async () => {
  const ctx = setup();
  await ctx.commands.handle('/programar hoy 12:00 | 600112233 | Buenos días');
  ctx.store.lastSummaryDay = '2026-10-26';
  ctx.clock.now = new Date(2026, 9, 26, 20, 0);
  await makeScheduler(ctx).tick();
  assert.equal(ctx.whatsapp.sent.length, 1);
  assert.equal(ctx.whatsapp.sent[0].jid, 'me@s.whatsapp.net');
  assert.match(ctx.whatsapp.sent[0].text, /No envié/);
  assert.equal(ctx.store.data.scheduled[0].status, 'expired');
});

test('reintenta y avisa si falla el envío', async () => {
  const ctx = setup({ whatsapp: fakeWhatsApp() });
  await ctx.commands.handle('/programar hoy 12:00 | 600112233 | Hola');
  ctx.store.lastSummaryDay = '2026-10-26';
  ctx.clock.now = new Date(2026, 9, 26, 12, 1);
  const scheduler = makeScheduler(ctx);
  ctx.whatsapp.sendText = async (jid, text) => {
    if (jid !== 'me@s.whatsapp.net') throw new Error('fallo de red');
    ctx.whatsapp.sent.push({ jid, text });
  };
  for (let i = 0; i < 3; i++) await scheduler.tick();
  assert.equal(ctx.store.data.scheduled[0].status, 'failed');
  assert.match(ctx.whatsapp.sent[0].text, /No pude enviar/);
});

test('resumen diario una vez al día', async () => {
  const ctx = setup({
    now: new Date(2026, 9, 26, 7, 59),
    tasks: [
      { id: 'a', title: 'Enviar factura', date: new Date(2026, 9, 26), hasTime: false, done: false },
      { id: 'b', title: 'Mañana', date: new Date(2026, 9, 27), hasTime: false, done: false },
    ],
  });
  const scheduler = makeScheduler(ctx);
  await scheduler.dailySummary();
  assert.equal(ctx.whatsapp.sent.length, 0);

  ctx.clock.now = new Date(2026, 9, 26, 8, 0);
  await scheduler.dailySummary();
  assert.equal(ctx.whatsapp.sent.length, 1);
  assert.match(ctx.whatsapp.sent[0].text, /1 tarea para hoy[\s\S]*1\. Enviar factura/);
  assert.doesNotMatch(ctx.whatsapp.sent[0].text, /Mañana/);
  assert.equal(ctx.commands.lastTasks[0].id, 'a');

  await scheduler.dailySummary();
  assert.equal(ctx.whatsapp.sent.length, 1);
});

test('avisa antes de las tareas con hora', async () => {
  const ctx = setup({
    now: new Date(2026, 9, 26, 16, 40),
    tasks: [{ id: 'a', title: 'Llamar a Ana', date: new Date(2026, 9, 26, 17, 0), hasTime: true, url: 'u', done: false }],
  });
  const scheduler = makeScheduler(ctx);
  await scheduler.taskReminders();
  assert.equal(ctx.whatsapp.sent.length, 0);

  ctx.clock.now = new Date(2026, 9, 26, 16, 46);
  await scheduler.taskReminders();
  assert.match(ctx.whatsapp.sent[0].text, /Recordatorio\*: Llamar a Ana a las 17:00/);

  ctx.clock.now = new Date(2026, 9, 26, 16, 58);
  await scheduler.taskReminders();
  assert.equal(ctx.whatsapp.sent.length, 1);
});

test('no hace nada sin conexión', async () => {
  const ctx = setup({ whatsapp: fakeWhatsApp({ connected: false }) });
  await ctx.commands.handle('/programar hoy 12:00 | 600112233 | Hola');
  ctx.clock.now = new Date(2026, 9, 26, 12, 1);
  await makeScheduler(ctx).tick();
  assert.equal(ctx.store.pendingScheduled().length, 1);
});
