process.env.TZ = 'Europe/Madrid';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, parseNotionDate } from '../src/dates.js';

// Lunes 26/10/2026 11:00 hora de Madrid
const now = new Date(2026, 9, 26, 11, 0);
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();

test('fechas relativas', () => {
  assert.equal(parseWhen('en 30m', now).getTime(), now.getTime() + 30 * 60_000);
  assert.equal(parseWhen('en 2 horas', now).getTime(), now.getTime() + 2 * 3_600_000);
  assert.equal(parseWhen('en 1 día', now).getTime(), now.getTime() + 86_400_000);
});

test('hoy, mañana y pasado mañana', () => {
  assert.equal(parseWhen('hoy 18:00', now).getTime(), at(2026, 10, 26, 18, 0));
  assert.equal(parseWhen('Mañana a las 9:30', now).getTime(), at(2026, 10, 27, 9, 30));
  assert.equal(parseWhen('manana 9', now).getTime(), at(2026, 10, 27, 9, 0));
  assert.equal(parseWhen('pasado mañana 10h', now).getTime(), at(2026, 10, 28, 10, 0));
});

test('días de la semana', () => {
  assert.equal(parseWhen('martes 10:00', now).getTime(), at(2026, 10, 27, 10, 0));
  assert.equal(parseWhen('el viernes 8:15', now).getTime(), at(2026, 10, 30, 8, 15));
  assert.equal(parseWhen('domingo 10:00', now).getTime(), at(2026, 11, 1, 10, 0));
  // Hoy es lunes: si la hora no ha pasado es hoy, si no el lunes que viene
  assert.equal(parseWhen('lunes 18:00', now).getTime(), at(2026, 10, 26, 18, 0));
  assert.equal(parseWhen('lunes 10:00', now).getTime(), at(2026, 11, 2, 10, 0));
});

test('fechas exactas', () => {
  assert.equal(parseWhen('27/10 09:30', now).getTime(), at(2026, 10, 27, 9, 30));
  assert.equal(parseWhen('3/11/2026 10:00', now).getTime(), at(2026, 11, 3, 10, 0));
  assert.equal(parseWhen('01/02/27 10:00', now).getTime(), at(2027, 2, 1, 10, 0));
  // Sin año y ya pasada: el año que viene
  assert.equal(parseWhen('15/01 10:00', now).getTime(), at(2027, 1, 15, 10, 0));
});

test('expresiones inválidas', () => {
  for (const s of ['mañana', '32/10 10:00', '10/13 10:00', 'hoy 25:00', 'cuando sea', 'en 3 semanas']) {
    assert.equal(parseWhen(s, now), null, s);
  }
});

test('fechas de Notion', () => {
  const d = parseNotionDate('2026-10-27');
  assert.equal(d.hasTime, false);
  assert.equal(d.date.getTime(), at(2026, 10, 27, 0, 0));
  const t = parseNotionDate('2026-10-27T10:00:00.000+01:00');
  assert.equal(t.hasTime, true);
  assert.equal(t.date.getTime(), at(2026, 10, 27, 10, 0));
  assert.equal(parseNotionDate(null), null);
});
