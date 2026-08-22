#!/usr/bin/env node
/**
 * db-seed.mjs — наполняет БД демо-данными (под структуру _design/).
 * Идемпотентно: если данные уже есть — пропускает.
 *
 * Запуск: npm run db:seed
 *
 * Учётка владельца по умолчанию:
 *   login:    admin
 *   password: admin12345
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcryptjs from 'bcryptjs';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

async function main() {
  loadEnv();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('✓ Подключение к БД');

  // ===== Пользователь-владелец =====
  const existing = await client.query('SELECT id FROM users WHERE login = $1', ['admin']);
  let userId;
  if (existing.rows.length) {
    userId = existing.rows[0].id;
    console.log('  ⊝ admin уже существует, пропускаю');
  } else {
    const hash = await bcryptjs.hash('admin12345', 10);
    const r = await client.query(
      `INSERT INTO users (login, password_hash, name, role, email, phone, telegram, avatar_text, gradient, birthday, address)
       VALUES ($1,$2,$3,'owner',$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        'admin',
        hash,
        'Малика Каримова',
        'callmeastma@gmail.com',
        '+998 90 123-45-67',
        '@malika_k',
        'МК',
        '#CFEAD7,#5EB286',
        '14 марта',
        'Ташкент, Чиланзар 7 кв.',
      ]
    );
    userId = r.rows[0].id;
    console.log('  ✓ Владелец «Малика Каримова» создан');
  }

  // ===== Дополнительные сотрудники =====
  const teamMembers = [
    ['alisher', 'pass1234', 'Алишер Б.', 'manager', 'alisher@karnaval.uz', 'АБ', '#5FC4BA,#2E8F86'],
    ['gulnora', 'pass1234', 'Гулнора С.', 'employee', 'gulnora@karnaval.uz', 'ГС', '#9B8EC4,#6E5BA8'],
  ];
  for (const [login, pwd, name, role, email, av, grad] of teamMembers) {
    const ex = await client.query('SELECT 1 FROM users WHERE login = $1', [login]);
    if (ex.rows.length) continue;
    const hash = await bcryptjs.hash(pwd, 10);
    await client.query(
      `INSERT INTO users (login, password_hash, name, role, email, avatar_text, gradient)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [login, hash, name, role, email, av, grad]
    );
  }

  // ===== Костюмы =====
  const costumes = [
    ['spider', 'Человек-паук', '104, 110, 116', 3, 2, 75000, 'avail', 'Супергерои'],
    ['elsa',   'Эльза',          '110, 116',     2, 1, 80000, 'avail', 'Принцессы'],
    ['bat',    'Бэтмен',         '110',          1, 0, 85000, 'out',   'Супергерои'],
    ['snow',   'Снежинка',       '92–116',       10, 8, 35000, 'avail', 'Новый год'],
    ['tiger',  'Тигр',           '98, 110',      2, 1, 75000, 'avail', 'Животные'],
    ['bee',    'Пчёлка',         '92, 98',       2, 2, 65000, 'avail', 'Животные'],
    ['sofia',  'Принцесса София','104',          1, 1, 70000, 'rep',   'Принцессы'],
    ['santa',  'Санта-Клаус',    '110, 116',     3, 2, 90000, 'avail', 'Новый год'],
  ];
  const costumeIds = {};
  for (const [type, name, sizes, total, avail, price, st, cat] of costumes) {
    const ex = await client.query('SELECT id FROM costumes WHERE type = $1', [type]);
    if (ex.rows.length) {
      costumeIds[type] = ex.rows[0].id;
      continue;
    }
    const r = await client.query(
      `INSERT INTO costumes (type, name, sizes, total, available, price_per_day, status, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [type, name, sizes, total, avail, price, st, cat]
    );
    costumeIds[type] = r.rows[0].id;
  }
  console.log(`  ✓ Костюмов: ${Object.keys(costumeIds).length}`);

  // ===== Клиенты =====
  const clients = [
    ['Шохрух М.',     'person', '+998 90 123-45-67', null, '#DDB261,#C2891F', 'ШМ', 8,  1240000, 0],
    ['Д/с «Болажон»', 'org',    '+998 71 234-56-78', null, '#5FC4BA,#2E8F86', 'Б',  12, 4800000, 0],
    ['Нигора А.',     'person', '+998 90 555-12-34', null, '#8EB69B,#5E8475', 'НА', 6,  1120000, 0],
    ['Азиза Р.',      'person', '+998 90 333-22-11', null, '#4FBE93,#2E9E78', 'АР', 5,  980000,  0],
    ['Школа №64',     'org',    '+998 71 555-00-11', null, '#9B8EC4,#6E5BA8', 'Ш',  4,  3200000, 0],
    ['Камила Т.',     'person', '+998 90 777-88-99', null, '#E0796D,#CB554A', 'КТ', 3,  560000,  150000],
  ];
  const clientIds = {};
  for (const [name, type, phone, email, grad, av, orders, spent, debt] of clients) {
    const ex = await client.query('SELECT id FROM clients WHERE name = $1', [name]);
    if (ex.rows.length) {
      clientIds[name] = ex.rows[0].id;
      continue;
    }
    const r = await client.query(
      `INSERT INTO clients (name, type, phone, email, gradient, avatar_text, total_orders, total_spent, debt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [name, type, phone, email, grad, av, orders, spent, debt]
    );
    clientIds[name] = r.rows[0].id;
  }
  console.log(`  ✓ Клиентов: ${Object.keys(clientIds).length}`);

  // ===== Заказы (только если ещё нет) =====
  const ordersExist = await client.query('SELECT count(*)::int AS n FROM orders');
  if (ordersExist.rows[0].n === 0) {
    const today = new Date();
    const ymd = (d) => d.toISOString().slice(0, 10);
    const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

    const ordersSeed = [
      {
        number: 1047, client: 'Нигора А.', status: 'build',
        from: addDays(today, 0), to: addDays(today, 2),
        delivery: 'pickup', deposit: 100000, paid: false, pay: null,
        items: [['bee', 1], ['tiger', 1]],
      },
      {
        number: 1045, client: 'Шохрух М.', status: 'conf',
        from: addDays(today, 0), to: addDays(today, 3),
        delivery: 'yandex', deliveryAddr: 'Чиланзар, 9 квартал, д.14', deliveryCost: 28000,
        deposit: 150000, paid: true, pay: 'Карта', discount: 48000, discountLabel: 'Скидка постоянному −10%',
        items: [['bat', 1], ['tiger', 1]],
      },
      {
        number: 1042, client: 'Азиза Р.', status: 'out',
        from: addDays(today, 0), to: addDays(today, 2),
        delivery: 'pickup', deposit: 100000, paid: true, pay: 'Наличные', discount: 30000, discountLabel: 'Скидка постоянному',
        items: [['spider', 1], ['elsa', 1]],
      },
      {
        number: 1038, client: 'Д/с «Болажон»', status: 'out',
        from: addDays(today, -3), to: addDays(today, 0),
        delivery: 'pickup', deposit: 400000, paid: true, pay: 'Перевод', discount: 120000, discountLabel: 'Скидка организации −10%',
        items: [['snow', 8]],
      },
      {
        number: 1031, client: 'Камила Т.', status: 'over',
        from: addDays(today, -5), to: addDays(today, -2),
        delivery: 'pickup', deposit: 80000, paid: false, pay: 'Карта',
        items: [['sofia', 1]],
      },
      {
        number: 1050, client: null /* Запрос из Telegram */, status: 'req',
        from: addDays(today, 1), to: addDays(today, 2),
        delivery: 'pickup', deposit: 0, paid: false, pay: null, source: 'telegram',
        items: [['santa', 1]],
      },
    ];

    for (const o of ordersSeed) {
      const days = Math.max(1, Math.round((o.to - o.from) / 86400000));
      const subtotal = o.items.reduce((s, [type, qty]) => {
        const price = costumes.find((c) => c[0] === type)?.[5] ?? 0;
        return s + price * days * qty;
      }, 0);
      const deliveryCost = o.deliveryCost ?? 0;
      const total = subtotal - (o.discount ?? 0) + deliveryCost;
      const clientId = o.client ? clientIds[o.client] : null;

      const r = await client.query(
        `INSERT INTO orders
         (number, client_id, status, issue_date, return_date, days,
          delivery_type, delivery_addr, delivery_cost,
          subtotal, discount, discount_label, total, deposit, paid, payment_method, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          o.number, clientId, o.status, ymd(o.from), ymd(o.to), days,
          o.delivery, o.deliveryAddr ?? null, deliveryCost,
          subtotal, o.discount ?? 0, o.discountLabel ?? null, total, o.deposit, o.paid, o.pay, o.source ?? 'manual',
        ]
      );
      const orderId = r.rows[0].id;

      for (const [type, qty] of o.items) {
        const c = costumes.find((x) => x[0] === type);
        if (!c) continue;
        await client.query(
          `INSERT INTO order_items (order_id, costume_id, costume_type, name, description, price_per_day, qty)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, costumeIds[type], type, c[1], `размер ${c[2].split(',')[0].trim()}`, c[5], qty]
        );
      }

      await client.query(
        `INSERT INTO order_history (order_id, event, detail) VALUES ($1,'created',$2)`,
        [orderId, `Заказ №${o.number} создан`]
      );
    }
    console.log(`  ✓ Заказов: ${ordersSeed.length}`);
  } else {
    console.log('  ⊝ Заказы уже есть, пропускаю');
  }

  // ===== Транзакции (примеры за месяц) =====
  const trxExist = await client.query('SELECT count(*)::int AS n FROM transactions');
  if (trxExist.rows[0].n === 0) {
    const today = new Date();
    const ymd = (d) => d.toISOString().slice(0, 10);
    const days = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return ymd(d); };
    const trx = [
      ['income', 310000, 'Прокат', 'Шохрух М. · №1045', days(0), 'Карта'],
      ['income', 240000, 'Прокат', 'Нигора А. · №1047', days(0), 'Наличные'],
      ['income', 1120000, 'Прокат', 'Д/с «Болажон» · №1038', days(3), 'Перевод'],
      ['expense', 28000, 'Доставка', 'Yandex Go · доставка курьером', days(0), 'Карта'],
      ['income', 150000, 'Залог', 'Камила Т. · залог №1031', days(2), 'Наличные'],
    ];
    for (const [type, amt, cat, desc, dt, pm] of trx) {
      await client.query(
        `INSERT INTO transactions (type, amount, category, description, date, payment_method)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [type, amt, cat, desc, dt, pm]
      );
    }
    console.log(`  ✓ Транзакций: ${trx.length}`);
  }

  // ===== Уведомления =====
  const ntfExist = await client.query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1', [userId]);
  if (ntfExist.rows[0].n === 0) {
    const ntf = [
      ['order_request', '📥', 'Новый запрос из Telegram', 'Адиба Д. · Эльза и принцесса', '/orders/1050', false],
      ['overdue',       '⚠️', 'Просрочка возврата',       '№1031 · Камила Т. · +2 дня',     '/orders/1031', false],
      ['payment',       '💰', 'Оплата получена',          '№1045 · Шохрух М. · 310 000 сум', '/orders/1045', true],
      ['system',        '✓',  'Костюм возвращён',         '№1042 · Азиза Р. · залог возвращён', '/orders/1042', true],
    ];
    for (const [t, ic, tt, sub, link, read] of ntf) {
      await client.query(
        `INSERT INTO notifications (user_id, type, icon, title, subtitle, link_to, read)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, t, ic, tt, sub, link, read]
      );
    }
    console.log(`  ✓ Уведомлений: ${ntf.length}`);
  }

  console.log('\n✓ Сидинг завершён.');
  console.log('   Логин: admin / admin12345');
  await client.end();
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  console.error(e.stack);
  process.exit(1);
});
