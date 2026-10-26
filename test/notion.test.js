process.env.TZ = 'Europe/Madrid';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotionTasks, normalizeDatabaseId } from '../src/notion.js';

const DB = '0123456789abcdef0123456789abcdef';

function fakeFetch(schema, pages) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    let json = {};
    if (init.method === 'GET') json = { properties: schema };
    if (url.endsWith('/query')) json = pages.shift();
    return { ok: true, json: async () => json };
  };
  fn.calls = calls;
  return fn;
}

const page = (id, title, start, estado) => ({
  id, url: `https://notion.so/${id}`,
  properties: {
    Nombre: { type: 'title', title: [{ plain_text: title }] },
    Fecha: { type: 'date', date: start ? { start } : null },
    Estado: { type: 'status', status: { name: estado } },
  },
});

const schema = {
  Nombre: { type: 'title' },
  Notas: { type: 'rich_text' },
  Fecha: { type: 'date' },
  Estado: { type: 'status', status: { options: [{ name: 'Sin empezar' }, { name: 'En curso' }, { name: 'Listo' }] } },
};

test('normaliza el ID de la base de datos', () => {
  assert.equal(normalizeDatabaseId(`https://www.notion.so/miweb/${DB}?v=abc`), DB);
  assert.equal(normalizeDatabaseId('01234567-89ab-cdef-0123-456789abcdef'), DB);
  assert.equal(normalizeDatabaseId('nada'), null);
});

test('lee tareas pendientes paginando y detecta columnas', async () => {
  const fetchImpl = fakeFetch(schema, [
    { results: [page('1', 'Factura', '2026-10-26', 'Sin empezar'), page('2', 'Hecha', '2026-10-26', 'Listo')], has_more: true, next_cursor: 'c' },
    { results: [page('3', 'Llamar', '2026-10-27T10:00:00.000+01:00', 'En curso')], has_more: false },
  ]);
  const notion = new NotionTasks({ token: 't', databaseId: DB, doneValues: ['Hecho', 'Listo'], fetchImpl });
  const tasks = await notion.getPendingTasks(new Date(2026, 9, 27));
  assert.deepEqual(tasks.map((t) => t.title), ['Factura', 'Llamar']);
  assert.equal(tasks[1].hasTime, true);

  const query = fetchImpl.calls[1].body;
  assert.deepEqual(query.filter, { property: 'Fecha', date: { on_or_before: '2026-10-27' } });
  assert.equal(fetchImpl.calls[2].body.start_cursor, 'c');
});

test('marca como hecha con la opción de estado que corresponde', async () => {
  const fetchImpl = fakeFetch(schema, []);
  const notion = new NotionTasks({ token: 't', databaseId: DB, doneValues: ['Hecho', 'Listo'], fetchImpl });
  await notion.markDone('abc');
  const patch = fetchImpl.calls.at(-1);
  assert.equal(patch.method, 'PATCH');
  assert.deepEqual(patch.body, { properties: { Estado: { status: { name: 'Listo' } } } });
});

test('soporta columnas checkbox', async () => {
  const fetchImpl = fakeFetch({ Tarea: { type: 'title' }, Cuándo: { type: 'date' }, Hecho: { type: 'checkbox' } }, []);
  const notion = new NotionTasks({ token: 't', databaseId: DB, doneValues: [], fetchImpl });
  await notion.markDone('abc');
  assert.deepEqual(fetchImpl.calls.at(-1).body, { properties: { Hecho: { checkbox: true } } });
});

test('error claro si la columna configurada no existe', async () => {
  const notion = new NotionTasks({ token: 't', databaseId: DB, dateProperty: 'Vence', doneValues: [], fetchImpl: fakeFetch(schema, []) });
  await assert.rejects(notion.loadSchema(), /no tiene la columna "Vence"/);
});
