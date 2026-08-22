/* ============================================================
   Костюмерная — общие утилиты (одна точка правды для PC и mobile)
   Подключается ПЕРЕД art.js, pc.js, mobile.js
   ============================================================ */
(function(global){
  'use strict';

  const _now = new Date();
  const _y = _now.getFullYear();
  const _m = _now.getMonth();
  const _d = _now.getDate();
  const TODAY = {
    y: _y,
    m: _m,
    d: _d,
    iso: `${_y}-${String(_m+1).padStart(2,'0')}-${String(_d).padStart(2,'0')}`,
    dow: _now.getDay(),
  };

  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const MONTHS_PREP = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
  const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const DOW_RU = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const DOW_SHORT_MON_FIRST = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  function fmtDateRu(date){ return `${date.getDate()} ${MONTHS_GEN[date.getMonth()]}`; }
  function fmtDateShortRu(date){ return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`; }
  function fmtTodayLong(){
    return `${DOW_RU[_now.getDay()]}, ${_now.getDate()} ${MONTHS_GEN[_now.getMonth()]}`;
  }

  function buildMonthGrid(year, month){
    const first = new Date(year, month, 1);
    let firstDow = first.getDay() - 1;
    if(firstDow < 0) firstDow = 6;
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
    const cells = [];
    for(let i=0; i<totalCells; i++){
      const d = i - firstDow + 1;
      const inMonth = d >= 1 && d <= daysInMonth;
      const isToday = inMonth && year === TODAY.y && month === TODAY.m && d === TODAY.d;
      cells.push({ d: inMonth ? d : null, inMonth, isToday });
    }
    return cells;
  }

  function fmtMoney(n){
    if(n === null || n === undefined || isNaN(n)) return '0';
    return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }

  function plural(n, forms){
    n = Math.abs(Number(n)) || 0;
    const mod10 = n % 10;
    const mod100 = n % 100;
    if(mod100 >= 11 && mod100 <= 14) return forms[2];
    if(mod10 === 1) return forms[0];
    if(mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  }
  function pluralDays(n){ return plural(n, ['день','дня','дней']); }
  function pluralOrders(n){ return plural(n, ['заказ','заказа','заказов']); }
  function pluralItems(n){ return plural(n, ['позиция','позиции','позиций']); }

  function escapeHtml(str){
    if(str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#39;');
  }
  const cssEscape = (global.CSS && global.CSS.escape)
    ? global.CSS.escape.bind(global.CSS)
    : function(s){ return String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\'+c.charCodeAt(0).toString(16)+' '); };

  function nextOrderId(orders){
    if(!orders || !orders.length) return '1051';
    const max = orders.reduce((m,o)=>{
      const n = +o.id;
      return Number.isFinite(n) && n > m ? n : m;
    }, 1000);
    return String(max + 1);
  }

  function confirmDialog(message, opts){
    opts = opts || {};
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.setAttribute('role','dialog');
      bg.setAttribute('aria-modal','true');
      bg.innerHTML =
        '<div class="modal-card" style="max-width:380px">'+
          '<div class="modal-hd"><h3>'+escapeHtml(opts.title||'Подтвердите действие')+'</h3>'+
            '<button class="modal-cls" aria-label="Закрыть">×</button></div>'+
          '<div class="modal-body" style="padding:18px 22px"><div style="font-size:13.5px;line-height:1.5;color:var(--ink-2)">'+
            escapeHtml(message)+'</div></div>'+
          '<div class="modal-ft">'+
            '<button class="btn ghost" data-cd="no">'+escapeHtml(opts.cancel||'Отмена')+'</button>'+
            '<button class="btn" data-cd="yes" style="'+(opts.danger?'background:var(--red)':'')+'">'+escapeHtml(opts.ok||'Подтвердить')+'</button>'+
          '</div>'+
        '</div>';
      document.body.appendChild(bg);
      const close = (val)=>{ bg.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
      const onKey = (e)=>{
        if(e.key === 'Escape') close(false);
        else if(e.key === 'Enter') close(true);
      };
      bg.addEventListener('click', e=>{
        if(e.target === bg) close(false);
        else if(e.target.closest('.modal-cls') || e.target.closest('[data-cd="no"]')) close(false);
        else if(e.target.closest('[data-cd="yes"]')) close(true);
      });
      document.addEventListener('keydown', onKey);
      setTimeout(()=>bg.querySelector('[data-cd="yes"]')?.focus(), 30);
    });
  }

  function promptText(opts){
    opts = opts || {};
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.setAttribute('role','dialog');
      bg.setAttribute('aria-modal','true');
      bg.innerHTML =
        '<div class="modal-card" style="max-width:380px">'+
          '<div class="modal-hd"><h3>'+escapeHtml(opts.title||'Введите')+'</h3>'+
            '<button class="modal-cls" aria-label="Закрыть">×</button></div>'+
          '<div class="modal-body" style="padding:18px 22px">'+
            '<input id="kPromptVal" type="text" maxlength="'+(opts.max||80)+'" placeholder="'+escapeHtml(opts.placeholder||'')+'" value="'+escapeHtml(opts.value||'')+'">'+
          '</div>'+
          '<div class="modal-ft">'+
            '<button class="btn ghost" data-cd="no">Отмена</button>'+
            '<button class="btn" data-cd="yes">'+escapeHtml(opts.ok||'Сохранить')+'</button>'+
          '</div>'+
        '</div>';
      document.body.appendChild(bg);
      const inp = bg.querySelector('#kPromptVal');
      const close = (val)=>{ bg.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
      const onKey = (e)=>{
        if(e.key === 'Escape') close(null);
        else if(e.key === 'Enter') close(inp.value);
      };
      bg.addEventListener('click', e=>{
        if(e.target === bg || e.target.closest('.modal-cls') || e.target.closest('[data-cd="no"]')) close(null);
        else if(e.target.closest('[data-cd="yes"]')) close(inp.value);
      });
      document.addEventListener('keydown', onKey);
      setTimeout(()=>{ inp.focus(); inp.select(); }, 30);
    });
  }

  function trapFocus(modalEl){
    const focusables = modalEl.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
    if(!focusables.length) return ()=>{};
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const onKey = (e)=>{
      if(e.key !== 'Tab') return;
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    };
    modalEl.addEventListener('keydown', onKey);
    return ()=>modalEl.removeEventListener('keydown', onKey);
  }

  const RU_LAT = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ь:'',ы:'y',э:'e',ю:'yu',я:'ya'};
  function slugType(name){
    let out = '';
    for (const ch of String(name || '').toLowerCase()) {
      if (RU_LAT[ch] != null) out += RU_LAT[ch];
      else if (/[a-z0-9]/.test(ch)) out += ch;
    }
    return (out.slice(0, 16) || 'c');
  }
  function uniqueType(name, existing){
    const base = slugType(name);
    const used = new Set((existing || []).map(c => String(c.type || '').toLowerCase()));
    if (!used.has(base)) return base;
    let i = 2;
    while (used.has(base + i)) i++;
    return base + i;
  }
  function findSameName(list, name, exceptId){
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return (list || []).find(x => x && x.id !== exceptId && String(x.name || '').trim().toLowerCase() === n) || null;
  }

  function ymd(y, m, d){
    return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function isoDay(iso){ return String(iso || '').slice(0, 10); }

  function lateDays(returnIso){
    const iso = isoDay(returnIso);
    if (!iso) return 0;
    const a = new Date(TODAY.iso + 'T12:00:00');
    const b = new Date(iso + 'T12:00:00');
    const n = Math.round((a - b) / 86400000);
    return n > 0 ? n : 0;
  }

  function dayBoard(orders, iso){
    const r = { nIssue:0, nRet:0, nOver:0, issue:[], ret:[], over:[] };
    for (const o of orders || []) {
      if (o.st === 'cancelled') continue;
      if (o.issue_date === iso && ['req','book','conf','build'].includes(o.st)) {
        r.nIssue++; r.issue.push(o);
      }
      if (o.return_date === iso && (o.st === 'out' || o.st === 'over')) {
        r.nRet++; r.ret.push(o);
      }
      if (o.st === 'over' && (o.return_date === iso || lateDays(o.return_date) > 0 && iso === TODAY.iso)) {
        r.nOver++; r.over.push(o);
      }
    }
    return r;
  }
  function dayBoardMarks(board){
    let h = '<div class="mcd-marks">';
    if (board.nIssue) h += '<i class="mcd-m issue"></i>';
    if (board.nRet) h += '<i class="mcd-m ret"></i>';
    if (board.nOver) h += '<i class="mcd-m over"></i>';
    return h + '</div>';
  }

  function bindSwipeX(el, handlers){
    if (!el || el.dataset.swipeBound) return;
    el.dataset.swipeBound = '1';
    let x0 = 0, y0 = 0, on = false;
    el.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      x0 = t.clientX; y0 = t.clientY; on = true;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      if (!on) return;
      on = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      if (dx < 0) handlers.next && handlers.next();
      else handlers.prev && handlers.prev();
    }, { passive: true });
  }

  function todayQueue(orders){
    const today = TODAY.iso;
    const out = [];
    for (const o of orders || []) {
      if (o.st === 'cancelled' || o.st === 'closed') continue;
      const late = lateDays(o.return_date);
      const debt = Number(o.remaining || o.debt || 0) > 0;
      if (o.st === 'over' || (o.st === 'out' && late > 0)) {
        out.push({ o, kind:'over', late, debt });
      } else if (o.issue_date === today && ['req','book','conf','build'].includes(o.st)) {
        out.push({ o, kind:'issue', late:0, debt });
      } else if (o.return_date === today && o.st === 'out') {
        out.push({ o, kind:'return', late:0, debt });
      }
    }
    const rank = { over:0, issue:1, return:2 };
    out.sort((a,b) => (rank[a.kind]-rank[b.kind]) || String(a.o.slot||'am').localeCompare(String(b.o.slot||'am')));
    return out;
  }

  function queueBucket(issueDate){
    const iso = isoDay(issueDate);
    if (!iso) return 'later';
    if (iso < TODAY.iso) return 'late';
    if (iso === TODAY.iso) return 'today';
    const tmr = new Date(TODAY.y, TODAY.m, TODAY.d + 1);
    const tmrIso = ymd(tmr.getFullYear(), tmr.getMonth(), tmr.getDate());
    if (iso === tmrIso) return 'tomorrow';
    return 'later';
  }
  const QUEUE_GROUP = { late:'Просрочено', today:'Сегодня', tomorrow:'Завтра', later:'Позже' };

  function emptyState(title, sub){
    return `<div class="empty-state"><div class="empty-title">${escapeHtml(title||'')}</div><div class="empty-sub">${escapeHtml(sub||'')}</div></div>`;
  }
  function sizeChips(sizes){
    const parts = String(sizes||'').split(/[,;/]+/).map(s=>s.trim()).filter(s => s && s !== '—');
    if (!parts.length) return '';
    return `<div class="size-chips">${parts.map(s=>`<span class="sz">${escapeHtml(s)}</span>`).join('')}</div>`;
  }
  function orderMainLabel(st, role){
    if (st === 'req') return 'В бронь';
    if (st === 'book') return 'К сборке';
    if (st === 'conf') return role === 'employee' ? 'Собираю' : 'Собирают';
    if (st === 'build') return role === 'employee' ? '' : 'Выдать';
    if (st === 'out') return role === 'employee' ? '' : 'Принять';
    return '';
  }

  const ORDER_FLOW = [
    { keys:['req'], label:'Запрос' },
    { keys:['book'], label:'Бронь' },
    { keys:['conf','build'], label:'Сборка' },
    { keys:['out'], label:'Выдача' },
    { keys:['over','closed'], label:'Возврат' },
  ];
  function flowPos(st){
    const i = ORDER_FLOW.findIndex(s => s.keys.includes(st));
    return i < 0 ? 0 : i;
  }
  function flowNow(o){
    const st = o && o.st;
    const late = lateDays(o && o.return_date);
    if (st === 'cancelled') return { title:'Отменён', sub:'заказ снят', late:false };
    if (st === 'over' || (st === 'out' && late > 0)) {
      return { title: late ? `Просрочка ${late} дн` : 'Просрочен', sub:'нужно забрать', late:true };
    }
    if (st === 'closed') return { title:'Закрыт', sub:'возвращён', late:false };
    if (st === 'out') return { title:'На руках', sub:'вернуть ' + (o.return_date || ''), late:false };
    if (st === 'build') return { title:'Собирают', sub:'к выдаче', late:false };
    if (st === 'conf') return { title:'Ждёт сборки', sub: o.assigned_to_name ? ('сборка · ' + o.assigned_to_name) : 'назначьте сборщицу', late:false };
    if (st === 'book') return { title:'Бронь', sub:'подтверждён', late:false };
    return { title:'Запрос', sub:'ещё не бронь', late:false };
  }
  function renderOrderFlow(o){
    const now = flowNow(o);
    const pos = flowPos(o.st);
    const steps = ORDER_FLOW.map((s,i) => {
      const cls = i < pos ? 'done' : (i === pos ? ('cur' + (now.late ? ' late' : '')) : '');
      return `<div class="flow-step ${cls}"><i></i><span>${s.label}</span></div>`;
    }).join('');
    return `<div class="flow${now.late?' is-late':''}">
      <div class="flow-now"><div class="flow-k">сейчас</div><div class="flow-t">${escapeHtml(now.title)}</div><div class="flow-s">${escapeHtml(now.sub)}</div></div>
      <div class="flow-rail">${steps}</div>
    </div>`;
  }

  const ROOMS = [
    { id:'1', name:'Комната 1', sub:'3 стеллажа', kind:'racks' },
    { id:'2', name:'Комната 2', sub:'3 стеллажа', kind:'racks' },
    { id:'3', name:'Комната 3', sub:'3 стеллажа', kind:'racks' },
    { id:'S', name:'Склад', sub:'коробки', kind:'boxes' },
  ];
  const RACKS = ['А','Б','В'];
  const SIDES = { П:'перед', З:'зад' };
  const LINE_COUNT = 6;
  const BOX_COUNT = 12;
  const LEGACY_SHELF = { A:['1','А'], B:['1','Б'], C:['1','В'], D:['2','А'] };

  let BINS = [];
  function setBins(list){ BINS = Array.isArray(list) ? list : []; }
  function binsFor(roomId){
    return BINS.filter(b => String(b.room_id || b.room) === String(roomId));
  }
  function binById(id){ return BINS.find(b => b.id === id) || null; }
  function formatSlot(room, rack, side, line){
    return String(room) + String(rack) + '-' + String(side) + String(line);
  }
  function formatBox(n){ return 'S-' + Number(n); }
  function formatBin(room, id){ return String(room) + 'Y-' + id; }

  function parseSlot(loc){
    const s = String(loc || '').trim();
    if (!s) return null;
    let m = s.match(/^([123S])Y-([0-9a-f-]{8,36})$/i);
    if (m) {
      return { room: m[1], kind: 'bin', bin: m[2], code: m[1] + 'Y-' + m[2] };
    }
    m = s.match(/^S-?(\d{1,2})$/i);
    if (m) {
      const n = Math.min(BOX_COUNT, Math.max(1, Number(m[1]) || 1));
      return { room: 'S', kind: 'box', box: n, code: formatBox(n) };
    }
    m = s.match(/^([123])([АAБBВV])-([ПпPЗзZ])(\d{1,2})$/);
    if (m) {
      const rack = { А:'А', A:'А', Б:'Б', B:'Б', В:'В', V:'В' }[m[2]] || m[2];
      const side = /[ЗзZ]/.test(m[3]) ? 'З' : 'П';
      const line = Math.min(LINE_COUNT, Math.max(1, Number(m[4]) || 1));
      return { room: m[1], kind: 'rail', rack, side, line, code: formatSlot(m[1], rack, side, line) };
    }
    m = s.match(/полка\s*([ABCD])\s*(\d)/i);
    if (m) {
      const pair = LEGACY_SHELF[m[1].toUpperCase()];
      if (pair) {
        const line = Math.min(LINE_COUNT, Math.max(1, Number(m[2]) || 1));
        return { room: pair[0], kind: 'rail', rack: pair[1], side: 'П', line, code: formatSlot(pair[0], pair[1], 'П', line) };
      }
    }
    return null;
  }
  function slotLabel(loc){
    const p = typeof loc === 'object' && loc && loc.room ? loc : parseSlot(loc);
    if (!p) return String(loc || '').trim();
    if (p.kind === 'box') return 'склад · коробка ' + p.box;
    if (p.kind === 'bin') {
      const b = binById(p.bin);
      const roomName = p.room === 'S' ? 'склад' : ('комн. ' + p.room);
      return roomName + ' · ' + (b ? b.name : 'ящик');
    }
    return 'комн. ' + p.room + ' · ' + p.rack + ' · ' + SIDES[p.side] + ' · ' + p.line;
  }
  function slotOccupancy(list){
    const by = {};
    const loose = [];
    for (const c of list || []) {
      const p = parseSlot(c.location);
      if (!p) { loose.push(c); continue; }
      if (!by[p.code]) by[p.code] = [];
      by[p.code].push(c);
    }
    return { by, loose };
  }
  function roomFill(list, roomId){
    let n = 0;
    for (const c of list || []) {
      const p = parseSlot(c.location);
      if (p && String(p.room) === String(roomId)) n++;
    }
    return n;
  }
  function bayFill(occ, room, rack, side){
    let n = 0;
    for (let line = 1; line <= LINE_COUNT; line++) {
      const code = formatSlot(room, rack, side, line);
      n += (occ.by[code] || []).length;
    }
    return n;
  }
  function forgetMissingBins(items){
    for (const c of items || []) {
      const p = parseSlot(c.location);
      if (p && p.kind === 'bin' && !binById(p.bin)) c.location = '';
    }
  }
  function renderRoomPlan(room, occ){
    const face = (rack, side, cls) => {
      const n = bayFill(occ, room, rack, side);
      return `<button type="button" class="rp-face ${cls||''}${n?' has':''}" data-rk="${rack}" data-sd="${side}">
        <span class="rp-face-l">${SIDES[side]}</span>
        <span class="rp-face-n">${n ? n + ' шт' : 'пусто'}</span>
      </button>`;
    };
    return `<div class="room-plan">
      <div class="rp-cap rp-door">вход</div>
      <div class="rp-rack rp-h"><div class="rp-tag">А</div>${face('А','П')}${face('А','З')}</div>
      <div class="rp-body">
        <div class="rp-rack rp-v"><div class="rp-tag">Б</div><div class="rp-v-faces">${face('Б','П','rp-v')}${face('Б','З','rp-v')}</div></div>
        <div class="rp-aisle"><i></i>проход<i></i></div>
        <div class="rp-rack rp-v"><div class="rp-tag">В</div><div class="rp-v-faces">${face('В','П','rp-v')}${face('В','З','rp-v')}</div></div>
      </div>
    </div>`;
  }

  function renderBinsBlock(roomId, occ){
    const bins = binsFor(roomId);
    if (!bins.length) return '';
    return '<div class="bin-grid locp-bins">' + bins.map(b => {
      const code = formatBin(roomId, b.id);
      const n = (occ.by[code] || []).length;
      return `<button type="button" class="bin-card${n?' has':''}" data-slot="${escapeHtml(code)}">
        <div class="bin-lid"></div><div class="bin-n">${escapeHtml(b.name)}</div>
        <div class="bin-s">${n ? n + ' шт' : 'пусто'}</div></button>`;
    }).join('') + '</div>';
  }
  async function bindBinActions(api, roomId){
    const ans = await promptText({ title: 'Новый ящик', placeholder: 'Пуговицы, нитки…', ok: 'Добавить' });
    if (ans == null) return false;
    const name = String(ans || '').trim();
    if (!name) return false;
    const created = await api.Bins.create({ room_id: roomId, name });
    if (created) BINS.push(created);
    return true;
  }

  function openLocPicker(opts){
    opts = opts || {};
    const items = opts.items || [];
    const occ = slotOccupancy(items);
    let room = '1', rack = 'А', side = 'П', line = 1;
    const cur = parseSlot(opts.current);
    if (cur) {
      room = String(cur.room || '1');
      if (cur.kind === 'rail') { rack = cur.rack; side = cur.side; line = cur.line; }
    }
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal-card"><div class="modal-hd"><h3>Где лежит</h3><button class="modal-cls" type="button">×</button></div>
      <div class="modal-body" id="locpBody"></div>
      <div class="modal-ft"><button class="btn ghost" data-loc-clear>Без места</button><button class="btn" data-loc-ok>Сохранить</button></div></div>`;
    document.body.appendChild(bg);
    const body = bg.querySelector('#locpBody');
    const paint = () => {
      const roomMeta = ROOMS.find(r => r.id === room) || ROOMS[0];
      const tabs = ROOMS.map(r => `<button type="button" class="locp-tab${r.id===room?' on':''}" data-rm="${r.id}">${escapeHtml(r.name)}</button>`).join('');
      if (roomMeta.kind === 'boxes') {
        let boxes = '';
        for (let i = 1; i <= BOX_COUNT; i++) {
          const code = formatBox(i);
          const n = (occ.by[code] || []).length;
          boxes += `<button type="button" class="box-card${n?' has':''}${opts.current===code?' on':''}" data-slot="${code}"><div class="box-lid"></div><div class="box-n">${i}</div><div class="box-s">${n?n+' шт':'пусто'}</div></button>`;
        }
        body.innerHTML = `<div class="locp-tabs">${tabs}</div><div class="box-grid">${boxes}</div>`;
      } else {
        const racks = RACKS.map(rk => `<button type="button" class="locp-tab${rk===rack?' on':''}" data-rk="${rk}">${rk}</button>`).join('');
        const sides = Object.keys(SIDES).map(sd => `<button type="button" class="locp-tab${sd===side?' on':''}" data-sd="${sd}">${SIDES[sd]}</button>`).join('');
        let lines = '';
        for (let i = 1; i <= LINE_COUNT; i++) {
          const code = formatSlot(room, rack, side, i);
          const n = (occ.by[code] || []).length;
          lines += `<button type="button" class="locp-ln${n?' has':''}${i===line?' on':''}" data-ln="${i}">${i}${n?`<i>${n}</i>`:''}</button>`;
        }
        body.innerHTML = `<div class="locp-tabs">${tabs}</div>
          <div class="locp-row"><span class="locp-k">Стеллаж</span><div class="locp-tabs">${racks}</div></div>
          <div class="locp-row"><span class="locp-k">Сторона</span><div class="locp-tabs">${sides}</div></div>
          <div class="locp-row"><span class="locp-k">Линия</span><div class="locp-lines">${lines}</div></div>`;
      }
    };
    paint();
    const close = (code) => { bg.remove(); if (opts.onPick) opts.onPick(code); };
    bg.addEventListener('click', e => {
      if (e.target === bg || e.target.closest('.modal-cls')) { close(undefined); return; }
      if (e.target.closest('[data-loc-clear]')) { close(''); return; }
      if (e.target.closest('[data-loc-ok]')) {
        const roomMeta = ROOMS.find(r => r.id === room);
        if (roomMeta && roomMeta.kind === 'boxes') close(formatBox(line));
        else close(formatSlot(room, rack, side, line));
        return;
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) { room = rm.dataset.rm; paint(); return; }
      const rk = e.target.closest('[data-rk]');
      if (rk) { rack = rk.dataset.rk; paint(); return; }
      const sd = e.target.closest('[data-sd]');
      if (sd) { side = sd.dataset.sd; paint(); return; }
      const ln = e.target.closest('[data-ln]');
      if (ln) { line = +ln.dataset.ln; paint(); return; }
      const slot = e.target.closest('[data-slot]');
      if (slot) { close(slot.dataset.slot); }
    });
  }

  function parseAddresses(c){
    if (!c) return [];
    const out = [];
    const seen = new Set();
    const add = (s) => {
      const v = String(s || '').trim();
      if (!v) return;
      const k = v.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(v);
    };
    if (Array.isArray(c.addresses)) c.addresses.forEach(add);
    else if (typeof c.addresses === 'string' && c.addresses) {
      try {
        const parsed = JSON.parse(c.addresses);
        if (Array.isArray(parsed)) parsed.forEach(add);
        else add(c.addresses);
      } catch { add(c.addresses); }
    }
    add(c.address);
    add(c.addr);
    return out;
  }
  function orderAddr(o){
    if (!o) return '';
    return String(o.delivery_addr || o.client_address || (o.del && o.del.addr) || o.addr || '').trim();
  }
  function shortAddr(s, n){
    s = String(s || '').trim();
    n = n || 28;
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function copyRideText(o){
    const addr = typeof o === 'string' ? o : orderAddr(o);
    const phone = (o && (o.phone || o.client_phone)) || '';
    const name = (o && (o.cl || o.client_name || o.name)) || '';
    return [name, phone, addr].filter(Boolean).join('\n');
  }
  function mapsUrls(addr){
    const q = encodeURIComponent(addr || '');
    return {
      apple: 'https://maps.apple.com/?q=' + q,
      google: 'https://www.google.com/maps/search/?api=1&query=' + q,
      yandex: 'https://yandex.ru/maps/?text=' + q,
      yandexgo: 'https://3.redirect.appmetrica.yandex.com/route?end-address=' + q + '&tariffClass=econom',
    };
  }
  function openExtLink(url){
    const tg = global.Telegram && global.Telegram.WebApp;
    if (tg && typeof tg.openLink === 'function') {
      try { tg.openLink(url); return; } catch (e) {}
    }
    global.open(url, '_blank', 'noopener');
  }
  function locPinHtml(addr, opts){
    opts = opts || {};
    addr = String(addr || '').trim();
    if (!addr) return '';
    const payload = escapeHtml(JSON.stringify({
      addr, phone: opts.phone || '', name: opts.name || '', oid: opts.oid || '',
    }));
    return `<button type="button" class="loc-pin ${opts.cls||''}" data-loc="${payload}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/></svg>
      <em>${escapeHtml(shortAddr(addr, opts.short || 28))}</em>
    </button>`;
  }
  function openLocSheet(data){
    data = data || {};
    const addr = String(data.addr || '').trim();
    if (!addr) return;
    const phone = String(data.phone || '').trim();
    const urls = mapsUrls(addr);
    const bg = document.createElement('div');
    bg.className = 'loc-sheet-bg';
    bg.innerHTML = `<div class="loc-sheet" role="dialog" aria-modal="true">
      <div class="loc-sheet-grab"></div>
      <div class="loc-sheet-hd">Открыть с помощью</div>
      <div class="loc-sheet-preview">${escapeHtml(addr)}${phone ? '<br>' + escapeHtml(phone) : ''}</div>
      <div class="loc-apps">
        <button type="button" class="loc-app" data-map="apple"><i class="la">A</i><span>Карты</span></button>
        <button type="button" class="loc-app" data-map="google"><i class="lg">G</i><span>Google</span></button>
        <button type="button" class="loc-app" data-map="yandex"><i class="ly">Я</i><span>Яндекс</span></button>
        <button type="button" class="loc-app" data-map="yandexgo"><i class="lgo">Go</i><span>Яндекс Go</span></button>
      </div>
      <button type="button" class="loc-sheet-btn" data-copy>Скопировать адрес и телефон</button>
      <button type="button" class="loc-sheet-btn close" data-close>Отмена</button>
    </div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener('click', async e => {
      if (e.target === bg || e.target.closest('[data-close]')) { close(); return; }
      const app = e.target.closest('[data-map]');
      if (app) { openExtLink(urls[app.dataset.map]); close(); return; }
      if (e.target.closest('[data-copy]')) {
        const text = [data.name, phone, addr].filter(Boolean).join('\n');
        try { await navigator.clipboard.writeText(text); } catch (err) {}
        close();
      }
    });
  }
  function renderAddrPick(el, client, current, onPick){
    if (!el) return;
    if (!client) { el.innerHTML = ''; return; }
    const list = parseAddresses(client);
    const cur = String(current || '').trim();
    const chips = list.map(a => `<button type="button" class="addr-chip${a===cur?' on':''}" data-addr="${escapeHtml(a)}">${escapeHtml(shortAddr(a, 32))}</button>`).join('');
    el.innerHTML = `<div class="addr-chips">${chips}<button type="button" class="addr-chip ghost" data-addr-new>+ адрес</button></div>
      <div class="addr-new"><input class="no-inp" data-addr-inp placeholder="улица, дом, ориентир" maxlength="200"></div>`;
    el.onclick = (e) => {
      const neu = e.target.closest('[data-addr-new]');
      if (neu) {
        const box = el.querySelector('.addr-new');
        box.classList.add('on');
        el.querySelector('[data-addr-inp]')?.focus();
        return;
      }
      const chip = e.target.closest('[data-addr]');
      if (chip && onPick) onPick(chip.dataset.addr);
    };
    el.querySelector('[data-addr-inp]')?.addEventListener('change', e => {
      const v = e.target.value.trim();
      if (v && onPick) onPick(v);
    });
  }
  function openClientChat({ telegram, phone } = {}){
    const tg = String(telegram || '').replace(/^@/, '').trim();
    if (tg) { openExtLink('https://t.me/' + encodeURIComponent(tg)); return true; }
    const ph = String(phone || '').replace(/[^\d+]/g, '');
    if (ph) { openExtLink('https://t.me/+' + ph.replace(/^\+/, '')); return true; }
    return false;
  }

  document.addEventListener('click', e => {
    const pin = e.target.closest('.loc-pin');
    if (!pin) return;
    e.preventDefault();
    e.stopPropagation();
    let data = {};
    try { data = JSON.parse(pin.getAttribute('data-loc') || '{}'); } catch (err) {}
    openLocSheet(data);
  }, true);

  global.K = {
    TODAY, MONTHS, MONTHS_GEN, MONTHS_PREP, MONTHS_SHORT, DOW_RU, DOW_SHORT_MON_FIRST,
    fmtDateRu, fmtDateShortRu, fmtTodayLong,
    buildMonthGrid,
    fmtMoney, plural, pluralDays, pluralOrders, pluralItems,
    escapeHtml, cssEscape, nextOrderId,
    confirmDialog, promptText, trapFocus,
    slugType, uniqueType, findSameName,
    queueBucket, QUEUE_GROUP, emptyState, sizeChips, orderMainLabel,
    ymd, isoDay, dayBoard, dayBoardMarks, bindSwipeX, lateDays, todayQueue,
    ROOMS, RACKS, SIDES, LINE_COUNT, BOX_COUNT,
    parseSlot, formatSlot, formatBox, formatBin, slotLabel, slotOccupancy, roomFill, bayFill,
    renderRoomPlan, openLocPicker,
    setBins, binsFor, binById, renderBinsBlock, bindBinActions, forgetMissingBins,
    parseAddresses, orderAddr, shortAddr, copyRideText, mapsUrls, openExtLink,
    locPinHtml, openLocSheet, renderAddrPick, openClientChat,
    ORDER_FLOW, flowPos, flowNow, renderOrderFlow,
  };
})(window);
