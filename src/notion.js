import { parseNotionDate, dayKey } from './dates.js';

const API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const STATUS_TYPES = ['status', 'checkbox', 'select'];

/** Acepta el ID con o sin guiones, o la URL completa de la base de datos. */
export function normalizeDatabaseId(input) {
  const match = /[0-9a-f]{32}/i.exec((input || '').replace(/-/g, ''));
  return match ? match[0] : null;
}

export class NotionTasks {
  constructor({ token, databaseId, dateProperty, statusProperty, doneValues, fetchImpl = fetch }) {
    this.token = token;
    this.databaseId = normalizeDatabaseId(databaseId);
    this.dateProperty = dateProperty;
    this.statusProperty = statusProperty;
    this.doneValues = doneValues.map((v) => v.toLowerCase());
    this.fetch = fetchImpl;
    this.schema = null;
  }

  get enabled() {
    return Boolean(this.token && this.databaseId);
  }

  async request(method, url, body) {
    const res = await this.fetch(`${API}${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Notion ${res.status}: ${json.message || res.statusText}`);
    return json;
  }

  /** Lee las columnas de la base de datos y decide cuáles usar. */
  async loadSchema() {
    if (this.schema) return this.schema;
    const db = await this.request('GET', `/databases/${this.databaseId}`);
    const props = Object.entries(db.properties);
    const find = (name, types) => {
      if (name) {
        const found = props.find(([n]) => n.toLowerCase() === name.toLowerCase());
        if (!found) throw new Error(`La base de datos de Notion no tiene la columna "${name}"`);
        if (!types.includes(found[1].type)) {
          throw new Error(`La columna "${name}" es de tipo ${found[1].type}; se esperaba ${types.join('/')}`);
        }
        return found;
      }
      for (const type of types) {
        const found = props.find(([, p]) => p.type === type);
        if (found) return found;
      }
      return null;
    };

    const title = find(null, ['title']);
    const date = find(this.dateProperty, ['date']);
    if (!date) throw new Error('La base de datos de Notion no tiene ninguna columna de tipo fecha');
    const status = find(this.statusProperty, STATUS_TYPES);

    this.schema = {
      title: title[0],
      date: date[0],
      status: status ? { name: status[0], type: status[1].type, options: optionNames(status[1]) } : null,
    };
    return this.schema;
  }

  /** Tareas no terminadas con fecha hasta `until` (incluidas las atrasadas). */
  async getPendingTasks(until) {
    const schema = await this.loadSchema();
    const tasks = [];
    let cursor;
    do {
      const page = await this.request('POST', `/databases/${this.databaseId}/query`, {
        filter: { property: schema.date, date: { on_or_before: dayKey(until) } },
        sorts: [{ property: schema.date, direction: 'ascending' }],
        start_cursor: cursor,
        page_size: 100,
      });
      for (const result of page.results) {
        const task = this.toTask(result, schema);
        if (task && !task.done) tasks.push(task);
      }
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return tasks;
  }

  toTask(page, schema) {
    const props = page.properties;
    const when = parseNotionDate(props[schema.date]?.date?.start);
    if (!when) return null;
    const title = (props[schema.title]?.title || []).map((t) => t.plain_text).join('').trim();
    return {
      id: page.id,
      title: title || '(sin título)',
      date: when.date,
      hasTime: when.hasTime,
      url: page.url,
      done: schema.status ? this.isDone(props[schema.status.name]) : false,
    };
  }

  isDone(prop) {
    if (!prop) return false;
    if (prop.type === 'checkbox') return prop.checkbox === true;
    const name = prop[prop.type]?.name;
    return Boolean(name && this.doneValues.includes(name.toLowerCase()));
  }

  async markDone(pageId) {
    const { status } = await this.loadSchema();
    if (!status) throw new Error('La base de datos no tiene columna de estado o checkbox');
    let value;
    if (status.type === 'checkbox') {
      value = { checkbox: true };
    } else {
      const option = status.options.find((o) => this.doneValues.includes(o.toLowerCase()));
      if (!option) throw new Error(`Ninguna opción de "${status.name}" coincide con NOTION_DONE_VALUES`);
      value = { [status.type]: { name: option } };
    }
    await this.request('PATCH', `/pages/${pageId}`, { properties: { [status.name]: value } });
  }
}

function optionNames(prop) {
  return (prop[prop.type]?.options || []).map((o) => o.name);
}
