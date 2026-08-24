/* Интеграционные тесты против ЖИВОГО API (Railway) или локального сервера.
 * Каждый прогон создаёт свои изолированные тенанты и удаляет их в конце (через БД).
 * Запуск:  npm test          (по умолчанию бьёт в прод-URL)
 *          TEST_BASE_URL=http://localhost:3000 npm test
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import '../server/env.js';
import { pool } from '../server/db.js';

const BASE = process.env.TEST_BASE_URL || 'https://cost-costumes-production.up.railway.app';
const createdTenants = [];
let seq = 0;

// Даты заказов — динамическое окно [вчера, завтра]. Раньше были захардкожены
// ('2026-08-01'..'02'), из-за чего тест доступности склада (C4) падал, когда
// Postgres CURRENT_DATE (UTC на Neon) ещё не догнал захардкоженную дату
// (напр. 19:00 UTC = уже завтра в Ташкенте, но CURRENT_DATE — вчерашний).
// Окно ±1 день всегда накрывает CURRENT_DATE при любом сдвиге UTC↔местное.
const DAY = 86400000;
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const ISSUE_DATE = isoDate(Date.now() - DAY);
const RETURN_DATE = isoDate(Date.now() + DAY);

async function api(path, { method = 'GET', body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  // CSRF: verifyOrigin требует Origin с нашего же хоста на изменяющих запросах.
  // Браузер шлёт его сам; в тестах — выставляем вручную (иначе POST/PATCH → 403).
  headers.Origin = BASE;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get('set-cookie');
  let data = null;
  try { data = await res.json(); } catch { /* пусто */ }
  return { status: res.status, data, cookie: setCookie ? setCookie.split(';')[0] : null };
}

async function registerTenant() {
  const uniq = `qa${Date.now()}${seq++}`;
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: { shopName: uniq, name: 'QA Owner', login: uniq, password: 'testpass123' },
  });
  assert.equal(r.status, 200, 'register failed: ' + JSON.stringify(r.data));
  createdTenants.push(r.data.user.tenant_id);
  return { cookie: r.cookie, tenantId: r.data.user.tenant_id, login: uniq };
}

const mkCostume = (t, type, extra = {}) =>
  api('/api/costumes', { method: 'POST', cookie: t.cookie, body: { type, name: type, price_per_day: 1000, total: 2, ...extra } });
const mkOrder = (t, costumeId, qty = 1) =>
  api('/api/orders', { method: 'POST', cookie: t.cookie, body: { issue_date: ISSUE_DATE, return_date: RETURN_DATE, items: [{ costume_id: costumeId, qty }] } });
const availOf = async (t, id) =>
  (await api('/api/costumes', { cookie: t.cookie })).data.items.find((c) => c.id === id).available;

// Создаёт employee в тенанте владельца (через invite + join) → { cookie, id }.
async function mkEmployee(owner) {
  const inv = await api('/api/team/invite', { method: 'POST', cookie: owner.cookie, body: { role: 'employee' } });
  const login = `emp${Date.now()}${seq++}`;
  const j = await api('/api/auth/join', { method: 'POST', body: { token: inv.data.invite.token, login, password: 'emppass123', name: 'QA Emp' } });
  const me = await api('/api/auth/me', { cookie: j.cookie });
  return { cookie: j.cookie, id: me.data.user.id };
}

after(async () => {
  for (const tid of createdTenants) {
    try {
      await pool.query('BEGIN');
      for (const tbl of ['orders', 'transactions', 'notifications', 'costumes', 'clients', 'invites', 'settings', 'users']) {
        await pool.query(`DELETE FROM ${tbl} WHERE tenant_id = $1`, [tid]);
      }
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [tid]);
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK').catch(() => {});
      console.error('cleanup failed for', tid, e.message);
    }
  }
  await pool.end();
});

test('login отклоняет неверный пароль', async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: { login: 'admin', password: 'definitely-wrong-xyz' } });
  assert.equal(r.status, 401);
});

test('register создаёт тенант и сессию, /me возвращает его', async () => {
  const t = await registerTenant();
  assert.ok(t.cookie, 'нет cookie сессии');
  const me = await api('/api/auth/me', { cookie: t.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.tenant_id, t.tenantId);
});

test('изоляция: тенант B не видит костюмы и заказы тенанта A', async () => {
  const A = await registerTenant();
  const B = await registerTenant();
  const cA = await mkCostume(A, 'shared_type'); // одинаковый type у обоих — теперь разрешён
  assert.equal(cA.status, 200);
  const cB = await mkCostume(B, 'shared_type');
  assert.equal(cB.status, 200, 'один type у другого тенанта должен работать');
  const oA = await mkOrder(A, cA.data.costume.id);
  assert.equal(oA.status, 200);

  const listB = await api('/api/costumes', { cookie: B.cookie });
  assert.equal(listB.data.items.some((c) => c.id === cA.data.costume.id), false, 'B видит костюм A!');
  const readB = await api('/api/orders/' + oA.data.order.id, { cookie: B.cookie });
  assert.equal(readB.status, 404, 'B прочитал заказ A!');
});

test('C2: номера заказов независимы по тенантам (оба стартуют с 1001)', async () => {
  const A = await registerTenant();
  const B = await registerTenant();
  const nA = (await mkOrder(A, (await mkCostume(A, 'num')).data.costume.id)).data.order.number;
  const nB = (await mkOrder(B, (await mkCostume(B, 'num')).data.costume.id)).data.order.number;
  assert.equal(nA, 1001);
  assert.equal(nB, 1001);
});

test('№2: POST /orders с невалидным статусом → 400, склад не тронут', async () => {
  const t = await registerTenant();
  const c = await mkCostume(t, 'badstatus', { total: 2 });
  const id = c.data.costume.id;
  assert.equal(await availOf(t, id), 2);

  const bad = await api('/api/orders', {
    method: 'POST', cookie: t.cookie,
    body: { issue_date: ISSUE_DATE, return_date: RETURN_DATE, status: 'hacked', items: [{ costume_id: id, qty: 1 }] },
  });
  assert.equal(bad.status, 400, 'левый статус должен отклоняться: ' + JSON.stringify(bad.data));
  assert.equal(await availOf(t, id), 2, 'склад не должен списываться при отклонённом заказе');
});

test('C4: склад списывается, овербукинг → 409, возврат при отмене', async () => {
  const t = await registerTenant();
  const c = await mkCostume(t, 'stock', { total: 2 });
  const id = c.data.costume.id;
  assert.equal(await availOf(t, id), 2);

  const o = await mkOrder(t, id, 1);
  assert.equal(o.status, 200);
  assert.equal(await availOf(t, id), 1, 'не списался');

  const over = await mkOrder(t, id, 5);
  assert.equal(over.status, 409, 'овербукинг не заблокирован');

  const cancel = await api('/api/orders/' + o.data.order.id + '/status', { method: 'PATCH', cookie: t.cookie, body: { status: 'cancelled' } });
  assert.equal(cancel.status, 200);
  assert.equal(await availOf(t, id), 2, 'не вернулся при отмене');
});

test('C3: employee ограничен своими назначенными заказами (RBAC)', async () => {
  const owner = await registerTenant();
  const emp = await mkEmployee(owner);
  const c = await mkCostume(owner, 'c3', { total: 3 });
  const cid = c.data.costume.id;
  // заказ, назначенный сотруднице (conf)
  const ord = (await api('/api/orders', { method: 'POST', cookie: owner.cookie, body: { issue_date: ISSUE_DATE, return_date: RETURN_DATE, status: 'conf', items: [{ costume_id: cid, qty: 1 }] } })).data.order;
  await api('/api/orders/' + ord.id + '/assign', { method: 'PATCH', cookie: owner.cookie, body: { assigned_to: emp.id } });
  // чужой заказ (не назначен ей)
  const foreign = (await api('/api/orders', { method: 'POST', cookie: owner.cookie, body: { issue_date: ISSUE_DATE, return_date: RETURN_DATE, status: 'build', items: [{ costume_id: cid, qty: 1 }] } })).data.order;

  // Запрещено:
  assert.equal((await api('/api/orders', { method: 'POST', cookie: emp.cookie, body: { issue_date: ISSUE_DATE, return_date: RETURN_DATE, items: [{ costume_id: cid, qty: 1 }] } })).status, 403, 'employee не создаёт заказы');
  assert.equal((await api('/api/orders/' + ord.id + '/assign', { method: 'PATCH', cookie: emp.cookie, body: { assigned_to: emp.id } })).status, 403, 'employee не назначает');
  assert.equal((await api('/api/orders/' + ord.id + '/status', { method: 'PATCH', cookie: emp.cookie, body: { status: 'out' } })).status, 403, 'employee не выдаёт (conf→out)');
  assert.equal((await api('/api/orders/' + foreign.id + '/checklist/' + foreign.checklist[0].id, { method: 'PATCH', cookie: emp.cookie, body: { done: true } })).status, 403, 'employee не трогает чужой чек-лист');
  assert.equal((await api('/api/settings', { method: 'PUT', cookie: emp.cookie, body: { deposit_pct: 99 } })).status, 403, 'employee не меняет настройки');
  assert.equal((await api('/api/costumes', { method: 'POST', cookie: emp.cookie, body: { type: 'x' + seq++, name: 'X', price_per_day: 1, total: 1 } })).status, 403, 'employee не правит склад');

  // Разрешено: conf→build на своём + чек-лист на своём + «Собрано»
  assert.equal((await api('/api/orders/' + ord.id + '/status', { method: 'PATCH', cookie: emp.cookie, body: { status: 'build' } })).status, 200, 'employee начинает сборку своего заказа');
  const own = (await api('/api/orders/' + ord.id, { cookie: emp.cookie })).data.order;
  for (const it of own.checklist) {
    assert.equal((await api('/api/orders/' + ord.id + '/checklist/' + it.id, { method: 'PATCH', cookie: emp.cookie, body: { done: true } })).status, 200, 'employee отмечает свой чек-лист');
  }
  assert.equal((await api('/api/orders/' + ord.id + '/assembled', { method: 'PATCH', cookie: emp.cookie, body: { assembled: true } })).status, 200, 'employee отмечает «Собрано» при 100%');

  // Аудит owner видит, employee — нет
  assert.equal((await api('/api/audit', { cookie: owner.cookie })).status, 200, 'owner видит журнал');
  assert.equal((await api('/api/audit', { cookie: emp.cookie })).status, 403, 'employee не видит журнал');
});

test('Рейтинг сборщицы: авто-метрики + средняя ⭐ + «нет данных» (C3-финал)', async () => {
  const owner = await registerTenant();
  const emp = await mkEmployee(owner);
  const empEmpty = await mkEmployee(owner); // без заказов → «нет данных»
  const c = await mkCostume(owner, 'rt', { total: 9 });
  const cid = c.data.costume.id;

  // Довести заказ до out с полной/неполной сборкой (owner делает setup).
  async function doneOrder({ complete }) {
    const o = (await api('/api/orders', { method: 'POST', cookie: owner.cookie, body: { issue_date: ISSUE_DATE, return_date: RETURN_DATE, status: 'build', items: [{ costume_id: cid, qty: 1 }] } })).data.order;
    await api('/api/orders/' + o.id + '/assign', { method: 'PATCH', cookie: owner.cookie, body: { assigned_to: emp.id } });
    const items = (await api('/api/orders/' + o.id, { cookie: owner.cookie })).data.order.checklist;
    const upto = complete ? items.length : items.length - 1;
    for (let i = 0; i < upto; i++) await api('/api/orders/' + o.id + '/checklist/' + items[i].id, { method: 'PATCH', cookie: owner.cookie, body: { done: true } });
    if (complete) await api('/api/orders/' + o.id + '/assembled', { method: 'PATCH', cookie: owner.cookie, body: { assembled: true } });
    await api('/api/orders/' + o.id + '/status', { method: 'PATCH', cookie: owner.cookie, body: { status: 'out' } });
    return o;
  }
  const A = await doneOrder({ complete: true });
  await doneOrder({ complete: false });

  // Оценки: 5 и 3 → среднее 4.0 (A получает 5, второй — 3)
  assert.equal((await api('/api/orders/' + A.id + '/rating', { method: 'POST', cookie: owner.cookie, body: { stars: 5 } })).status, 200);
  assert.equal((await api('/api/orders/' + A.id + '/rating', { method: 'POST', cookie: owner.cookie, body: { stars: 6 } })).status, 400, 'stars вне 1–5 → 400');
  assert.equal((await api('/api/orders/' + A.id + '/rating', { method: 'POST', cookie: emp.cookie, body: { stars: 5 } })).status, 403, 'employee не оценивает');

  const st = (await api('/api/team/' + emp.id + '/stats', { cookie: owner.cookie })).data.stats;
  assert.equal(st.orders_done, 2, 'собрано 2 заказа');
  assert.equal(st.assembled_pct, 50, 'полнота 50% (1 из 2)');
  assert.equal(st.ratings_count, 1);
  assert.equal(Number(st.avg_rating), 5);

  // employee видит свои, чужие — нет
  assert.equal((await api('/api/team/' + emp.id + '/stats', { cookie: emp.cookie })).status, 200, 'employee видит свои метрики');
  assert.equal((await api('/api/team/' + empEmpty.id + '/stats', { cookie: emp.cookie })).status, 403, 'employee не видит чужие');

  // «Нет данных» для сотрудницы без заказов
  const st2 = (await api('/api/team/' + empEmpty.id + '/stats', { cookie: owner.cookie })).data.stats;
  assert.equal(st2.orders_done, 0);
  assert.equal(st2.assembled_pct, null, 'нет данных → null');
  assert.equal(st2.avg_rating, null, 'нет оценок → null');
});
