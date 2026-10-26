process.env.TZ = 'Europe/Madrid';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

const task = (id, title, date, hasTime = true) => ({ id, title, date, hasTime, url: `https://notion.so/${id}`, done: false });

test('ignora texto que no es comando', async () => {
  const { commands } = setup();
  assert.equal(await commands.handle('hola'), null);
  assert.match(await commands.handle('/nose'), /No conozco/);
  assert.match(await commands.handle('/ayuda'), /Comandos/);
});

test('programa, lista y cancela mensajes', async () => {
  const { commands, store } = setup();
  const reply = await commands.handle('/programar mañana 9:30 | +34 600 11 22 33 | Hola Juan,\nte paso el presupuesto | gracias');
  assert.match(reply, /Programado/);
  const [item] = store.pendingScheduled();
  assert.equal(item.to, '34600112233');
  assert.equal(item.text, 'Hola Juan,\nte paso el presupuesto | gracias');
  assert.equal(new Date(item.sendAt).getTime(), new Date(2026, 9, 27, 9, 30).getTime());

  assert.match(await commands.handle('/programados'), /#1/);
  assert.match(await commands.handle('/cancelar 1'), /Cancelado/);
  assert.match(await commands.handle('/cancelar 1'), /No hay ningún/);
  assert.equal(store.pendingScheduled().length, 0);
});

test('usa alias de contactos', async () => {
  const { commands, store } = setup();
  assert.match(await commands.handle('/contacto Juan 600112233'), /juan → \+34600112233/);
  await commands.handle('/programar en 2h | juan | Buenas!');
  assert.equal(store.pendingScheduled()[0].to, '34600112233');
  assert.equal(store.pendingScheduled()[0].name, 'juan');
  assert.match(await commands.handle('/contactos'), /juan/);
  assert.match(await commands.handle('/borrarcontacto juan'), /Borrado/);
});

test('valida la programación', async () => {
  const { commands, store } = setup();
  assert.match(await commands.handle('/programar mañana 9:30 | juan'), /Uso/);
  assert.match(await commands.handle('/programar cuando sea | 600112233 | hola'), /No entiendo la fecha/);
  assert.match(await commands.handle('/programar hoy 8:00 | 600112233 | hola'), /ya ha pasado/);
  assert.match(await commands.handle('/programar hoy 18:00 | pepe | hola'), /No sé quién es/);
  assert.match(await commands.handle('/programar hoy 18:00 | 611111111 | hola'), /no tiene WhatsApp/);
  assert.equal(store.pendingScheduled().length, 0);
});

test('lista tareas y las marca como hechas', async () => {
  const tasks = [
    task('a', 'Llamar a gestoría', new Date(2026, 9, 24), false),
    task('b', 'Enviar factura', new Date(2026, 9, 26, 17, 0)),
    task('c', 'Reunión cliente', new Date(2026, 9, 29, 10, 0)),
  ];
  const { commands, notion } = setup({ tasks });
  const reply = await commands.handle('/tareas');
  assert.match(reply, /Atrasadas[\s\S]*1\. Llamar a gestoría/);
  assert.match(reply, /Hoy[\s\S]*2\. Enviar factura — 17:00/);
  assert.match(reply, /Próximos días[\s\S]*3\. Reunión cliente/);

  assert.match(await commands.handle('/hecho 2'), /Hecha: Enviar factura/);
  assert.deepEqual(notion.done, ['b']);
  assert.match(await commands.handle('/hecho 2'), /Ya estaba marcada/);
  assert.match(await commands.handle('/hecho 9'), /No encuentro/);
});
