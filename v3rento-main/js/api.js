/* ============================================================
   API-клиент: fetch + адаптеры server data → design shape.
   Подключается ПЕРВЫМ JS-файлом в обеих HTML.
   Все данные кладутся в window.API.{orders, clients, costumes, ...}.
   ============================================================ */
(function(global){
  'use strict';

  // ===== Низкоуровневый fetch =================================================
  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      ...opts,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
    });
    if (res.status === 401) {
      // сессия пропала — на логин
      location.replace('/login.html');
      throw new Error('unauthorized');
    }
    const data = await res.json().catch(() => ({ ok: false, error: 'invalid json' }));
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // ===== Утилиты форматирования ===============================================
  const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

  // "2026-06-26" → "26 июн"
  function fmtDateShort(iso) {
    if (!iso) return '';
    const [, y, m, d] = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/) || [];
    return d ? `${+d} ${MONTHS_SHORT[+m - 1]}` : iso;
  }

  // ISO range → "20 – 23 июн"
  function fmtDateRange(fromIso, toIso) {
    if (!fromIso || !toIso) return '';
    const [, , fm, fd] = String(fromIso).match(/^(\d{4})-(\d{2})-(\d{2})/) || [];
    const [, , tm, td] = String(toIso).match(/^(\d{4})-(\d{2})-(\d{2})/) || [];
    if (fm === tm && fd === td) return `${+fd} ${MONTHS_SHORT[+fm - 1]}`;
    if (fm === tm) return `${+fd} – ${+td} ${MONTHS_SHORT[+fm - 1]}`;
    return `${+fd} ${MONTHS_SHORT[+fm - 1]} – ${+td} ${MONTHS_SHORT[+tm - 1]}`;
  }

  // 240000 → "240 тыс" / 1240000 → "1,2 млн"
  function fmtMoneyShort(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0','').replace('.', ',') + ' млн';
    if (n >= 1000) return Math.round(n / 1000) + ' тыс';
    return n.toLocaleString('ru-RU');
  }

  // полное: "240 000"
  function fmtMoney(n) {
    return Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }

  // ===== Модель статусов заказа (единая для десктопа и мобайла) ================
  const STATUS_LABEL = {
    req: 'Запрос', book: 'Бронь', conf: 'Ждёт сборки', build: 'Собирают',
    out: 'На руках', over: 'Просрочен', closed: 'Закрыт', cancelled: 'Отменён',
  };
  // Следующий статус в рабочем потоке (кнопка «главное действие»). Шаг «Бронь» не пропускаем.
  const STATUS_NEXT = { req: 'book', book: 'conf', conf: 'build', build: 'out', out: 'closed' };
  // Индекс статуса на таймлайне и подписи шагов.
  const STATUS_STEP = { req: 0, book: 1, conf: 2, build: 3, out: 4, over: 5, closed: 6 };
  const STATUS_STEPS = ['Запрос', 'Бронь', 'Сборка', 'Собирают', 'Выдача', 'Возврат', 'Закрыт'];

  // ===== Адаптеры server → design shape =======================================

  // Костюм (для js/mobile.js/pc.js — флоу склада + позиции)
  function adaptCostume(c) {
    return {
      id: c.id,
      type: c.type,
      name: c.name,
      sizes: c.sizes || '',
      total: c.total,
      avail: c.available,
      price: fmtMoney(c.price_per_day),
      price_raw: Number(c.price_per_day),
      st: c.status,          // 'avail' | 'out' | 'rep'
      note: c.note,
      category: c.category,
      location: c.location || '',
      photos: c.photos || [],
      cover_url: c.cover_url || '',
    };
  }

  // Клиент
  function adaptClient(c) {
    return {
      id: c.id,
      name: c.name,
      sub: c.type === 'org' ? 'организация' : 'физлицо',
      type: c.type,
      phone: c.phone,
      email: c.email,
      telegram: c.telegram,
      tg: c.telegram,
      address: c.address,
      addr: c.address,
      addresses: Array.isArray(c.addresses) ? c.addresses : [],
      av: c.avatar_text || '?',
      g: c.gradient || '#8BA0D4,#2A56C6',
      orders: c.total_orders,
      sum: fmtMoneyShort(c.total_spent),
      sum_raw: Number(c.total_spent),
      debt: Number(c.debt) || 0,
      last: c.last_order_at ? fmtDateShort(c.last_order_at) : '—',
      note: c.note,
    };
  }

  // Заказ (для списка)
  function adaptOrderListItem(o) {
    const items = Array.isArray(o.items) ? o.items : [];
    return {
      id: String(o.number),
      uuid: o.id,
      cl: o.client_name || 'Без клиента',
      sub: o.client_type === 'org' ? 'организация' : 'физлицо',
      av: o.client_avatar_text || (o.client_name ? o.client_name.split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase() : 'З'),
      g: o.client_gradient || '#8BA0D4,#2A56C6',
      items: items.map(i => i.costume_type),
      st: o.status,
      stl: STATUS_LABEL[o.status] || o.status,
      dt: o.status === 'over'
        ? `просрочка ${fmtDateShort(o.return_date)}`
        : fmtDateRange(o.issue_date, o.return_date),
      dates: fmtDateRange(o.issue_date, o.return_date),
      // ISO даты — для точного попадания в календарь (надёжнее regex по тексту)
      issue_date: o.issue_date,
      return_date: o.return_date,
      slot: o.slot === 'pm' ? 'pm' : 'am',
      slotL: o.slot === 'pm' ? 'После 12' : 'Утро',
      sm: fmtMoneyShort(o.total),
      sum: fmtMoney(o.total),
      ssub: o.deposit > 0 ? `залог ${fmtMoneyShort(o.deposit)}` : '',
      days: o.days,
      paid: !!o.paid,
      total_raw: Number(o.total) || 0,
      paidAmount: Number(o.paid_amount) || 0,
      remaining: Math.max(0, (Number(o.total) || 0) - (Number(o.paid_amount) || 0)),
      dep: Number(o.deposit) || 0,
      pay: o.payment_method,
      del: { type: o.delivery_type, cost: Number(o.delivery_cost) || 0, addr: o.delivery_addr || o.client_address || '' },
      delivery_addr: o.delivery_addr || o.client_address || '',
      client_address: o.client_address || '',
      phone: o.client_phone || '',
      telegram: o.client_telegram || '',
      hasLoc: !!(o.delivery_addr || o.client_address),
      delCost: Number(o.delivery_cost) || 0,
      disc: 0,
      danger: o.status === 'over',
      // Сборка (роль «сборщица»): кто назначен + прогресс чек-листа.
      assigned_to: o.assigned_to || null,
      assigned_to_name: o.assigned_to_name || null,
      is_assembled: !!o.is_assembled,
      checklist_total: Number(o.checklist_total) || 0,
      checklist_done: Number(o.checklist_done) || 0,
      lines: items.map(i => ({
        t: i.costume_type,
        name: i.name,
        desc: '',
        pd: Number(i.price_per_day) || 0,
        qty: i.qty,
      })),
    };
  }

  // Полная карточка заказа (как list но с lines, history, checklist)
  function adaptOrderDetail(o) {
    const base = adaptOrderListItem({
      id: o.id, number: o.number, client_name: o.client_name, client_type: o.client_type,
      client_avatar_text: o.client_avatar_text, client_gradient: o.client_gradient,
      status: o.status, issue_date: o.issue_date, return_date: o.return_date,
      days: o.days, slot: o.slot, total: o.total, deposit: o.deposit, paid: o.paid, paid_amount: o.paid_amount,
      payment_method: o.payment_method, delivery_type: o.delivery_type,
      delivery_cost: o.delivery_cost, delivery_addr: o.delivery_addr,
      client_phone: o.client_phone, client_telegram: o.client_telegram, client_address: o.client_address,
      items: (o.items || []).map(i => ({
        costume_type: i.costume_type, name: i.name, qty: i.qty, price_per_day: i.price_per_day,
      })),
    });
    base.lines = (o.items || []).map(i => ({
      t: i.costume_type,
      name: i.name,
      desc: i.description || '',
      pd: Number(i.price_per_day) || 0,
      qty: i.qty,
    }));
    base.history = o.history || [];
    base.checklist = o.checklist || [];
    base.checklist_total = base.checklist.length;
    base.checklist_done = base.checklist.filter((i) => i.done).length;
    base.assigned_to = o.assigned_to || null;
    base.assigned_to_name = o.assigned_to_name || null;
    base.is_assembled = !!o.is_assembled;
    base.rating = o.rating || null;   // {stars, note, rated_by_name} — существующая оценка сборки
    base.delivery_addr = o.delivery_addr || o.client_address || base.delivery_addr || '';
    base.client_address = o.client_address || base.client_address || '';
    base.phone = o.client_phone || base.phone || '';
    base.telegram = o.client_telegram || base.telegram || '';
    base.slot = o.slot === 'pm' ? 'pm' : (base.slot || 'am');
    base.slotL = base.slot === 'pm' ? 'После 12' : 'Утро';
    base.hasLoc = !!base.delivery_addr;
    base.disc = Number(o.discount) || 0;
    base.discL = o.discount_label;
    return base;
  }

  // Транзакция
  function adaptTransaction(t) {
    return {
      id: t.id,
      type: t.type,
      amount: Number(t.amount) || 0,
      amountFmt: (t.type === 'income' ? '+' : '−') + fmtMoney(t.amount),
      category: t.category,
      desc: t.description || '',
      date: t.date,
      dateShort: fmtDateShort(t.date),
      pm: t.payment_method,
    };
  }

  // ===== Высокоуровневые методы ==============================================

  const STATE = {
    me: null,
    costumes: [],
    clients: [],
    orders: [],
    transactions: [],
    summary: null,
    notifications: [],
    stats: null,
  };

  async function loadMe() {
    const r = await api('/auth/me');
    STATE.me = r.user;
    return r.user;
  }

  async function loadAll() {
    // Параллельно — быстрее
    const [costumes, clients, orders, transactions, summary, notifications, stats, bins] = await Promise.all([
      api('/costumes').then(r => r.items.map(adaptCostume)),
      api('/clients').then(r => r.items.map(adaptClient)),
      api('/orders').then(r => r.items.map(adaptOrderListItem)),
      api('/transactions').then(r => r.items.map(adaptTransaction)),
      api('/transactions/summary').then(r => r),
      api('/notifications').then(r => r.items),
      api('/dashboard/stats').then(r => r.stats),
      api('/bins').then(r => r.items || []).catch(() => []),
    ]);
    STATE.costumes = costumes;
    STATE.clients = clients;
    STATE.orders = orders;
    STATE.transactions = transactions;
    STATE.summary = summary;
    STATE.notifications = notifications;
    STATE.stats = stats;
    STATE.bins = bins;
    if (global.K && K.setBins) K.setBins(bins);
    return STATE;
  }

  // Создание / обновление / удаление — простые обёртки
  const Costumes = {
    create: (data) => api('/costumes', { method: 'POST', body: data }).then(r => adaptCostume(r.costume)),
    update: (id, data) => api('/costumes/' + id, { method: 'PUT', body: data }).then(r => adaptCostume(r.costume)),
    remove: (id) => api('/costumes/' + id, { method: 'DELETE' }),
    one: (id) => api('/costumes/' + id),
    async uploadPhoto(id, file) {
      const res = await fetch('/api/costumes/' + id + '/photos', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      });
      if (res.status === 401) { location.replace('/login.html'); throw new Error('unauthorized'); }
      const data = await res.json().catch(() => ({ ok: false, error: 'invalid json' }));
      if (!data.ok) throw new Error(data.error || 'upload failed');
      return data.photo;
    },
    removePhoto: (id, pid) => api('/costumes/' + id + '/photos/' + pid, { method: 'DELETE' }),
  };

  const Clients = {
    create: (data) => api('/clients', { method: 'POST', body: data }).then(r => adaptClient(r.client)),
    update: (id, data) => api('/clients/' + id, { method: 'PUT', body: data }).then(r => adaptClient(r.client)),
    remove: (id) => api('/clients/' + id, { method: 'DELETE' }),
    one: (id) => api('/clients/' + id),
  };

  const Orders = {
    create: (data) => api('/orders', { method: 'POST', body: data }).then(r => adaptOrderDetail(r.order)),
    setStatus: (id, status) => api('/orders/' + id + '/status', { method: 'PATCH', body: { status } }),
    pay: (id, amount, method) => api('/orders/' + id + '/payment', { method: 'POST', body: { amount, method } }).then(r => adaptOrderDetail(r.order)),
    one: (id) => api('/orders/' + id).then(r => adaptOrderDetail(r.order)),
    toggleChecklist: (orderId, itemId, done) =>
      api(`/orders/${orderId}/checklist/${itemId}`, { method: 'PATCH', body: { done } }),
    remove: (id) => api('/orders/' + id, { method: 'DELETE' }),
    // Сборка: назначить ответственную, отметить «собрано», очередь «мои».
    assign: (id, assignedTo) =>
      api('/orders/' + id + '/assign', { method: 'PATCH', body: { assigned_to: assignedTo } }).then(r => adaptOrderDetail(r.order)),
    setAssembled: (id, assembled) =>
      api('/orders/' + id + '/assembled', { method: 'PATCH', body: { assembled } }).then(r => adaptOrderDetail(r.order)),
    setDelivery: (id, data) =>
      api('/orders/' + id + '/delivery', { method: 'PATCH', body: data }).then(r => adaptOrderDetail(r.order)),
    mine: () => api('/orders?assigned=me').then(r => (r.items || []).map(adaptOrderListItem)),
    // Оценка сборки заказа (⭐1–5 + заметка).
    rate: (id, stars, note) => api('/orders/' + id + '/rating', { method: 'POST', body: { stars, note } }).then(r => r.rating),
  };

  const Transactions = {
    create: (data) => api('/transactions', { method: 'POST', body: data }).then(r => adaptTransaction(r.transaction)),
  };

  const Dashboard = {
    stats: () => api('/dashboard/stats').then(r => r.stats),
    queue: () => api('/dashboard/queue').then(r => r.items),
    upcoming: () => api('/dashboard/upcoming-bookings').then(r => r.items),
    summary: () => api('/transactions/summary').then(r => r),
  };

  const Team = {
    list: () => api('/team').then(r => r.items),
    // Метрики сотрудницы (полнота/вовремя/средняя ⭐). Доступ: owner/manager или сама.
    stats: (id) => api('/team/' + id + '/stats').then(r => r.stats),
    update: (id, data) => api('/team/' + id, { method: 'PUT', body: data }).then(r => r.user),
    remove: (id) => api('/team/' + id, { method: 'DELETE' }),
    invite: (data) => api('/team/invite', { method: 'POST', body: data }), // -> { ok, invite, url }
    invites: () => api('/team/invites').then(r => r.items),
  };

  const Bins = {
    list: () => api('/bins').then(r => r.items || []),
    create: (data) => api('/bins', { method: 'POST', body: data }).then(r => r.bin),
    update: (id, data) => api('/bins/' + id, { method: 'PATCH', body: data }).then(r => r.bin),
    remove: (id) => api('/bins/' + id, { method: 'DELETE' }),
  };

  const Auth = {
    logout: () => api('/auth/logout', { method: 'POST' }).then(() => location.replace('/login.html')),
    logoutAll: () => api('/auth/logout-all', { method: 'POST' }),
    changePassword: (current, next) => api('/auth/change-password', { method: 'POST', body: { current, next } }),
  };

  // ===== Общая бизнес-логика (ОДНА для десктопа и мобайла) =====================
  // Раньше эти расчёты были продублированы в pc.js и mobile.js и расходились,
  // из-за чего баги лезли парами. Теперь — единый источник правды.

  // Демо-тенант «Карнавал» — витрина: показываем статичные красивые данные.
  const isDemoTenant = (me) => !!(me && me.tenant_slug === 'karnaval');
  const ACTIVE_ST = new Set(['book', 'conf', 'build', 'out', 'over']);

  const calc = {
    isDemoTenant,
    // Статус сборки заказа для UI руководителя: собрано / X из Y / неполный.
    // Работает по полям списка (checklist_total/done, is_assembled, st).
    // «Неполный» = заказ уже выдан/просрочен/закрыт, но отмечены не все позиции.
    assemblyStatus(o) {
      const total = Number(o.checklist_total) || 0;
      const done = Number(o.checklist_done) || 0;
      const issued = ['out', 'over', 'closed'].includes(o.st);
      if (o.is_assembled) return { kind: 'assembled', label: 'Собрано', done, total };
      if (issued && total > 0 && done < total) return { kind: 'incomplete', label: 'Неполный', done, total };
      if (total > 0) return { kind: 'progress', label: `${done} из ${total}`, done, total };
      return { kind: 'none', label: '', done: 0, total: 0 };
    },
    // Деньги текущего месяца из summary.current_month → {income, expense, profit}
    monthMoney(summary) {
      const cur = (summary && summary.current_month) || [];
      const income = Number(cur.find((x) => x.type === 'income')?.total) || 0;
      const expense = Number(cur.find((x) => x.type === 'expense')?.total) || 0;
      return { income, expense, profit: income - expense };
    },
    // Активные (не закрытые/не отменённые) заказы
    activeOrders(orders) {
      return (orders || []).filter((o) => ACTIVE_ST.has(o.st));
    },
    // Залоги на руках: сумма dep по активным заказам
    deposits(orders) {
      return (orders || []).filter((o) => ACTIVE_ST.has(o.st))
        .reduce((s, o) => s + (Number(o.dep) || 0), 0);
    },
    // Сумма задолженностей клиентов
    debt(clients) {
      return (clients || []).reduce((s, c) => s + (Number(c.debt) || 0), 0);
    },
    // Доход за 6 последних месяцев → [{key,label,income,cur}] (cur = текущий месяц)
    sixMonthIncome(summary, now, monthsShort) {
      now = now || new Date();
      const byMonth = (summary && summary.by_month) || [];
      const out = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const income = Number(byMonth.find((r) => r.month === key && r.type === 'income')?.total) || 0;
        out.push({ key, label: monthsShort ? monthsShort[d.getMonth()] : String(d.getMonth() + 1), income, cur: i === 0 });
      }
      return out;
    },
    // Доход прошлого месяца (для дельты «↑18%»)
    prevMonthIncome(summary, now) {
      now = now || new Date();
      const byMonth = (summary && summary.by_month) || [];
      const p = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const key = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
      return Number(byMonth.find((r) => r.month === key && r.type === 'income')?.total) || 0;
    },
    // Категории по типу → [{name,total,pct}] (доля от суммы этого типа), убыв.
    categoryShare(summary, type) {
      const cats = ((summary && summary.by_category) || [])
        .filter((c) => c.type === type)
        .map((c) => ({ name: c.category, total: Number(c.total) || 0 }))
        .sort((a, b) => b.total - a.total);
      const sum = cats.reduce((s, c) => s + c.total, 0);
      return cats.map((c) => ({ name: c.name, total: c.total, pct: sum ? Math.round((c.total / sum) * 100) : 0 }));
    },
  };

  // Уведомления: единый адаптер серверных данных в view-model.
  // nav = { openOrder(id), goTab(tab) } — навигация своя у каждой оболочки.
  function notifRelTime(iso) {
    const diff = Date.now() - new Date(iso);
    const m = Math.floor(diff / 60000);
    if (m < 60) return m <= 1 ? 'только что' : `${m} мин`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч`;
    return `${Math.floor(h / 24)} дн`;
  }
  const NOTIF_STYLE = {
    new_order: { bg: 'var(--mint-soft)', cl: 'var(--green)' },
    overdue: { bg: 'var(--red-soft)', cl: 'var(--red)' },
    payment: { bg: 'var(--gold-soft)', cl: 'var(--gold)' },
    return: { bg: 'var(--mint-soft)', cl: 'var(--green)' },
  };
  function notifAdapt(items, nav) {
    nav = nav || {};
    return (items || []).map((n) => {
      const st = NOTIF_STYLE[n.type] || { bg: 'var(--surface-2)', cl: 'var(--ink-2)' };
      let go = null;
      if (n.link_to) {
        const m = String(n.link_to).match(/orders\/(\d+)/);
        if (m && nav.openOrder) go = () => nav.openOrder(m[1]);
        else {
          const tab = String(n.link_to).replace(/^\//, '');
          if (['tg', 'money', 'settings', 'team'].includes(tab) && nav.goTab) go = () => nav.goTab(tab);
        }
      }
      return { id: n.id, ic: n.icon || '🔔', bg: st.bg, cl: st.cl, t: n.title || 'Уведомление', s: n.subtitle || '', time: notifRelTime(n.created_at), unread: n.read ? 0 : 1, go };
    });
  }

  global.API = {
    api,
    loadMe,
    loadAll,
    state: STATE,
    Costumes, Clients, Orders, Transactions, Team, Dashboard, Auth, Bins,
    fmt: { money: fmtMoney, moneyShort: fmtMoneyShort, dateShort: fmtDateShort, dateRange: fmtDateRange },
    STATUS_LABEL,
    status: { label: STATUS_LABEL, next: STATUS_NEXT, step: STATUS_STEP, steps: STATUS_STEPS },
    calc,
    notif: { adapt: notifAdapt, relTime: notifRelTime },
    geocode: (q) => api('/geocode?q=' + encodeURIComponent(q || '')).then((r) => ({
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      label: r.label || q,
    })),
  };
})(window);
