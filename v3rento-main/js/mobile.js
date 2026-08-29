/* ============================================================
   Костюмерная — МОБАЙЛ · вкладки и данные
   ============================================================ */

// ===== Telegram Mini App: инициализация + безопасные зоны =====
// В Телеграме плавающие кнопки (Закрыть / ⌄ …) перекрывают верх вебвью. Читаем
// инсеты из WebApp API и дублируем их в CSS-переменные на :root.
// telegram-web-app.js создаёт window.Telegram.WebApp ДАЖЕ вне Телеграма и может
// выставить CSS-переменные → без проверки initData/platform сверху остаётся
// дыра ~88px на каждой странице. Вне Mini App инсеты принудительно 0.
(function initTelegramWebApp(){
  const tg = window.Telegram && window.Telegram.WebApp;
  const root = document.documentElement;
  const setVar = (name, px) => root.style.setProperty(name, (Number(px) || 0) + 'px');
  const inTelegram = !!(tg && (tg.initData || (tg.platform && tg.platform !== 'unknown')));
  if (!inTelegram) {
    root.classList.remove('in-telegram');
    ['--tg-safe-area-inset-top','--tg-safe-area-inset-right','--tg-safe-area-inset-bottom','--tg-safe-area-inset-left',
     '--tg-content-safe-area-inset-top','--tg-content-safe-area-inset-right','--tg-content-safe-area-inset-bottom','--tg-content-safe-area-inset-left'
    ].forEach((n) => setVar(n, 0));
    return;
  }
  root.classList.add('in-telegram');
  try { tg.ready(); } catch (e) {}
  try { tg.expand(); } catch (e) {}
  function applyInsets(){
    const sa = tg.safeAreaInset || {};
    const csa = tg.contentSafeAreaInset || {};
    setVar('--tg-safe-area-inset-top', sa.top);
    setVar('--tg-safe-area-inset-right', sa.right);
    setVar('--tg-safe-area-inset-bottom', sa.bottom);
    setVar('--tg-safe-area-inset-left', sa.left);
    const csaTop = Number(csa.top) || 0;
    // Если API не дал content-inset — запас под кнопку «Закрыть», не 88px.
    setVar('--tg-content-safe-area-inset-top', csaTop || 48);
    setVar('--tg-content-safe-area-inset-right', csa.right);
    setVar('--tg-content-safe-area-inset-bottom', csa.bottom);
    setVar('--tg-content-safe-area-inset-left', csa.left);
  }
  try {
    tg.onEvent('safeAreaChanged', applyInsets);
    tg.onEvent('contentSafeAreaChanged', applyInsets);
  } catch (e) {}
  applyInsets();
})();

// хедеры по вкладкам (home обрабатывается через #homeTop)
const headers={
  orders:  `<h2>Заказы</h2>`,
  wh:      `<h2>Склад</h2><button class="icon-sm" id="whAddBtn" type="button" aria-label="Добавить костюм"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button><button class="icon-sm" id="whSearchBtn" type="button" aria-label="Поиск"><svg width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg></button>`,
  whPick:  `<button class="back-sm" id="whPickBack" type="button" aria-label="Назад">‹</button><h2>Выберите</h2><span class="wh-hd-n" id="pickCountHd">0</span>`,
  order:   `<button class="back-sm" data-back="orders">‹</button><h2>Заказ</h2><div class="icon-sm">⋯</div>`,
  more:    `<h2>Ещё</h2>`,
  clients: `<button class="back-sm" data-back="more">‹</button><h2>Клиенты</h2><div class="icon-sm"><svg width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg></div>`,
  money:     `<button class="back-sm" data-back="more">‹</button><h2>Деньги</h2>`,
  finance:   `<button class="back-sm" data-back="money">‹</button><h2>Финансы</h2>`,
  'new-order':`<button class="back-sm" data-back="home">‹</button><h2>Новый заказ</h2>`,
  cal:       `<button class="back-sm" data-back="more">‹</button><h2>Календарь</h2>`,
  tg:        `<button class="back-sm" data-back="more">‹</button><h2>Telegram</h2>`,
  team:      `<button class="back-sm" data-back="more">‹</button><h2>Команда</h2>`,
  mine:      `<button class="back-sm" data-back="more">‹</button><h2>Мои заказы</h2>`,
  settings:  `<button class="back-sm" data-back="more">‹</button><h2>Настройки</h2>`,
  profile:   `<button class="back-sm" data-back="more">‹</button><h2>Профиль</h2>`,
  client:    `<button class="back-sm" data-back="clients">‹</button><h2>Клиент</h2>`,
  costume:   `<button class="back-sm" data-back="wh">‹</button><h2>Костюм</h2>`,
  rooms:     `<button class="back-sm" data-back="more">‹</button><h2>Комнаты</h2>`,
};
// какие вкладки не основные (подсветка нижнего меню ведёт к родителю)
const PARENT={order:'orders',clients:'more',money:'more',finance:'money','new-order':'home',cal:'more',tg:'more',team:'more',mine:'more',settings:'more',profile:'more',client:'more',costume:'wh',rooms:'more'};
let roomsFrom='more';
let roomsView={room:null,rack:null,side:null};

// Аватар текущего пользователя. Шапки вкладок (напр. «Ещё») генерятся из статичных
// шаблонов с демо-«МК», поэтому храним реальные инициалы/градиент и подставляем их
// в аватар appbar при каждом рендере шапки (init заполняет это после загрузки me).
let userAv={text:'',gradient:''};
let pickMode=false;

function setTab(t){
  // вид
  document.querySelectorAll('.tab-view').forEach(v=>v.classList.remove('active'));
  const view=document.getElementById('t-'+t);
  if(view)view.classList.add('active');
  // home-top vs обычный appbar
  const homeTop=document.getElementById('homeTop');
  const appbar=document.getElementById('appbar');
  if(t==='home'){
    homeTop.classList.add('active');
    appbar.style.display='none';
  } else {
    homeTop.classList.remove('active');
    appbar.style.display='';
    appbar.innerHTML=(t==='wh' && pickMode ? headers.whPick : headers[t])||`<h2>${t}</h2>`;
    // Аватар в шапке приходит из статичного шаблона с демо-«МК» — красим реальным юзером
    const av=appbar.querySelector('.av-btn');
    if(av && userAv.text){
      av.textContent=userAv.text;
      if(userAv.gradient)av.style.background=`linear-gradient(135deg,${userAv.gradient})`;
    }
  }
  // подсветка нижнего меню + aria-pressed
  const bt=(t==='rooms' && roomsFrom==='wh')?'wh':(PARENT[t]||t);
  document.querySelectorAll('.tab').forEach(x=>{
    const on=x.dataset.tab===bt;
    x.classList.toggle('on',on);
    x.setAttribute('aria-pressed', on?'true':'false');
  });
  document.getElementById('scroll').scrollTop=0;
  // кнопка «назад» в хедере
  const back=document.querySelector('[data-back]');
  if(back)back.onclick=()=>setTab(back.dataset.back);
  if(t==='mine')renderMMine();
  if(t==='rooms')renderRooms();
  if(t==='wh'){
    if(pickMode) renderWhForPick();
    else hideWhPick();
    bindWhHeader();
    applyWhFilter();
  }else{
    hideWhPick();
    if(t!=='new-order') pickMode=false;
  }
}

// ===== «Мои заказы» (мобайл) — очередь сборки =====
async function renderMMine(){
  const list=document.getElementById('mMineList');
  if(!list)return;
  list.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:13px">Загрузка…</div>';
  let mine=[];
  try{ mine=await API.Orders.mine(); }
  catch(e){ list.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:13px">Не удалось загрузить</div>'; return; }
  mine.sort((a,b)=>String(a.issue_date||'').localeCompare(String(b.issue_date||'')));
  if(!mine.length){ list.innerHTML='<div style="text-align:center;padding:24px;color:var(--ink-3);font-size:13px">На вас пока не назначено заказов</div>'; return; }
  list.innerHTML=mine.map(o=>{
    const asm=API.calc.assemblyStatus(o);
    const clr={assembled:'var(--green)',incomplete:'var(--red)',progress:'var(--gold)',none:'var(--ink-3)'}[asm.kind];
    const badge=asm.kind==='assembled'?'✓ собрано':asm.kind==='incomplete'?'⚠ неполный':(asm.total?`${asm.done} из ${asm.total}`:'—');
    return `<div class="card blk" data-mine-oid="${K.escapeHtml(o.id)}" style="cursor:pointer;display:flex;align-items:center;gap:11px;margin-bottom:10px">
      <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(o.g)})">${K.escapeHtml(o.av)}</div>
      <div style="flex:1;min-width:0"><div class="nm" style="font-weight:600">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.cl)}</div><div style="font-size:11.5px;color:var(--ink-3)">${K.escapeHtml(o.dates||'')} · ${K.escapeHtml(o.slotL||'Утро')} · ${K.escapeHtml(o.stl)}</div></div>
      <div style="text-align:right;font-weight:700;color:${clr};font-size:12.5px">${badge}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-mine-oid]').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.mineOid)));
}
document.querySelectorAll('.tab[data-tab]').forEach(t=>t.onclick=()=>setTab(t.dataset.tab));
// FAB → новый заказ
document.querySelector('.fab').onclick=()=>setTab('new-order');

// фильтры для других .filt (не #t-orders) — фильтр заказов подключим ниже
document.querySelectorAll('#t-wh .filt').forEach(f=>f.querySelectorAll('.fchip').forEach(c=>c.onclick=()=>{
  f.querySelectorAll('.fchip').forEach(x=>x.classList.remove('on'));c.classList.add('on');
}));

// ===== Список заказов =====
const orders=[];
function renderMOrders(){
  const e=K.escapeHtml;
  const list=document.getElementById('ordersList');
  if(!list)return;
  list.innerHTML=orders.map(o=>{
    const types=o.items&&o.items.length?o.items:(o.lines||[]).map(l=>l.t).filter(Boolean);
    const thumbs=types.slice(0,4).map(it=>it==='+6'||String(it).startsWith('+')?`<span class="more">${e(it)}</span>`:`<span class="ts">${costumeSVG(it)}</span>`).join('');
    const extra=types.length>4?`<span class="more">+${types.length-4}</span>`:'';
    const addr=K.orderAddr(o);
    const debt=Number(o.remaining)>0||Number(o.debt)>0||o.danger;
    return `<div class="card ord${addr?' has-loc':''}" data-oid="${e(o.id)}" tabindex="0" role="button" aria-label="Заказ №${e(o.id)} от ${e(o.cl)}"${debt?' style="border:1px solid #f0c9c4;background:var(--red-soft)"':''}>
      <div class="ord-top"><div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(o.g||'#8EB69B,#5E8475')})">${e(o.av||'?')}</div><div style="flex:1;min-width:0"><div class="nm">${e(o.cl)}</div><div class="id">Заказ №${e(o.id)}</div>${addr?K.locPinHtml(addr,{phone:o.phone,name:o.cl,oid:o.id,cls:'quiet',short:26}):''}</div><span class="st ${e(o.st)}">${e(o.stl)}</span></div>
      <div class="ord-body"><div class="thumbs">${thumbs}${extra}</div><div class="ord-meta"><div class="dt"${o.st==='over'?' style="color:var(--red);font-weight:600"':''}>${e(o.dt||'')}${o.slotL?` · ${e(o.slotL)}`:''}</div><div class="sm">${e(o.sm||'')}</div></div></div>
    </div>`;
  }).join('');
  applyOrdersFilter();
}
// Делегированный клик — переживает перерендер
document.getElementById('ordersList').addEventListener('click',e=>{
  const card=e.target.closest('.ord');
  if(card)openOrder(card.dataset.oid);
});
document.getElementById('ordersList').addEventListener('keydown',e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const card=e.target.closest('.ord');
  if(card){ e.preventDefault(); openOrder(card.dataset.oid); }
});
let ordFlt='all',ordQry='';
function applyOrdersFilter(){
  const today=K.TODAY.iso;
  let n=0;
  document.querySelectorAll('#ordersList .ord').forEach(el=>{
    const o=orders.find(x=>String(x.id)===String(el.dataset.oid));
    if(!o){el.style.display='none';return;}
    const text=(o.id+' '+o.cl+' '+(o.lines||[]).map(l=>l.name).join(' ')).toLowerCase();
    let pass=true;
    if(ordFlt==='active')pass=['book','conf','build','out','over','req'].includes(o.st);
    else if(ordFlt==='today')pass=o.issue_date===today||o.return_date===today||o.st==='over';
    else if(ordFlt==='over')pass=o.st==='over';
    else if(ordFlt==='debt')pass=o.danger||o.st==='over'||Number(o.remaining)>0||Number(o.debt)>0;
    if(pass && ordQry)pass=text.includes(ordQry);
    el.style.display=pass?'':'none';
    if(pass)n++;
  });
  const empty=document.getElementById('ordersEmpty');
  if(empty) empty.style.display=n?'none':'';
}
renderMOrders();
document.querySelectorAll('#t-orders .fchip').forEach(c=>c.onclick=()=>{
  document.querySelectorAll('#t-orders .fchip').forEach(x=>x.classList.remove('on'));
  c.classList.add('on');ordFlt=c.dataset.flt;applyOrdersFilter();
});
document.getElementById('ordSearch').addEventListener('input',e=>{
  ordQry=e.target.value.trim().toLowerCase();applyOrdersFilter();
});
document.getElementById('ordSwitch')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-ov]');
  if(!btn)return;
  document.querySelectorAll('#ordSwitch .ovt').forEach(x=>x.classList.toggle('on',x===btn));
  const all=btn.dataset.ov==='all';
  const dayPane=document.getElementById('ordDayPane');
  const allPane=document.getElementById('ordAllPane');
  if(dayPane) dayPane.hidden=all;
  if(allPane) allPane.hidden=!all;
  if(all) renderMOrders();
});

// календарь на странице заказов — навигация по месяцам + клик по дню
const MONTHS=K.MONTHS;
const MONTHS_GEN=K.MONTHS_GEN;
let mCalY=K.TODAY.y, mCalM=K.TODAY.m;
let mCalSelDay=K.TODAY.d;
const TODAY=K.TODAY;
// Буфер заказов для месяцев, НЕ покрытых загруженным orders[] (последние 200).
// Заполняется при навигации мини-календаря через /calendar, чтобы события
// показывались и для старых/будущих месяцев, а не только для загруженных.
let mOrdMonthEvs=[];
async function loadOrdMiniMonth(y,m){
  // Текущий месяц уже покрыт массивом orders[] — буфер не нужен.
  if(y===K.TODAY.y&&m===K.TODAY.m){mOrdMonthEvs=[];return;}
  try{
    const r=await API.api(`/calendar?year=${y}&month=${m+1}`);
    mOrdMonthEvs=(r.items||[]).map(o=>({
      id:String(o.number), uuid:o.id,
      cl:o.client_name||'Без клиента',
      av:(o.client_name||'?').split(' ').map(s=>s[0]||'').join('').slice(0,2).toUpperCase()||'З',
      g:'#8EB69B,#5E8475',
      st:o.status, stl:API.STATUS_LABEL[o.status]||o.status,
      issue_date:o.issue_date, return_date:o.return_date,
      dt:API.fmt.dateRange(o.issue_date,o.return_date),
    }));
  }catch(_){ mOrdMonthEvs=[]; mToast('Не удалось загрузить месяц','!'); }
}
// Заказы на конкретный день: orders[] (богатые) + буфер месяца (дедуп по id).
function ordersOnDay(y,m,d){
  const target = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const hit=o=>o.issue_date&&o.return_date&&o.issue_date<=target&&o.return_date>=target;
  const out=orders.filter(hit);
  const seen=new Set(out.map(o=>o.id));
  for(const o of mOrdMonthEvs){ if(!seen.has(o.id)&&hit(o)) out.push(o); }
  return out;
}
// Открытие заказа из мини-календаря: если заказа нет в orders[] (далёкий
// месяц из буфера) — догружаем полную карточку по uuid, затем открываем.
async function openOrderEvent(id){
  if(orders.find(x=>x.id===String(id))) return openOrder(id);
  const ev=mOrdMonthEvs.find(x=>x.id===String(id));
  if(ev?.uuid){
    try{ const full=await API.Orders.one(ev.uuid); full.id=String(ev.id); orders.push(full); openOrder(full.id); }
    catch(_){ mToast('Не удалось открыть заказ','!'); }
    return;
  }
  openOrder(id);
}

// Цвета точек/индикаторов по статусу
const ST_COLOR = {
  req:   'var(--gold)',
  book:  'var(--gold)',
  conf:  'var(--teal)',
  build: 'var(--primary)',
  out:   'var(--green)',
  over:  'var(--red)',
  closed:'var(--ink-3)',
  cancelled:'var(--ink-3)',
};

function renderMOrdMiniCal(){
  const cells=K.buildMonthGrid(mCalY,mCalM);
  document.getElementById('mCalTitle').textContent=`${MONTHS[mCalM]} ${mCalY}`;
  // Шапка с днями недели — выходные (Сб, Вс) выделяем
  let h='<div class="mcal-mini-head">'+
    K.DOW_SHORT_MON_FIRST.map((d,i)=>`<div class="mcal-mini-dn${i>=5?' wknd':''}">${d}</div>`).join('')+'</div>';
  h+='<div class="mcal-mini-grid">';
  cells.forEach((cell,i)=>{
    const {d,inMonth,isToday}=cell;
    const isWknd = i%7 >= 5;
    const isSun  = i%7 === 6;
    const sel=inMonth&&d===mCalSelDay;
    const evs=inMonth?ordersOnDay(mCalY,mCalM,d):[];
    const iso=inMonth?K.ymd(mCalY,mCalM,d):'';
    const board=iso?K.dayBoard(orders.concat(mOrdMonthEvs),iso):{nIssue:0,nRet:0,nOver:0};

    let cls='mcal-mini-d';
    if(!inMonth)         cls+=' other';
    if(isToday)          cls+=' today';
    if(sel)              cls+=' sel';
    if(isWknd && inMonth)cls+=' wknd';
    if(isSun  && inMonth)cls+=' sun';

    h+=`<div ${inMonth?`data-mcd="${d}"`:''} class="${cls}">
      <span class="mcd-num">${inMonth?d:''}</span>
      ${inMonth?K.dayBoardMarks(board):'<div class="mcd-marks"></div>'}
    </div>`;
  });
  h+='</div>';
  document.getElementById('mOrdMiniCal').innerHTML=h;
  document.querySelectorAll('#mOrdMiniCal [data-mcd]').forEach(el=>el.addEventListener('click',()=>{
    mCalSelDay=+el.dataset.mcd;
    renderMOrdMiniCal();
    renderMOrdNear();
  }));
}
document.getElementById('mCalPrev').addEventListener('click',async()=>{
  mCalM--;if(mCalM<0){mCalM=11;mCalY--;}
  mCalSelDay=null;
  await loadOrdMiniMonth(mCalY,mCalM);
  renderMOrdMiniCal();renderMOrdNear();
});
document.getElementById('mCalNext').addEventListener('click',async()=>{
  mCalM++;if(mCalM>11){mCalM=0;mCalY++;}
  mCalSelDay=null;
  await loadOrdMiniMonth(mCalY,mCalM);
  renderMOrdMiniCal();renderMOrdNear();
});
document.getElementById('mCalToday')?.addEventListener('click',async()=>{
  mCalY=K.TODAY.y; mCalM=K.TODAY.m; mCalSelDay=K.TODAY.d;
  await loadOrdMiniMonth(mCalY,mCalM);
  renderMOrdMiniCal();renderMOrdNear();
});
K.bindSwipeX(document.getElementById('mOrdMiniCal'),{
  prev: async()=>{ mCalM--;if(mCalM<0){mCalM=11;mCalY--;} mCalSelDay=null; await loadOrdMiniMonth(mCalY,mCalM); renderMOrdMiniCal();renderMOrdNear(); },
  next: async()=>{ mCalM++;if(mCalM>11){mCalM=0;mCalY++;} mCalSelDay=null; await loadOrdMiniMonth(mCalY,mCalM); renderMOrdMiniCal();renderMOrdNear(); },
});
renderMOrdMiniCal();

// нижний блок: либо «Ближайшие активные» (когда нет выбранной даты), либо заказы на выбранный день
function renderMOrdNear(){
  const host=document.getElementById('mOrdNearList');
  const titleEl=document.getElementById('mOrdNearTitle');
  const metaEl=document.getElementById('mOrdNearMeta');
  if(!host)return;
  let title, meta, rows=[];
  if(mCalSelDay){
    const iso=K.ymd(mCalY,mCalM,mCalSelDay);
    const board=K.dayBoard(orders.concat(mOrdMonthEvs), iso);
    title=`${mCalSelDay} ${MONTHS_GEN[mCalM]}`;
    const n=board.nIssue+board.nRet+board.nOver;
    meta=n?`${n} ${K.pluralOrders(n)}`:'нет заказов';
    const block=(arr,kind,label)=>{
      if(!arr.length)return;
      rows.push(`<div class="mnear-k">${label}</div>`);
      arr.forEach(o=>{
        const addr=K.orderAddr(o);
        const names=(o.lines||[]).map(l=>l.name).filter(Boolean).join(', ')||o.dt||'';
        rows.push(`<div class="mnear-row" data-mnear="${K.escapeHtml(o.id)}">
          <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(o.g||'#8EB69B,#5E8475')})">${K.escapeHtml(o.av||'?')}</div>
          <div class="mnear-main"><div class="nm">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.cl)}</div>
          <div class="ds">${K.escapeHtml(names)}${o.slotL?` · ${K.escapeHtml(o.slotL)}`:''}</div>
          ${addr?K.locPinHtml(addr,{phone:o.phone,name:o.cl,oid:o.id,cls:'quiet',short:24}):''}</div>
          <span class="cal-kind ${kind}">${label}</span>
        </div>`);
      });
    };
    block(board.issue,'issue','Выдать');
    block(board.ret,'ret','Принять');
    block(board.over,'over','Просрочка');
    titleEl.textContent=title;
    metaEl.textContent=meta;
    host.innerHTML=rows.length?rows.join(''):'<div style="text-align:center;padding:18px;color:var(--ink-3);font-size:12.5px">На эту дату заказов нет</div>';
  }else{
    const list=orders.filter(o=>['book','conf','build','out','over','req'].includes(o.st)).slice(0,6);
    titleEl.textContent='Ближайшие активные';
    metaEl.textContent=`${list.length} ${K.pluralOrders(list.length)}`;
    host.innerHTML=list.length?list.map(o=>{
      const addr=K.orderAddr(o);
      return `<div class="mnear-row" data-mnear="${K.escapeHtml(o.id)}">
        <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(o.g||'#8EB69B,#5E8475')})">${K.escapeHtml(o.av||'?')}</div>
        <div class="mnear-main"><div class="nm">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.cl)}</div>
        <div class="ds">${K.escapeHtml(o.dt||'')}${o.slotL?` · ${K.escapeHtml(o.slotL)}`:''}</div>
        ${addr?K.locPinHtml(addr,{phone:o.phone,name:o.cl,oid:o.id,cls:'quiet',short:24}):''}</div>
        <span class="st ${o.st}">${K.escapeHtml(o.stl)}</span>
      </div>`;
    }).join(''):'<div style="text-align:center;padding:18px;color:var(--ink-3);font-size:12.5px">Нет активных заказов</div>';
  }
  host.querySelectorAll('[data-mnear]').forEach(el=>el.addEventListener('click',()=>openOrderEvent(el.dataset.mnear)));
}
renderMOrdNear();
document.querySelectorAll('.q-item').forEach(el=>el.addEventListener('click',()=>{
  const m=(el.textContent||'').match(/№(\d+)/);
  m?openOrder(m[1]):setTab('order');
}));

// ===== Главная: навигация =====
document.querySelectorAll('#t-home .qstat').forEach(el=>el.addEventListener('click',()=>setTab('orders')));
document.querySelector('#t-home .lnk').addEventListener('click',()=>setTab('orders'));
document.querySelectorAll('#t-home .book-item').forEach(el=>el.addEventListener('click',()=>setTab('order')));

// ===== Карточка заказа — динамическая =====
const fmt=K.fmtMoney; // безопасный форматтер, не ломает дробные
const stepByStatus=API.status.step; // единая модель статусов из api.js
const TL=API.status.steps;

// Кнопка «Собрано» — активна только при 100% отмеченных. Единая точка (вызывается
// из renderMAssembly и после отметки позиции), чтобы состояние не расходилось.
function renderMAssembleBtn(uuid,total,done){
  const wrap=document.getElementById('detAssembleBtnWrap');
  if(!wrap)return;
  const all=total>0&&done===total;
  wrap.innerHTML=`<button class="btn" id="mAssembleBtn"${all?'':' disabled style="opacity:.5"'}>Собрано${all?'':` · ${done} из ${total}`}</button>`;
  document.getElementById('mAssembleBtn')?.addEventListener('click',async()=>{
    try{ const fr=await API.Orders.setAssembled(uuid,true); const i=orders.findIndex(x=>x.uuid===uuid); if(i!==-1)orders[i]=fr; openOrder(fr.id); mToast('Заказ собран','✓'); }
    catch(err){ mToast(err.message||'Не удалось','!'); }
  });
}

// Команда (для селектора «Ответственная») — кэш, грузим по требованию.
let mTeam=[];
async function ensureMTeam(){
  if(mTeam.length)return mTeam;
  try{ mTeam=await API.Team.list(); }catch(e){ mTeam=[]; }
  return mTeam;
}

// Карточка «Сборка» на мобайле: ответственная + статус + пропущенные + кнопка «Собрано».
function renderMAssembly(o,full){
  const card=document.getElementById('detAssemblyCard');
  const btnWrap=document.getElementById('detAssembleBtnWrap');
  if(!card)return;
  const uuid=o.uuid||full?.uuid||_checkOrderUUID;
  const checks=(full&&full.checklist)||[];
  const total=checks.length||Number(o.checklist_total)||0;
  const done=checks.length?checks.filter(c=>c.done).length:Number(o.checklist_done)||0;
  const st=API.calc.assemblyStatus({st:o.st,is_assembled:o.is_assembled,checklist_total:total,checklist_done:done});
  const show=['build','out','over','closed'].includes(o.st)||o.assigned_to;
  card.style.display=show?'':'none';
  // Кнопка «Собрано» — только в сборке
  if(btnWrap){
    if(o.st==='build' && o.is_assembled){ btnWrap.innerHTML='<div style="color:var(--green);font-weight:700;font-size:14px">✓ Заказ собран</div>'; }
    else if(o.st==='build'){ renderMAssembleBtn(uuid,total,done); }
    else{ btnWrap.innerHTML=''; }
  }
  if(!show)return;
  const colors={assembled:'var(--green)',incomplete:'var(--red)',progress:'var(--gold)',none:'var(--ink-3)'};
  const stEl=document.getElementById('detAssemblyStatus');
  stEl.textContent=st.label; stEl.style.color=colors[st.kind]||'var(--ink-3)';
  const canAssign=['owner','manager'].includes(API.state.me?.role);
  const body=document.getElementById('detAssembly');
  const drawAssignee=()=>{
    let html='';
    if(canAssign){
      const emps=mTeam.filter(m=>['employee','manager'].includes(m.role)&&m.is_active!==false);
      const opts='<option value="">— не назначена —</option>'+emps.map(m=>`<option value="${K.escapeHtml(m.id)}"${m.id===o.assigned_to?' selected':''}>${K.escapeHtml(m.name)}</option>`).join('');
      html+=`<div class="set-m-row"><span class="k">Ответственная</span><select id="mAssignSel" class="set-m-inp" style="max-width:180px">${opts}</select></div>`;
    }else{
      html+=`<div class="set-m-row"><span class="k">Ответственная</span><span class="v">${K.escapeHtml(o.assigned_to_name||'не назначена')}</span></div>`;
    }
    if(st.kind==='incomplete'&&checks.length){
      const missing=checks.filter(c=>!c.done);
      const who=[...new Set(checks.filter(c=>c.done).map(c=>c.done_by_name).filter(Boolean))].join(', ')||'—';
      html+=`<div style="margin-top:10px;background:var(--red-soft);border:1px solid #f0c9c4;border-radius:10px;padding:10px 12px">
        <div style="font-weight:700;color:var(--red);font-size:13px">⚠ Выдан неполным — пропущено ${missing.length}</div>
        <div style="font-size:12.5px;color:var(--ink-2);margin-top:4px">${missing.map(m=>K.escapeHtml(m.text)).join('; ')}</div>
        <div style="font-size:11.5px;color:var(--ink-3);margin-top:4px">Собирал(а): ${K.escapeHtml(who)}</div>
      </div>`;
    }
    // Оценка сборки — руководитель на собранном/выданном заказе.
    const canRate=canAssign && o.assigned_to && (o.is_assembled || ['out','over','closed'].includes(o.st));
    const curStars=o.rating?Number(o.rating.stars):0;
    if(canRate){
      const starsHtml=[1,2,3,4,5].map(n=>`<span class="m-star" data-star="${n}" style="cursor:pointer;font-size:24px;line-height:1;color:${n<=curStars?'var(--gold)':'var(--line)'}">${n<=curStars?'★':'☆'}</span>`).join('');
      html+=`<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
        <div class="set-m-row"><span class="k">Оценка сборки</span><span id="mStars" style="display:flex;gap:4px">${starsHtml}</span></div>
        <textarea id="mRateNote" placeholder="Заметка…" maxlength="500" rows="2" class="set-m-inp" style="width:100%;margin-top:8px;resize:vertical">${K.escapeHtml(o.rating?.note||'')}</textarea>
        <button class="btn" id="mRateSave" style="margin-top:8px;width:100%"${curStars?'':' disabled'}>Сохранить оценку</button>
      </div>`;
    }
    body.innerHTML=html;
    document.getElementById('mAssignSel')?.addEventListener('change',async e=>{
      const val=e.target.value||null;
      try{ const fr=await API.Orders.assign(uuid,val); const i=orders.findIndex(x=>x.uuid===uuid); if(i!==-1)orders[i]=fr; renderMAssembly(fr,fr); mToast(val?'Назначена ответственная':'Ответственная снята','✓'); }
      catch(err){ mToast(err.message||'Ошибка','!'); }
    });
    if(canRate){
      let picked=curStars;
      const paint=(n)=>document.querySelectorAll('#mStars .m-star').forEach(s=>{const v=+s.dataset.star;s.textContent=v<=n?'★':'☆';s.style.color=v<=n?'var(--gold)':'var(--line)';});
      document.querySelectorAll('#mStars .m-star').forEach(s=>s.addEventListener('click',()=>{picked=+s.dataset.star;paint(picked);const b=document.getElementById('mRateSave');if(b)b.disabled=false;}));
      document.getElementById('mRateSave')?.addEventListener('click',async()=>{
        if(picked<1)return;
        const btn=document.getElementById('mRateSave'); btn.disabled=true; btn.textContent='Сохраняем…';
        try{ const note=document.getElementById('mRateNote').value.trim(); await API.Orders.rate(uuid,picked,note); o.rating={stars:picked,note}; mToast('Оценка сохранена','✓'); btn.textContent='Сохранить оценку'; }
        catch(err){ mToast(err.message||'Ошибка','!'); btn.disabled=false; btn.textContent='Сохранить оценку'; }
      });
    }
  };
  drawAssignee();
  if(canAssign&&!mTeam.length)ensureMTeam().then(()=>{ if(_checkOrderUUID===uuid)drawAssignee(); });
}

function openOrder(id){
  const o=orders.find(x=>x.id===String(id));
  if(!o){setTab('order');return;}
  if(!Array.isArray(o.lines))o.lines=[];      // заказ без позиций не должен падать
  _checkOrderUUID=o.uuid||null;
  document.getElementById('detArt').innerHTML=o.lines[0]?costumeSVG(o.lines[0].t):'';
  document.getElementById('detId').textContent=`Заказ №${o.id}`;
  document.getElementById('detCl').textContent=o.cl+(o.lines.length?' · '+o.lines.map(l=>l.name).join(', ').slice(0,40):'');
  const stEl=document.getElementById('detStatus');
  stEl.className='stat-light';
  stEl.textContent=o.stl;
  document.getElementById('detTl').innerHTML=K.renderOrderFlow(o);
  // позиции
  document.getElementById('detItems').innerHTML=o.lines.map(li=>{
    const qty=li.qty||1;
    const total=li.pd?li.pd*o.days*qty:0;
    return `<div class="line-item"><div class="li-img">${costumeSVG(li.t)}</div><div class="li-main"><div class="nm">${K.escapeHtml(li.name)}</div><div class="ds">${K.escapeHtml(li.desc||'')}</div></div><div class="li-price"><div class="p">${li.pd?fmt(li.pd)+'/д':''}</div><div class="d">${li.pd?`×${o.days}${qty>1?`×${qty}`:''} = ${fmt(total)}`:'—'}</div></div></div>`;
  }).join('');
  document.getElementById('detItemsMeta').textContent=`${o.lines.length} ${K.pluralItems(o.lines.length)} · ${o.days} ${K.pluralDays(o.days)} · ${o.slotL||'Утро'}`;
  // чек-лист только в сборке
  const checkCard=document.getElementById('detCheckCard');
  function renderChecklistUI(checks){
    const done=checks.filter(c=>c.on).length;
    document.getElementById('detCheckMeta').textContent=`${done} из ${checks.length} готово`;
    document.getElementById('detChecks').innerHTML=checks.map(c=>
      `<div class="check-row${c.on?' on':''}"${c.id?` data-check-id="${K.escapeHtml(c.id)}"`:''}><div class="cb${c.on?' on':''}">${c.on?'✓':''}</div><div class="ct">${K.escapeHtml(c.t)}</div><div class="cr-who">${K.escapeHtml(c.who||'')}</div></div>`).join('');
  }
  if(o.st==='build'){
    checkCard.style.display='';
    const fallbackChecks=[
      ...o.lines.map(li=>({t:`${li.name} — размер`,who:'',on:false})),
      {t:'Отпарить, упаковать',who:'',on:false},
      {t:'Вложить договор и чек',who:'',on:false},
      ...(o.del?.type==='yandex'?[{t:'Передать курьеру',who:'',on:false}]:[]),
    ];
    renderChecklistUI(fallbackChecks);
  }else{checkCard.style.display='none';}
  renderMAssembly(o,null);   // из данных списка; детали (пропущено) уточним после дозагрузки
  // скрываем доп. секции до загрузки полных данных
  const delCard=document.getElementById('detDelCard');
  const histCard=document.getElementById('detHistCard');
  if(delCard)delCard.style.display='none';
  if(histCard)histCard.style.display='none';
  const listAddr=K.orderAddr(o);
  if(delCard&&listAddr){
    delCard.style.display='';
    document.getElementById('detDelInfo').innerHTML=K.locPinHtml(listAddr,{phone:o.phone,name:o.cl,oid:o.id})+
      (o.phone?`<div style="margin-top:8px;font-size:13px;color:var(--ink-2)">${K.escapeHtml(o.phone)}</div>`:'');
  }
  // единый async-запрос: чеклист + доставка + история
  if(o.uuid){
    API.Orders.one(o.uuid).then(full=>{
      if(full.delivery_addr) o.delivery_addr=full.delivery_addr;
      if(full.phone) o.phone=full.phone;
      // чеклист
      if(o.st==='build'&&full.checklist?.length){
        renderChecklistUI(full.checklist.map(c=>({id:c.id,t:c.text||c.label||'',who:c.done_by_name||'',on:!!c.done})));
      }
      renderMAssembly(full,full);   // полные данные: статус, ответственная, пропущенные позиции
      // доставка
      if(delCard){
        const addr=K.orderAddr(full)||K.orderAddr(o);
        if(addr){
          delCard.style.display='';
          document.getElementById('detDelInfo').innerHTML=
            K.locPinHtml(addr,{phone:full.phone||o.phone,name:full.cl||o.cl,oid:o.id})+
            (full.phone||o.phone?`<div style="margin-top:8px;font-size:13px;color:var(--ink-2)">${K.escapeHtml(full.phone||o.phone)}</div>`:'');
        }
      }
      // история
      if(histCard&&full.history?.length){
        histCard.style.display='';
        document.getElementById('detHistory').innerHTML=full.history.map(h=>{
          const dt=h.created_at?new Date(h.created_at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
          return`<div class="hist-row"><div class="hist-dot"></div><div style="flex:1"><div style="font-size:13px;font-weight:500">${K.escapeHtml(h.detail||h.event||'')}</div>${dt?`<div style="font-size:11px;color:var(--ink-3);margin-top:2px">${dt}</div>`:''}</div></div>`;
        }).join('');
      }
    }).catch(()=>{});
  }
  // деньги
  const pb=document.getElementById('detPayBadge');
  const mPaid=o.paidAmount||0, mTot=o.total_raw||0;
  const mRem=o.remaining!=null?o.remaining:Math.max(0,mTot-mPaid);
  const mFully=o.paid||mRem<=0;
  pb.textContent=mFully?'✓ Оплачено':(mPaid>0?`Оплачено ${fmt(mPaid)} из ${fmt(mTot)}`:'Ожидает');
  pb.style.background=mFully?'':'var(--gold-soft)';
  pb.style.color=mFully?'':'var(--gold)';
  const moneyLines=o.lines.map(li=>{
    if(!li.pd)return '';
    const qty=li.qty||1;
    return `<div class="money-line"><span class="k">${K.escapeHtml(li.name)} · ${fmt(li.pd)} × ${o.days}${qty>1?` × ${qty}`:''}</span><span class="v">${fmt(li.pd*o.days*qty)}</span></div>`;
  }).join('');
  const subtotal=o.lines.reduce((s,li)=>s+(li.pd||0)*o.days*(li.qty||1),0);
  const delCost=o.delCost||0;
  const total=subtotal-(o.disc||0)+delCost;
  document.getElementById('detMoney').innerHTML=moneyLines+
    (o.disc?`<div class="money-line"><span class="k">${K.escapeHtml(o.discL||'Скидка')}</span><span class="v" style="color:var(--green)">−${fmt(o.disc)}</span></div>`:'')+
    (delCost?`<div class="money-line"><span class="k">Доставка</span><span class="v">${fmt(delCost)}</span></div>`:'')+
    `<div class="money-line total"><span class="k">Итого</span><span class="v">${fmt(total)}</span></div>`;
  document.getElementById('detDep').textContent=o.dep?fmt(o.dep):'—';
  document.getElementById('detPay').textContent=o.pay;
  // действия — флоу больше не пропускает шаг "Бронь"
  const STATUS_FLOW=API.status.next;
  const STATUS_LABEL=API.status.label;
  const mainAction=K.orderMainLabel(o.st, API.state.me?.role) || ({closed:'Архив',over:'Связаться'}[o.st]||'');
  const emp=API.state.me?.role==='employee';
  const empCanAdvance=emp && o.st==='conf' && o.assigned_to===API.state.me?.id;
  const showAdvance=!!mainAction && (!emp || empCanAdvance);
  const canPay=mRem>0&&o.st!=='cancelled'&&!emp;
  document.getElementById('detActions').innerHTML=
    (showAdvance?`<button class="btn" id="orderAdvance" data-oid="${K.escapeHtml(o.id)}">${K.escapeHtml(mainAction)}</button>`:'')+
    (canPay?`<button class="btn pay-cta" id="mOrderPay">${mPaid>0?'Доплатить ':'Принять '}${fmt(mRem)}</button>`:'')+
    `<div class="act-row">
      <button type="button" class="act-ghost" id="orderMsgCl">Написать в Telegram</button>
      ${(o.st!=='closed'&&o.st!=='req'&&o.st!=='cancelled'&&!emp)?`<button type="button" class="act-ghost danger" id="orderCancel">Отменить</button>`:''}
    </div>`;
  const advEl=document.getElementById('orderAdvance');
  if(advEl)advEl.onclick=async e=>{
    e.stopPropagation();
    if(o.st==='over'){
      const cl=mClients.find(c=>c.name===o.cl);
      if(!K.openClientChat({telegram:o.telegram||cl?.telegram||cl?.tg, phone:o.phone||cl?.phone})) mToast('Нет телефона клиента','!');
      return;
    }
    if(o.st==='closed'){mToast('Заказ уже закрыт','📁');return;}
    const next=STATUS_FLOW[o.st];if(!next)return;
    const advBtn=document.getElementById('orderAdvance');
    const prevText=advBtn.textContent;
    advBtn.disabled=true;advBtn.textContent='Сохраняем…';
    try{
      if(o.uuid)await API.Orders.setStatus(o.uuid,next);
      o.st=next;o.stl=STATUS_LABEL[next];
      if(next==='closed')mToast('Заказ закрыт ✓','✓');
      else mToast(`Статус: ${STATUS_LABEL[next]}`,'✓');
      renderMOrders();renderMOrdNear();renderHomeQueue();renderHomeStats(API.state.stats);
      openOrder(o.id);
    }catch(err){
      mToast('Ошибка: '+err.message,'!');
      advBtn.disabled=false;advBtn.textContent=prevText;
    }
  };
  document.getElementById('mOrderPay')?.addEventListener('click',ev=>{ev.stopPropagation();openMPayModal(o);});
  document.getElementById('orderMsgCl').onclick=e=>{
    e.stopPropagation();
    const cl=mClients.find(c=>c.name===o.cl);
    if(!K.openClientChat({telegram:o.telegram||cl?.telegram||cl?.tg, phone:o.phone||cl?.phone})) mToast('Нет телефона клиента','!');
  };
  if(document.getElementById('orderCancel'))document.getElementById('orderCancel').onclick=async e=>{
    e.stopPropagation();
    const ok=await K.confirmDialog(`Отменить заказ №${o.id}?`,{title:'Отмена заказа',ok:'Отменить',cancel:'Не отменять',danger:true});
    if(!ok)return;
    try{
      if(o.uuid)await API.Orders.setStatus(o.uuid,'cancelled');
      o.st='cancelled';o.stl='Отменён';
      mToast('Заказ отменён','✕');renderMOrders();renderMOrdNear();renderHomeQueue();openOrder(o.id);
    }catch(err){mToast('Ошибка: '+err.message,'!');}
  };
  setTab('order');
  // обновляем шапку
  const nm=document.querySelector('#appbar .nm');
  if(nm)nm.textContent=`№${o.id}`;
  const h2=document.querySelector('#appbar h2');
  if(h2)h2.textContent=`Заказ №${o.id}`;
}
window.openOrder=openOrder;

// чек-лист сборки — делегированный handler (строки создаются динамически в openOrder)
let _checkOrderUUID=null; // UUID заказа, открытого сейчас
function paintCheckMeta(){
  const allRows=document.querySelectorAll('#detChecks .check-row');
  const doneCount=[...allRows].filter(x=>x.classList.contains('on')).length;
  const meta=document.getElementById('detCheckMeta');
  if(meta)meta.textContent=`${doneCount} из ${allRows.length} готово`;
}
document.addEventListener('click',e=>{
  const r=e.target.closest('#detChecks .check-row');
  if(!r)return;
  const cb=r.querySelector('.cb');
  if(!cb)return;
  // визуально переключаем
  const setOn=on=>{
    r.classList.toggle('on',on);
    cb.classList.toggle('on',on);
    cb.textContent=on?'✓':'';
  };
  const want=!cb.classList.contains('on');
  setOn(want);
  paintCheckMeta();
  const refreshBtn=()=>{
    const rows=document.querySelectorAll('#detChecks .check-row');
    const total=rows.length, done=[...rows].filter(x=>x.querySelector('.cb.on')).length;
    if(_checkOrderUUID)renderMAssembleBtn(_checkOrderUUID,total,done);
  };
  refreshBtn();
  // пишем в БД; при ошибке откатываем галочку и сообщаем (не молчим)
  const itemId=r.dataset.checkId;
  if(itemId&&_checkOrderUUID){
    API.Orders.toggleChecklist(_checkOrderUUID,itemId,want).catch(err=>{
      setOn(!want);
      paintCheckMeta();
      refreshBtn();
      mToast('Не сохранилось: '+(err?.message||'ошибка сети'),'!');
    });
  }
});

// ===== Клиенты (мобайл) =====
const mClients=[];
function renderMClients(){
  const e=K.escapeHtml;
  const host=document.getElementById('clientsList');
  if(!host)return;
  if(!mClients.length){
    host.innerHTML='<div class="empty-state"><div class="empty-title">Клиентов пока нет</div><div class="empty-sub">Добавьте первого клиента</div></div>';
    return;
  }
  host.innerHTML=mClients.map((c,i)=>`
    <div class="cl-card" data-mci="${i}" tabindex="0" role="button" aria-label="Клиент ${e(c.name)}" style="cursor:pointer;${c.debt?'border:1px solid #f0c9c4;background:var(--red-soft)':''}">
      <div class="cl-top">
        <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(c.g)})">${e(c.av)}</div>
        <div style="flex:1"><div class="nm">${e(c.name)}</div><span class="badge ${e(c.type)}">${e(c.sub)}</span>${c.addr?`<div style="font-size:11px;color:var(--ink-3);margin-top:4px">📍 ${e(c.addr)}</div>`:''}</div>
        ${c.debt?`<span class="st over">${Math.round(c.debt/1000)} тыс долг</span>`:''}
      </div>
      <div class="cl-stats">
        <div class="cl-stat"><div class="v">${c.orders}</div><div class="k">заказов</div></div>
        <div class="cl-stat"><div class="v ${c.debt?'cl-debt':''}">${c.debt?'есть долг':e(c.sum||'')}</div><div class="k">${c.debt?'задолж.':'потрачено'}</div></div>
        <div class="cl-stat"><div class="v">${e(c.last||'')}</div><div class="k">последний</div></div>
      </div>
    </div>`).join('');
}
// Делегирование клика
document.getElementById('clientsList').addEventListener('click',e=>{
  const card=e.target.closest('[data-mci]');
  if(card)openMClient(+card.dataset.mci);
});
document.getElementById('clientsList').addEventListener('keydown',e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const card=e.target.closest('[data-mci]');
  if(card){ e.preventDefault(); openMClient(+card.dataset.mci); }
});
renderMClients();

function openMClient(idx){
  const c=mClients[idx];if(!c)return;
  document.getElementById('mclAv').textContent=c.av;
  document.getElementById('mclAv').style.background=`linear-gradient(135deg,${K.escapeHtml(c.g)})`;
  document.getElementById('mclName').textContent=c.name;
  document.getElementById('mclSub').textContent=`${c.sub} · клиент с ${c.last||'—'}`;
  document.getElementById('mclOrd').textContent=c.orders;
  document.getElementById('mclSum').textContent=c.sum||'0';
  document.getElementById('mclLast').textContent=c.last||'—';
  document.getElementById('mclDebtCard').style.display=c.debt?'':'none';
  document.getElementById('mclDebt').textContent=c.debt?Math.round(c.debt/1000)+' тыс':'0';
  const fields=[['Телефон',c.phone||'—'],['Email',c.email||'—'],['Telegram',c.tg||'—'],['Адрес',c.addr||'—']];
  document.getElementById('mclFields').innerHTML=fields.map(([k,v])=>`<div class="set-m-row"><span class="k">${K.escapeHtml(String(k))}</span><span class="v">${K.escapeHtml(String(v))}</span></div>`).join('');
  document.getElementById('mclNoteCard').style.display=c.note?'':'none';
  document.getElementById('mclNote').textContent=c.note||'';
  const ords=orders.filter(o=>o.cl===c.name);
  document.getElementById('mclOrdersCard').style.display=ords.length?'':'none';
  document.getElementById('mclOrders').innerHTML=ords.map(o=>
    `<div class="set-m-row" data-mc-ord="${K.escapeHtml(o.id)}" style="cursor:pointer">
      <span class="k">№${K.escapeHtml(o.id)}<br><span style="font-size:11px">${K.escapeHtml(o.dt||'')}</span></span>
      <span class="v" style="text-align:right"><b>${K.escapeHtml(o.sm||o.sum||'')}</b><br><span class="st ${o.st}" style="font-size:10.5px">${K.escapeHtml(o.stl)}</span></span>
    </div>`).join('');
  document.querySelectorAll('[data-mc-ord]').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.mcOrd)));
  document.getElementById('mclEdit').onclick=e=>{e.stopPropagation();openMClientModal(idx);};
  document.getElementById('mclNew').onclick=e=>{e.stopPropagation();setTab('new-order');};
  setTab('client');
}
// Безопасные инициалы для пользовательских имён
function mSafeInitials(name, isOrg){
  name=(name||'').trim();
  if(!name)return '?';
  if(isOrg)return name.charAt(0).toUpperCase();
  const parts=name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.charAt(0)||'')+(parts[1]?.charAt(0)||'')).toUpperCase()||'?';
}

// модалка добавления / редактирования клиента
function openMClientModal(editIdx){
  const palette=['#DDB261,#C2891F','#8EB69B,#5E8475','#4FBE93,#2E9E78','#5FC4BA,#2E8F86','#9B8EC4,#6E5BA8','#E0796D,#CB554A'];
  const exist=editIdx!=null?mClients[editIdx]:null;
  const e=K.escapeHtml;
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>${exist?'Редактировать клиента':'Новый клиент'}</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Тип клиента</label><div class="type-pick"><button type="button"${(!exist||exist.type==='person')?' class="active"':''} data-tp="person">👤 Физлицо</button><button type="button"${exist&&exist.type==='org'?' class="active"':''} data-tp="org">🏢 Организация</button></div></div>
      <div class="mf"><label>Имя или название</label><input id="mcmName" placeholder="Шохрух Мирзаев" value="${e(exist?.name||'')}" maxlength="80"></div>
      <div class="mf"><label>Телефон</label><input id="mcmPhone" inputmode="tel" type="tel" placeholder="+998 90 123-45-67" value="${e(exist?.phone||'')}" maxlength="20"></div>
      <div class="mf"><label>Email <span style="color:var(--ink-3);font-weight:400">— необязательно</span></label><input id="mcmEmail" type="email" placeholder="client@example.com" value="${e(exist?.email||'')}" maxlength="100"></div>
      <div class="mf"><label>Telegram <span style="color:var(--ink-3);font-weight:400">— необязательно</span></label><input id="mcmTg" placeholder="@username" value="${e(exist?.tg||'')}" maxlength="40"></div>
      <div class="mf"><label>Адрес</label><input id="mcmAddr" placeholder="Ташкент, Чиланзар 9 кв.14" value="${e(exist?.addr||'')}" maxlength="200"></div>
      <div class="mf"><label>Заметка <span style="color:var(--ink-3);font-weight:400">— необязательно</span></label><textarea id="mcmNote" rows="2" maxlength="500" placeholder="Постоянный, любит супергероев…">${e(exist?.note||'')}</textarea></div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="mcmSave">${exist?'Сохранить':'Создать'}</button></div>
  </div>`;
  document.body.appendChild(bg);
  let type=exist?.type||'person';
  bg.querySelectorAll('.type-pick button').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.type-pick button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');type=b.dataset.tp;
  }));
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=ev=>{ if(ev.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',ev=>{if(ev.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  bg.querySelector('#mcmSave').addEventListener('click',async ev=>{
    ev.stopPropagation();
    const name=bg.querySelector('#mcmName').value.trim();
    if(!name){mToast('Введите имя клиента','!');return;}
    if(!exist){
      const dup=K.findSameName(mClients,name);
      if(dup){
        const open=await K.confirmDialog(`Клиент «${name}» уже есть. Открыть карточку?`,{title:'Клиент уже есть',ok:'Открыть',cancel:'Создать ещё'});
        if(open){
          close();
          const i=mClients.findIndex(x=>x.id===dup.id);
          if(i>=0) openMClient(i);
          return;
        }
      }
    }
    const saveBtn=bg.querySelector('#mcmSave');
    saveBtn.disabled=true; saveBtn.textContent='Сохраняем…';
    const payload={
      name, type,
      phone:bg.querySelector('#mcmPhone').value.trim(),
      email:bg.querySelector('#mcmEmail').value.trim(),
      telegram:bg.querySelector('#mcmTg').value.trim(),
      address:bg.querySelector('#mcmAddr').value.trim(),
      note:bg.querySelector('#mcmNote').value.trim(),
    };
    try{
      if(exist && exist.id){
        const updated=await API.Clients.update(exist.id, payload);
        Object.assign(mClients[editIdx], updated);
        renderMClients(); openMClient(editIdx);
      }else{
        const created=await API.Clients.create(payload);
        mClients.unshift(created);
        renderMClients();
      }
      close();
    }catch(err){
      mToast('Ошибка: '+err.message,'!');
      saveBtn.disabled=false; saveBtn.textContent=exist?'Сохранить':'Создать';
    }
  });
  setTimeout(()=>bg.querySelector('#mcmName')?.focus(),50);
}
document.getElementById('mAddClient')?.addEventListener('click',e=>{e.stopPropagation();openMClientModal();});

// ===== Форма нового заказа — реальная логика =====
// Источник истины для костюмов — серверный массив `costumes` (adaptCostume).
// Никаких hardcoded-дублей: позиция корзины строится из реального костюма,
// иначе костюм, созданный в приложении, нельзя было бы добавить в заказ.
function cartItemFromCostume(c){
  const firstSize=String(c.sizes||'').split(',')[0].trim();
  return {
    t: c.type,
    id: c.id,
    name: c.name,
    desc: firstSize ? `размер ${firstSize}` : '',
    pd: c.price_raw != null ? Number(c.price_raw) : (Number(String(c.price).replace(/\D/g,'')) || 0),
  };
}
// Стоимость доставки Yandex Go (одна точка правды вместо магического числа)
const YANDEX_DELIVERY_COST=28000;
const _isoLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const _noFrom=_isoLocal(new Date(K.TODAY.y,K.TODAY.m,K.TODAY.d));
const _noTo=_noFrom;
let mSettings={};
const noState={clId:null,items:[],from:_noFrom,to:_noTo,slot:'am',del:'pickup',addr:'',pay:'Карта',dep:0};
const noFmt=K.fmtMoney;
function noDaysCalc(){
  const a=new Date(noState.from),b=new Date(noState.to);
  return Math.max(1,Math.round((b-a)/86400000));
}
function noRenderCl(filter=''){
  const list=document.getElementById('noClList');
  const picked=document.getElementById('noClPicked');
  const search=document.getElementById('noClSearch');
  // выбран и не идёт поиск → показываем pill
  if(noState.clId!=null && !filter){
    const c=mClients.find(x=>x.id===noState.clId);
    if(!c){noState.clId=null;noRenderCl(filter);return;}
    picked.style.display='';
    picked.innerHTML=`<div class="nof-sug-row sel" style="margin-top:10px"><div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(c.g)});width:34px;height:34px;border-radius:10px;font-size:12px">${K.escapeHtml(c.av)}</div><div style="flex:1"><div class="nm">${K.escapeHtml(c.name)}</div><div style="font-size:11px;color:var(--ink-3)">${K.escapeHtml(c.sub)} · ${c.orders} заказов</div></div><button data-clrm style="background:none;border:none;color:var(--ink-3);font-size:18px;cursor:pointer">×</button></div>`;
    list.style.display='none';
    search.style.display='none';
    const addrs=K.parseAddresses(c);
    if(!noState.addr && addrs[0]) noState.addr=addrs[0];
    K.renderAddrPick(document.getElementById('noAddrPick'),c,noState.addr,v=>{noState.addr=v;noRenderCl();});
    return;
  }
  search.style.display='';
  picked.style.display='none';
  noState.addr='';
  K.renderAddrPick(document.getElementById('noAddrPick'),null,'');
  const f=filter.trim().toLowerCase();
  if(!f){list.style.display='none';return;}
  list.style.display='';
  list.innerHTML=mClients
    .filter(c=>c.name.toLowerCase().includes(f))
    .map(c=>`<div class="nof-sug-row" data-cli="${K.escapeHtml(c.id)}" style="margin-top:6px"><div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(c.g)});width:34px;height:34px;border-radius:10px;font-size:12px">${K.escapeHtml(c.av)}</div><div style="flex:1"><div class="nm">${K.escapeHtml(c.name)}</div><div style="font-size:11px;color:var(--ink-3)">${K.escapeHtml(c.sub)} · ${c.orders} заказов</div></div></div>`).join('') ||
    '<div style="text-align:center;padding:14px;color:var(--ink-3);font-size:13px">Не найдено</div>';
}
function noRenderItems(){
  const list=document.getElementById('noItemsList');
  if(!noState.items.length){
    list.innerHTML='<div style="padding:14px 0;text-align:center;color:var(--ink-3);font-size:13px">Корзина пуста</div>';
    document.getElementById('noItemsMeta').textContent='';
    return;
  }
  list.innerHTML=noState.items.map((it,i)=>
    `<div class="line-item"><div class="li-img">${costumeSVG(it.t)}</div><div class="li-main"><div class="nm">${K.escapeHtml(it.name)}</div><div class="ds">${K.escapeHtml(it.desc)}${it.desc?' · ':''}${noFmt(it.pd)}/д</div></div><button class="nof-rm" data-ri="${i}">×</button></div>`).join('');
  document.getElementById('noItemsMeta').textContent=`${noState.items.length} ${K.pluralItems(noState.items.length)}`;
}
function noRenderMoney(){
  const d=noDaysCalc();
  document.getElementById('noDays').innerHTML=`${d}<small>дн</small>`;
  const lines=noState.items.map(it=>`<div class="money-line"><span class="k">${K.escapeHtml(it.name)} × ${d} дн</span><span class="v">${noFmt(it.pd*d)}</span></div>`).join('');
  const subtotal=noState.items.reduce((s,it)=>s+it.pd*d,0);
  const delCost=noState.del==='yandex'?YANDEX_DELIVERY_COST:0;
  const total=subtotal+delCost;
  document.getElementById('noMoney').innerHTML=lines+
    (delCost?`<div class="money-line"><span class="k">Доставка</span><span class="v">${noFmt(delCost)}</span></div>`:'')+
    `<div class="money-line total"><span class="k">Итого</span><span class="v">${noFmt(total)}</span></div>`+
    `<div class="money-line"><span class="k">Залог</span><span class="v" style="color:var(--primary)">${noFmt(noState.dep)}</span></div>`;
}
function noRenderAll(){noRenderCl();noRenderItems();noRenderMoney();}
noRenderAll();
// init дат
document.getElementById('noFrom').value=noState.from;
document.getElementById('noTo').value=noState.to;
document.getElementById('noDep').value='';
// клиент: поиск
document.getElementById('noClSearch').addEventListener('input',e=>noRenderCl(e.target.value));
// клиент: выбор
document.getElementById('noClList').addEventListener('click',e=>{
  const row=e.target.closest('[data-cli]');
  if(row){noState.clId=row.dataset.cli;document.getElementById('noClSearch').value='';noRenderCl();}
});
// клиент: убрать выбор
document.getElementById('noClPicked').addEventListener('click',e=>{
  if(e.target.closest('[data-clrm]')){noState.clId=null;noRenderCl();}
});
// удаление позиции
document.getElementById('noItemsList').addEventListener('click',e=>{
  const rm=e.target.closest('[data-ri]');
  if(rm){noState.items.splice(+rm.dataset.ri,1);noRenderItems();noRenderMoney();}
});
// добавление позиции — переход на склад в режиме корзины
document.getElementById('noPickFromWh').addEventListener('click',e=>{
  e.stopPropagation();
  pickMode=true;
  setTab('wh');
  renderWhForPick();
});
function renderWhForPick(){
  const bar=document.getElementById('pickBar');
  const n=noState.items.length;
  if(bar){
    bar.hidden=false;
    const c=document.getElementById('pickCount');
    if(c)c.textContent=n?`В заказе · ${n}`:'Ничего не выбрано';
  }
  const hd=document.getElementById('pickCountHd');
  if(hd)hd.textContent=String(n);
  document.querySelectorAll('#t-wh .cost-card').forEach(c=>{
    const t=c.dataset.t;
    const cnt=noState.items.filter(it=>it.t===t).length;
    c.classList.toggle('picked',cnt>0);
    let badge=c.querySelector('.pick-badge');
    if(cnt){
      if(!badge){badge=document.createElement('div');badge.className='pick-badge';c.appendChild(badge);}
      badge.textContent=cnt;
    }else if(badge){badge.remove();}
  });
  const go=document.getElementById('whRoomsGo');
  if(go) go.hidden=true;
}
function hideWhPick(){
  const bar=document.getElementById('pickBar');
  if(bar)bar.hidden=true;
  document.querySelectorAll('#t-wh .cost-card').forEach(c=>{
    c.classList.remove('picked');
    c.querySelector('.pick-badge')?.remove();
  });
  const go=document.getElementById('whRoomsGo');
  if(go) go.hidden=false;
}
// клик по костюму в pickMode → добавить в корзину
document.addEventListener('click',e=>{
  if(!pickMode)return;
  const done=e.target.closest('#pickDone');
  if(done || e.target.closest('#whPickBack')){pickMode=false;hideWhPick();setTab('new-order');noRenderItems();noRenderMoney();return;}
  const card=e.target.closest('#t-wh .cost-card');
  if(!card)return;
  const t=card.dataset.t;
  const c=costumes.find(x=>x.type===t);
  if(!c)return;
  e.stopPropagation();
  noState.items.push(cartItemFromCostume(c));
  renderWhForPick();
});
// даты
document.getElementById('noFrom').addEventListener('change',e=>{
  noState.from=e.target.value;
  if(!noState.to || noState.to < noState.from) { noState.to=noState.from; document.getElementById('noTo').value=noState.to; }
  noRenderMoney();
});
document.getElementById('noTo').addEventListener('change',e=>{noState.to=e.target.value;noRenderMoney();});
document.getElementById('noSlot')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-slot]');
  if(!b)return;
  b.parentElement.querySelectorAll('.nof-toggle').forEach(x=>x.classList.toggle('active',x===b));
  noState.slot=b.dataset.slot;
});
document.getElementById('noDel')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-del]');
  if(!b)return;
  b.parentElement.querySelectorAll('.nof-toggle').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  noState.del=b.dataset.del;
  noRenderMoney();
});
// оплата
document.getElementById('noPay').addEventListener('click',e=>{
  const b=e.target.closest('[data-pay]');
  if(!b)return;
  b.parentElement.querySelectorAll('.nof-toggle').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  noState.pay=b.dataset.pay;
});
// залог: форматирование на лету
document.getElementById('noDep').addEventListener('input',e=>{
  const n=+e.target.value.replace(/\D/g,'');
  noState.dep=n||0;
  e.target.value=n?noFmt(n):'';
  noRenderMoney();
});
// сохранить черновик — пока feedback
document.getElementById('noDraft').addEventListener('click',e=>{
  e.stopPropagation();
  e.target.textContent='✓ Черновик сохранён';
  setTimeout(()=>{e.target.textContent='Сохранить черновик';},1500);
});
// создать заказ
document.getElementById('noCreate').addEventListener('click',async e=>{
  e.stopPropagation();
  if(noState.clId==null){mToast('Выберите клиента','!');return;}
  if(!noState.items.length){mToast('Добавьте хотя бы один костюм','!');return;}
  if(new Date(noState.to) < new Date(noState.from)){mToast('Дата возврата не может быть раньше выдачи','!');return;}
  const cl=mClients.find(x=>x.id===noState.clId);
  if(!cl||!cl.id){mToast('Клиент ещё не синхронизирован с сервером','!');return;}
  // id костюма берём из позиции (он положен при выборе), на всякий случай
  // подстраховываемся поиском по type в актуальном списке costumes.
  const apiItems=noState.items.map(it=>({
    costume_id: it.id || costumes.find(x=>x.type===it.t)?.id,
    qty:1,
  }));
  if(apiItems.some(i=>!i.costume_id)){
    mToast('Костюм не синхронизирован с сервером','!');return;
  }
  const createBtn=e.currentTarget; createBtn.disabled=true; createBtn.textContent='Создаём…';
  try{
    const order=await API.Orders.create({
      client_id: cl.id,
      items: apiItems,
      issue_date: noState.from,
      return_date: noState.to,
      slot: noState.slot||'am',
      delivery_type: noState.del||'pickup',
      delivery_addr: noState.addr||'',
      delivery_cost: 0,
      payment_method: noState.pay,
      deposit: noState.dep,
    });
    orders.unshift(order);
    renderMOrders(); renderMOrdMiniCal(); renderMOrdNear(); renderMCalGrid();
    noState.items.length=0; noState.clId=null; noState.addr=''; noState.dep=0; noState.slot='am';
    document.getElementById('noDep').value='';
    document.querySelectorAll('#noSlot .nof-toggle').forEach(x=>x.classList.toggle('active',x.dataset.slot==='am'));
    noRenderAll();
    openOrder(order.id);
  }catch(err){
    mToast('Ошибка: '+err.message,'!');
    createBtn.disabled=false; createBtn.textContent='Создать заказ';
  }
});
// «Ещё» → подразделы
document.querySelectorAll('.more-tile[data-go]').forEach(t=>t.onclick=()=>{
  if(t.dataset.go==='rooms'){ roomsFrom='more'; roomsView={room:null,rack:null,side:null}; }
  setTab(t.dataset.go);
  if(t.dataset.go==='tg')renderTgTab();
  if(t.dataset.go==='team')renderTeamM();
});

// ===== Склад =====
const costumes=[];

function renderLoose(loose){
  if(!loose||!loose.length) return '';
  return '<div class="card blk" style="margin-top:12px"><div class="sec-title" style="margin:0 0 8px">Не на месте</div>'+
    loose.map(c=>`<div class="set-m-row"><span>${K.escapeHtml(c.name)}</span><span class="v">${K.escapeHtml(K.slotLabel(c.location)||c.location||'—')}</span></div>`).join('')+
    '</div>';
}
function openSlotSheet(code){
  const can=API.state.me?.role!=='employee';
  if(!can)return;
  const occ=K.slotOccupancy(costumes);
  const here=occ.by[code]||[];
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.innerHTML=`<div class="modal-card"><div class="modal-hd"><h3>${K.escapeHtml(K.slotLabel(code))}</h3><button class="modal-cls" type="button">×</button></div>
    <div class="modal-body">
      ${here.length?here.map(c=>`<div class="set-m-row"><span>${K.escapeHtml(c.name)}</span><button class="set-edit-btn" data-un="${K.escapeHtml(c.type)}">убрать</button></div>`).join(''):'<div style="font-size:13px;color:var(--ink-3)">Пусто</div>'}
      <div class="sec-title" style="margin-top:14px">Положить сюда</div>
      ${costumes.filter(c=>K.parseSlot(c.location)?.code!==code).map(c=>`<div class="set-m-row" data-put="${K.escapeHtml(c.type)}" style="cursor:pointer"><span>${K.escapeHtml(c.name)}</span><span class="v">${K.escapeHtml(K.slotLabel(c.location)||c.location||'—')}</span></div>`).join('')}
    </div></div>`;
  document.body.appendChild(bg);
  const close=()=>bg.remove();
  bg.onclick=e=>{ if(e.target===bg||e.target.closest('.modal-cls')) close(); };
  bg.querySelectorAll('[data-put]').forEach(el=>el.onclick=()=>{placeCostume(el.dataset.put,code); close();});
  bg.querySelectorAll('[data-un]').forEach(el=>el.onclick=()=>{placeCostume(el.dataset.un,''); close();});
}
async function placeCostume(type, code){
  const c=costumes.find(x=>x.type===type);
  if(!c)return;
  c.location=code||'';
  try{ if(c.id) await API.Costumes.update(c.id,{location:code||null}); }catch(e){ mToast(e.message,'!'); return; }
  renderCostGrid(); renderRooms();
  mToast(code?`«${c.name}» → ${K.slotLabel(code)}`:`«${c.name}» убран`,'✓');
}
function renderRooms(){
  const root=document.getElementById('roomsRoot');
  if(!root)return;
  K.forgetMissingBins(costumes);
  const occ=K.slotOccupancy(costumes);
  if(!roomsView.room){
    const appbar=document.getElementById('appbar');
    if(appbar) appbar.innerHTML=headers.rooms;
    const back=document.querySelector('[data-back]');
    if(back)back.onclick=()=>setTab(roomsFrom==='wh'?'wh':'more');
    root.innerHTML=K.ROOMS.map(rm=>{
      const n=K.roomFill(costumes, rm.id);
      const mini=rm.kind==='boxes'
        ? '<div class="rm-mini box"><i></i><i></i><i></i><i></i></div>'
        : '<div class="rm-mini"><i class="a"></i><span><i class="b"></i><i></i><i class="c"></i></span></div>';
      return `<div class="card rm-card" data-rm="${rm.id}">
        ${mini}
        <div><div class="rm-n">${rm.name}</div><div class="rm-s">${rm.sub||''}</div></div>
        <div class="rm-fill">${n}<div style="font-size:10px;font-weight:600;color:var(--ink-3)">${rm.kind==='boxes'?'вещей':'костюм.'}</div></div>
      </div>`;
    }).join('') + renderLoose(occ.loose);
    root.querySelectorAll('[data-rm]').forEach(el=>el.onclick=()=>{roomsView.room=el.dataset.rm;roomsView.rack=null;renderRooms();});
    return;
  }
  const roomMeta=K.ROOMS.find(r=>r.id===roomsView.room);
  if(roomMeta && roomMeta.kind==='boxes'){
    const appbar=document.getElementById('appbar');
    if(appbar) appbar.innerHTML=`<button class="back-sm" id="rmBack" type="button">‹</button><h2>Склад</h2>`;
    document.getElementById('rmBack').onclick=()=>{roomsView.room=null;renderRooms();};
    let h='<div class="box-grid">';
    for(let i=1;i<=K.BOX_COUNT;i++){
      const code=K.formatBox(i);
      const items=occ.by[code]||[];
      h+=`<button type="button" class="box-card${items.length?' has':''}" data-slot="${code}">
        <div class="box-lid"></div>
        <div class="box-n">${i}</div>
        <div class="box-s">${items.length?K.escapeHtml(items.map(c=>c.name).join(', ')):'пусто'}</div>
      </button>`;
    }
    root.innerHTML=h+'</div>';
    root.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>openSlotSheet(el.dataset.slot));
    return;
  }
  if(!roomsView.rack){
    const appbar=document.getElementById('appbar');
    if(appbar) appbar.innerHTML=`<button class="back-sm" id="rmBack" type="button">‹</button><h2>Комната ${roomsView.room}</h2>`;
    document.getElementById('rmBack').onclick=()=>{roomsView.room=null;renderRooms();};
    root.innerHTML=K.renderRoomPlan(roomsView.room, occ);
    root.querySelectorAll('[data-rk]').forEach(el=>el.onclick=()=>{roomsView.rack=el.dataset.rk;roomsView.side=el.dataset.sd;renderRooms();});
    return;
  }
  const appbar=document.getElementById('appbar');
  if(appbar) appbar.innerHTML=`<button class="back-sm" id="rmBack" type="button">‹</button><h2>Стеллаж ${roomsView.rack}</h2>`;
  document.getElementById('rmBack').onclick=()=>{roomsView.rack=null;renderRooms();};
  const col=(side)=>{
    const rows=Array.from({length:K.LINE_COUNT},(_,i)=>i+1).map(line=>{
      const code=K.formatSlot(roomsView.room, roomsView.rack, side, line);
      const items=occ.by[code]||[];
      const names=items.map(c=>c.name).join(', ');
      return `<div class="rack-rail${items.length?'':' empty'}" data-slot="${code}"><div class="ln">${line}</div><div class="hh">${items.length?K.escapeHtml(names):'пусто'}</div></div>`;
    }).join('');
    return `<div class="rack-col"><div class="rack-col-h">${K.SIDES[side]}</div>${rows}</div>`;
  };
  root.innerHTML=`<div class="rack-elev">${col('П')}${col('З')}</div>`;
  root.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>openSlotSheet(el.dataset.slot));
}
let whFilt='all';
function applyWhFilter(){
  document.querySelectorAll('#t-wh .cost-card').forEach(c=>{
    const st=c.dataset.whSt;
    c.style.display=(whFilt==='all'||st===whFilt)?'':'none';
  });
  document.querySelectorAll('[data-wh-f]').forEach(b=>b.classList.toggle('on',b.dataset.whF===whFilt));
}
function bindWhHeader(){
  const add=document.getElementById('whAddBtn');
  if(add) add.onclick=e=>{e.stopPropagation();openMCostumeModal();};
  const search=document.getElementById('whSearchBtn');
  if(search) search.onclick=()=>{
    const box=document.getElementById('whSearchBox');
    if(!box)return;
    box.hidden=!box.hidden;
    if(!box.hidden) document.getElementById('whSearch')?.focus();
  };
  const back=document.getElementById('whPickBack');
  if(back) back.onclick=()=>{pickMode=false;hideWhPick();setTab('new-order');};
}
document.getElementById('whRoomsGo')?.addEventListener('click',()=>{
  roomsFrom='wh'; roomsView={room:null,rack:null,side:null}; setTab('rooms');
});
document.querySelectorAll('[data-wh-f]').forEach(b=>b.addEventListener('click',()=>{
  whFilt=b.dataset.whF; applyWhFilter();
}));
document.getElementById('whSearch')?.addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();
  document.querySelectorAll('#t-wh .cost-card').forEach(c=>{
    const ok=!q || c.textContent.toLowerCase().includes(q);
    c.style.display=ok?'':'none';
  });
});

function renderCostGrid(){
  const e=K.escapeHtml;
  const grid=document.getElementById('costGrid');
  // Счётчики чипов — из реальных данных (раньше были зашиты в HTML демо-числами)
  const setC=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=n;};
  setC('whcAll',costumes.length);
  setC('whcAvail',costumes.filter(c=>c.st==='avail').length);
  setC('whcOut',costumes.filter(c=>c.st==='out').length);
  setC('whcRep',costumes.filter(c=>c.st==='rep').length);
  // Пустой склад — понятная заглушка вместо голого места под неверными числами
  if(!costumes.length){
    grid.innerHTML='<div class="wh-empty">Пока нет костюмов.<br>Нажмите «Добавить костюм», чтобы завести первый.</div>';
    return;
  }
  grid.innerHTML=costumes.map(c=>{
    const bc=c.st==='out'?'out':c.st==='rep'?'rep':'ok';
    const bl=c.st==='out'?'На прокате':c.st==='rep'?'Ремонт':`${c.avail} из ${c.total}`;
    return `<div class="cost-card" data-wh-st="${c.st}" data-t="${e(c.type)}" tabindex="0" role="button" aria-label="Костюм ${e(c.name)}" style="cursor:pointer">
      <span class="av-badge ${bc}">${bl}</span>
      <div class="c-art">${costumeThumb(c)}</div>
      <div class="c-name">${e(c.name)}</div>
      <div class="c-sizes">Разм. ${e(c.sizes)}</div>
      ${c.location?`<div class="c-sizes">${e(K.slotLabel(c.location))}</div>`:''}
      <div class="c-price">${e(c.price)} <small>сум/день</small></div>
    </div>`;
  }).join('');
}
renderCostGrid();
// Делегирование клика — переживает перерендер
document.getElementById('costGrid').addEventListener('click',e=>{
  if(pickMode)return;
  const card=e.target.closest('.cost-card');
  if(card)openMCostume(card.dataset.t);
});
document.getElementById('costGrid').addEventListener('keydown',e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  if(pickMode)return;
  const card=e.target.closest('.cost-card');
  if(card){ e.preventDefault(); openMCostume(card.dataset.t); }
});

function renderMPhotos(c){
  const host=document.getElementById('mcstPhotos');
  if(!host)return;
  const can=API.state.me?.role!=='employee';
  const photos=c.photos||[];
  const e=K.escapeHtml;
  host.innerHTML=photos.map(p=>`<div class="photo-cell"><img src="${e(p.url)}" alt="">${can?`<button type="button" class="x" data-ph-del="${e(p.id)}" aria-label="Удалить фото">×</button>`:''}</div>`).join('')
    +(can&&photos.length<10?`<button type="button" class="photo-add" id="mcstAddPh" aria-label="Добавить фото">+</button>`:'');
  host.querySelector('#mcstAddPh')?.addEventListener('click',()=>{
    if(!c.id){mToast('Сначала сохраните костюм','!');return;}
    const inp=document.createElement('input');
    inp.type='file'; inp.accept='image/jpeg,image/png,image/webp';
    inp.onchange=async()=>{
      const f=inp.files&&inp.files[0]; if(!f)return;
      if(f.size>3*1024*1024){mToast('Файл больше 3 МБ','!');return;}
      if(f.type && !/^image\/(jpeg|png|webp)$/i.test(f.type)){mToast('Только JPEG, PNG или WebP','!');return;}
      const btn=host.querySelector('#mcstAddPh');
      btn?.classList.add('loading');
      try{
        const ph=await API.Costumes.uploadPhoto(c.id,f);
        const row=costumes.find(x=>x.id===c.id)||c;
        row.photos=row.photos||[]; row.photos.push(ph); row.cover_url=row.photos[0].url;
        renderCostGrid(); openMCostume(c.type); mToast('Фото добавлено','✓');
      }catch(err){ mToast(err.message,'!'); }
      finally{ btn?.classList.remove('loading'); }
    };
    inp.click();
  });
  host.querySelectorAll('[data-ph-del]').forEach(b=>b.onclick=async ev=>{
    ev.stopPropagation();
    try{
      await API.Costumes.removePhoto(c.id,b.dataset.phDel);
      const row=costumes.find(x=>x.id===c.id)||c;
      row.photos=(row.photos||[]).filter(x=>x.id!==b.dataset.phDel);
      row.cover_url=row.photos[0]?.url||'';
      renderCostGrid(); openMCostume(c.type);
    }catch(err){ mToast(err.message,'!'); }
  });
}

function openMCostume(type){
  const c=costumes.find(x=>x.type===type);if(!c)return;
  document.getElementById('mcstArt').innerHTML=costumeThumb(c);
  renderMPhotos(c);
  document.getElementById('mcstName').textContent=c.name;
  const bc=c.st==='out'?'out':c.st==='rep'?'rep':'ok';
  const bl=c.st==='out'?'На прокате':c.st==='rep'?'Ремонт':'В наличии';
  document.getElementById('mcstStatus').innerHTML=`<span class="st ${c.st==='out'?'out':c.st==='rep'?'over':'build'}" style="font-size:10.5px">${bl}</span>`;
  document.getElementById('mcstSizes').textContent='размеры '+c.sizes;
  document.getElementById('mcstPrice').textContent=c.price+' сум/день';
  document.getElementById('mcstAvail').textContent=c.avail;
  document.getElementById('mcstOut').textContent=c.total-c.avail;
  document.getElementById('mcstTotal').textContent=c.total;
  const ords=orders.filter(o=>o.items?.includes(type)||o.lines?.some(l=>l.t===type));
  // Реальная выручка костюма: сумма по позициям заказов (цена/день × дни × кол-во),
  // а не выдуманное «кол-во заказов × цена × 2».
  const revenue=ords.reduce((sum,o)=>{
    const line=(o.lines||[]).find(l=>l.t===type);
    return line ? sum + (Number(line.pd)||0)*(o.days||1)*(line.qty||1) : sum;
  },0);
  document.getElementById('mcstRev').textContent=revenue?Math.round(revenue/1000)+' тыс':'0';
  document.getElementById('mcstFields').innerHTML=[
    ['Артикул',`CST-${type.toUpperCase()}`],
    ['Тип',c.name],
    ['Размеры',c.sizes],
    ['Цена/день',c.price+' сум'],
    ['Всего',c.total],
    ['Свободно',c.avail],
    ['Статус',bl],
  ].map(([k,v])=>`<div class="set-m-row"><span class="k">${K.escapeHtml(k)}</span><span class="v">${K.escapeHtml(String(v))}</span></div>`).join('')+
    `<div class="set-m-row" id="mcstLocRow" style="cursor:pointer"><span class="k">Где лежит</span><span class="v" style="color:var(--primary)">${K.escapeHtml(K.slotLabel(c.location)||'указать место')}</span></div>`;
  document.getElementById('mcstLocRow')?.addEventListener('click',()=>{
    if(API.state.me?.role==='employee')return;
    K.openLocPicker({
      current:c.location,
      items:costumes,
      onPick:async code=>{
        if(code===undefined)return;
        await placeCostume(c.type, code||'');
        openMCostume(type);
      }
    });
  });
  document.getElementById('mcstNote').textContent=c.note||'Костюм в хорошем состоянии. Регулярно стирается и отпаривается перед каждой выдачей.';
  document.getElementById('mcstOrdersCard').style.display=ords.length?'':'none';
  document.getElementById('mcstOrders').innerHTML=ords.map(o=>
    `<div class="set-m-row" data-mco-ord="${K.escapeHtml(o.id)}" style="cursor:pointer">
      <span class="k">№${K.escapeHtml(o.id)}<br><span style="font-size:11px">${K.escapeHtml(o.dt||'')}</span></span>
      <span class="v" style="text-align:right"><b>${K.escapeHtml(o.sm||o.sum||'')}</b><br><span style="font-size:11px">${K.escapeHtml(o.cl)}</span></span>
    </div>`).join('');
  document.querySelectorAll('[data-mco-ord]').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.mcoOrd)));
  document.getElementById('mcstEdit').onclick=e=>{e.stopPropagation();openMCostumeModal(type);};
  document.getElementById('mcstNew').onclick=e=>{
    e.stopPropagation();
    noState.items.push(cartItemFromCostume(c));
    noRenderItems?.();noRenderMoney?.();
    setTab('new-order');
    mToast(`«${c.name}» добавлен в заказ`,'✓');
  };
  document.getElementById('mcstDelete').onclick=async e=>{
    e.stopPropagation();
    const ok=await K.confirmDialog(`Удалить «${c.name}»?`,{title:'Удалить костюм',ok:'Удалить',danger:true});
    if(!ok)return;
    try{
      const costObj=costumes.find(x=>x.type===type);
      if(costObj?.id) await API.Costumes.remove(costObj.id);
      const i=costumes.findIndex(x=>x.type===type);
      if(i>=0){costumes.splice(i,1);renderCostGrid();setTab('wh');mToast('Костюм удалён','🗑');}
    }catch(err){mToast('Ошибка удаления: '+err.message,'!');}
  };
  setTab('costume');
}

function openMCostumeModal(editType){
  const exist=editType?costumes.find(x=>x.type===editType):null;
  const e=K.escapeHtml;
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>${exist?'Редактировать костюм':'Новый костюм'}</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Название</label><input id="mcmName2" placeholder="Бэтмен" value="${e(exist?.name||'')}" maxlength="60"></div>
      ${exist?`<div class="mf"><label>Артикул</label><input id="mcmType" value="${e(exist.type)}" readonly maxlength="20"></div>`:''}
      <div class="mf"><label>Цена/день, сум</label><input id="mcmPrice" inputmode="numeric" placeholder="85 000" value="${e(exist?.price||'')}" maxlength="20"></div>
      <div class="mf"><label>Размеры</label><input id="mcmSizes" placeholder="92, 98, 104" value="${e(exist?.sizes||'')}" maxlength="60"></div>
      <div class="mf"><label>Где лежит</label><input id="mcmLocation" placeholder="Полка A3" value="${e(exist?.location||'')}" maxlength="60"></div>
      <div class="mf-row">
        <div class="mf"><label>Всего</label><input id="mcmTotal" type="number" min="0" max="9999" inputmode="numeric" value="${e(exist?.total||1)}"></div>
        <div class="mf"><label>Свободно</label><input id="mcmAvail" type="number" min="0" max="9999" inputmode="numeric" value="${e(exist?.avail??1)}"></div>
      </div>
      <div class="mf"><label>Статус</label><div class="type-pick">
        <button type="button" data-cs="avail" class="${(!exist||exist.st==='avail')?'active':''}">✓ В наличии</button>
        <button type="button" data-cs="out" class="${exist?.st==='out'?'active':''}">🚀 На прокате</button>
        <button type="button" data-cs="rep" class="${exist?.st==='rep'?'active':''}">🔧 Ремонт</button>
      </div></div>
      <div class="mf"><label>Описание</label><textarea id="mcmNote2" rows="2" maxlength="500">${e(exist?.note||'')}</textarea></div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="mcmSave2">${exist?'Сохранить':'Создать'}</button></div>
  </div>`;
  document.body.appendChild(bg);
  let st=exist?.st||'avail';
  bg.querySelectorAll('.type-pick button').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.type-pick button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');st=b.dataset.cs;
  }));
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=ev=>{ if(ev.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',ev=>{if(ev.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  bg.querySelector('#mcmSave2').addEventListener('click',async ev=>{
    ev.stopPropagation();
    const name=bg.querySelector('#mcmName2').value.trim();
    if(!name){mToast('Введите название','!');return;}
    if(!exist){
      const dup=K.findSameName(costumes,name);
      if(dup){
        const open=await K.confirmDialog(`«${name}» уже есть на складе. Открыть карточку?`,{title:'Костюм уже есть',ok:'Открыть',cancel:'Создать ещё'});
        if(open){close(); openMCostume(dup.type); return;}
      }
    }
    const type=exist?.type || (bg.querySelector('#mcmType')?.value.trim()) || K.uniqueType(name,costumes);
    const saveBtn2=bg.querySelector('#mcmSave2'); saveBtn2.disabled=true; saveBtn2.textContent='Сохраняем…';
    const total=Math.max(0,Math.min(9999,+bg.querySelector('#mcmTotal').value||1));
    const avail=Math.max(0,Math.min(total,+bg.querySelector('#mcmAvail').value||0));
    const priceRaw=+bg.querySelector('#mcmPrice').value.replace(/\D/g,'')||0;
    const payload={name,type,price_per_day:priceRaw,sizes:bg.querySelector('#mcmSizes').value.trim()||'—',location:bg.querySelector('#mcmLocation').value.trim()||null,total,available:avail,status:st,note:bg.querySelector('#mcmNote2').value.trim()};
    try{
      if(exist && exist.id){
        const updated=await API.Costumes.update(exist.id,payload);
        const idx=costumes.findIndex(x=>x.id===exist.id);
        if(idx>=0)costumes[idx]=updated; else costumes.push(updated);
        renderCostGrid(); openMCostume(updated.type||type);
      }else{
        const created=await API.Costumes.create(payload);
        costumes.push(created); renderCostGrid();
      }
      close(); mToast(exist?'Костюм обновлён':'Костюм добавлен','✓');
    }catch(err){
      mToast('Ошибка: '+err.message,'!');
      saveBtn2.disabled=false; saveBtn2.textContent=exist?'Сохранить':'Создать';
    }
  });
  setTimeout(()=>bg.querySelector('#mcmName2')?.focus(),50);
}
document.getElementById('mAddCostume')?.addEventListener('click',e=>{e.stopPropagation();openMCostumeModal();});

// фильтр склада
document.querySelectorAll('.wh-filt .fchip').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.wh-filt .fchip').forEach(x=>x.classList.remove('on'));
    btn.classList.add('on');
    const f=btn.dataset.whF;
    document.querySelectorAll('.cost-card').forEach(c=>c.classList.toggle('hidden',!!f&&c.dataset.whSt!==f));
  };
});

// ===== Telegram (мобайл) =====
function renderTgTab(){
  // Статистика из реальных заказов
  const req=orders.filter(o=>o.st==='req').length;
  const active=orders.filter(o=>['book','conf','build','out'].includes(o.st)).length;
  const over=orders.filter(o=>o.st==='over').length;
  const reqEl=document.getElementById('tgStatReq');
  const actEl=document.getElementById('tgStatActive');
  const ovrEl=document.getElementById('tgStatOver');
  if(reqEl)reqEl.textContent=req;
  if(actEl)actEl.textContent=active;
  if(ovrEl)ovrEl.textContent=over;
  // Статус бота — пока интеграции нет, показываем «не подключён»
  const pill=document.getElementById('tgStatusPill');
  const lbl=document.getElementById('tgStatusLabel');
  const nameEl=document.getElementById('tgBotName');
  if(lbl)lbl.textContent='Бот не подключён';
  if(pill)pill.classList.remove('on');
  if(nameEl)nameEl.textContent='Настройте бота для получения сообщений';
  // Уведомления
  const e=K.escapeHtml;
  const notifList=document.getElementById('tgNotifList');
  if(notifList){
    notifList.innerHTML=mNotifs.length
      ?mNotifs.slice(0,20).map(n=>`
        <div class="card blk" style="margin-bottom:10px;cursor:pointer" data-notif-go="${e(n.id||'')}">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="font-size:22px;line-height:1;flex:none">${e(n.ic||'🔔')}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.5px;font-weight:600${n.unread?';color:var(--primary)':''}">${e(n.t)}</div>
              ${n.s?`<div style="font-size:12px;color:var(--ink-3);margin-top:2px">${e(n.s)}</div>`:''}
              ${n.time?`<div style="font-size:11px;color:var(--ink-3);margin-top:4px">${e(n.time)}</div>`:''}
            </div>
            ${n.unread?`<div style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex:none;margin-top:4px"></div>`:''}
          </div>
        </div>`).join('')
      :'<div style="text-align:center;padding:32px;color:var(--ink-3);font-size:13px">Уведомлений нет</div>';
    notifList.querySelectorAll('[data-notif-go]').forEach(el=>el.addEventListener('click',()=>{
      const n=mNotifs.find(x=>String(x.id)===el.dataset.notifGo);
      if(n?.go)n.go();
    }));
  }
}

// Кнопка настройки бота
document.getElementById('tgSetupBtn')?.addEventListener('click',()=>{
  mToast('Перейдите в Настройки → Уведомления','ℹ️');
  setTimeout(()=>setTab('settings'),600);
});

// ===== Команда (мобайл) =====
const ROLE_RU_TEAM={owner:'Владелец',admin:'Администратор',manager:'Менеджер',employee:'Сотрудник',courier:'Курьер',assembler:'Сборщик'};
const ROLE_ST_TEAM={owner:'out',admin:'conf',manager:'conf',employee:'book',courier:'req',assembler:'req'};
function renderTeamM(){
  const e=K.escapeHtml;
  const el=document.getElementById('teamMList');
  if(!el)return;
  const list=typeof finances!=='undefined'?finances.salaries:[];
  if(!list.length){
    el.innerHTML='<div style="text-align:center;padding:24px;color:var(--ink-3);font-size:13px">Загрузка...</div>';
    return;
  }
  el.innerHTML=list.map(m=>{
    const roleLabel=ROLE_RU_TEAM[m.role]||m.role||'Сотрудник';
    const roleSt=ROLE_ST_TEAM[m.role]||'req';
    const paidSum=(typeof finances!=='undefined'?finances.salaryLog:[])
      .filter(t=>(t.desc||'').includes(m.name))
      .reduce((s,t)=>s+Number(t.amount),0);
    return`<div class="cl-card" style="margin-bottom:10px">
      <div class="cl-top">
        <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(m.g)})">${e(m.av)}</div>
        <div style="flex:1">
          <div class="nm">${e(m.name)}</div>
          <span class="st ${roleSt}" style="margin-top:3px;display:inline-flex">${e(roleLabel)}</span>
        </div>
      </div>
      ${paidSum?`<div class="cl-stats"><div class="cl-stat"><div class="v">${K.fmtMoney(paidSum)}</div><div class="k">выплачено в мес.</div></div></div>`:''}
    </div>`;
  }).join('');
}
function openTeamMModal(){
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>Пригласить в команду</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Имя сотрудника</label><input id="tmmName" placeholder="Алишер Бектемиров" maxlength="80" autocomplete="name"></div>
      <div class="mf"><label>Роль</label><div class="type-pick"><button type="button" data-rl="manager">👔 Менеджер</button><button type="button" data-rl="employee" class="active">👤 Сотрудник</button></div></div>
      <div style="font-size:11.5px;color:var(--ink-3);line-height:1.5;background:var(--surface-2);padding:11px 13px;border-radius:11px">Сгенерируем ссылку-приглашение. Отправьте её сотруднику в Telegram, WhatsApp или любым другим способом. Ссылка действует 7 дней и одноразовая.</div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="tmmSave">Создать ссылку</button></div>
  </div>`;
  document.body.appendChild(bg);
  let role='employee';
  bg.querySelectorAll('.type-pick button').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.type-pick button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');role=b.dataset.rl;
  }));
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=ev=>{ if(ev.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',ev=>{if(ev.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  bg.querySelector('#tmmSave').addEventListener('click',async ev=>{
    ev.stopPropagation();
    const nameHint=bg.querySelector('#tmmName').value.trim();
    if(!nameHint){mToast('Введите имя сотрудника','!');return;}
    const saveBtn=bg.querySelector('#tmmSave');
    saveBtn.disabled=true;
    try{
      const r=await API.Team.invite({role,name_hint:nameHint});
      bg.querySelector('.modal-body').innerHTML=`
        <div class="mf"><label>Ссылка для сотрудника</label><input id="tmmLink" readonly value="${K.escapeHtml(r.url)}" style="width:100%"></div>
        <div style="font-size:11.5px;color:var(--ink-3);line-height:1.5;background:var(--surface-2);padding:11px 13px;border-radius:11px">Отправьте эту ссылку сотруднику. Она действует 7 дней и станет недействительной после первого использования.</div>`;
      bg.querySelector('.modal-ft').innerHTML=`<button class="btn ghost" id="tmmCopy" type="button">Копировать</button><button class="btn" id="tmmShare" type="button">Поделиться</button><button class="btn ghost" id="tmmDone" type="button">Готово</button>`;
      bg.querySelector('#tmmCopy').addEventListener('click',async()=>{
        try{ await navigator.clipboard.writeText(r.url); mToast('Ссылка скопирована','📋'); }
        catch{ const inp=bg.querySelector('#tmmLink'); inp.focus(); inp.select(); mToast('Ссылка выделена — скопируйте вручную','!'); }
      });
      bg.querySelector('#tmmShare').addEventListener('click',async()=>{
        if(navigator.share){
          try{ await navigator.share({title:'Приглашение в Rento',text:`${nameHint}, приглашение в Rento`,url:r.url}); }
          catch(err){ if(err?.name!=='AbortError') mToast('Не удалось поделиться','!'); }
        }else{
          try{ await navigator.clipboard.writeText(r.url); mToast('Ссылка скопирована','📋'); }
          catch{ const inp=bg.querySelector('#tmmLink'); inp.focus(); inp.select(); mToast('Ссылка выделена — скопируйте вручную','!'); }
        }
      });
      bg.querySelector('#tmmDone').addEventListener('click',close);
    }catch(err){
      mToast(err.message||'Не удалось создать ссылку','!');
      saveBtn.disabled=false;
    }
  });
  setTimeout(()=>bg.querySelector('#tmmName')?.focus(),50);
}
document.getElementById('mAddTeam')?.addEventListener('click',e=>{e.stopPropagation();openTeamMModal();});

// ===== Настройки (мобайл) =====
const setMData={
  shop:[
    {k:'Название',    v:'RENTO', type:'text', ph:'Название проката'},
    {k:'Адрес',       v:'',       type:'text', ph:'Ташкент, ул. …'},
    {k:'Телефон',     v:'',  type:'tel',  ph:'+998 90 000-00-00'},
    {k:'Часы работы', v:'10:00–20:00',        type:'text', ph:'09:00–18:00'},
  ],
  price:[
    {k:'Мин. аренда',     v:'1 день',       type:'text', ph:'1 день'},
    {k:'Залог',           v:'50% от суммы', type:'text', ph:'50% от суммы'},
    {k:'Штраф просрочки', v:'+20%/день',    type:'text', ph:'+20%/день'},
  ],
  notif:[
    {k:'Новый заказ',    v:'on'},
    {k:'Просрочка',      v:'on'},
    {k:'Запрос из бота', v:'on'},
    {k:'Ежедн. отчёт',  v:'off'},
  ],
};
const SET_IDS={shop:'setMShop',price:'setMPrice',notif:'setMNotif'};
const setEditing={shop:false,price:false};

function renderSetSec(sec){
  const e=K.escapeHtml;
  const editing=setEditing[sec];
  document.getElementById(SET_IDS[sec]).innerHTML=setMData[sec].map((row,i)=>{
    const isToggle=row.v==='on'||row.v==='off';
    if(isToggle)
      return `<div class="set-m-row"><span class="k">${e(row.k)}</span><div class="m-toggle${row.v==='off'?' off':''}"></div></div>`;
    if(editing)
      return `<div class="set-m-row"><span class="k">${e(row.k)}</span><input class="set-m-inp" type="${row.type||'text'}" value="${e(row.v)}" placeholder="${e(row.ph||row.v)}" data-si="${i}"></div>`;
    return `<div class="set-m-row"><span class="k">${e(row.k)}</span><span class="v">${e(row.v)}</span></div>`;
  }).join('');
  const btn=document.querySelector(`.set-edit-btn[data-sec="${sec}"]`);
  if(btn)btn.textContent=editing?'✕ Отмена':'✎ Изменить';
}
['shop','price','notif'].forEach(sec=>renderSetSec(sec));

// ===== Календарь (мобайл) =====
// Источник — заказы с сервера. Заполняется buildCalEvs()/loadCalMonth()
// в ISO-формате {issue_date,return_date}; пустой до загрузки.
const mCalEvs=[];
const mCalStL={build:'Сборка',conf:'Подтверждён',out:'Выдан',over:'Просрочка',req:'Запрос'};
const mCalDotC={build:'#2D7A52',conf:'#2D7A52',out:'#1A6060',over:'#C0392B',req:'#8B6200'};
// Главный календарь (страница "Календарь") — отдельные переменные, чтобы не конфликтовать
// с мини-календарём на странице заказов (mCalY/mCalM).
let mainCalY=K.TODAY.y, mainCalM=K.TODAY.m, mCalSel=K.TODAY.d;

function mCalEventsOnDay(y,m,d){
  const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return mCalEvs.filter(e=>e.issue_date<=iso&&e.return_date>=iso);
}
async function loadCalMonth(y,m){
  if(y===K.TODAY.y&&m===K.TODAY.m){buildCalEvs();return;}
  try{
    const r=await API.api(`/calendar?year=${y}&month=${m+1}`);
    mCalEvs.length=0;
    (r.items||[]).forEach(o=>mCalEvs.push({
      id:String(o.number),name:o.client_name||'—',
      issue_date:o.issue_date,return_date:o.return_date,st:o.status
    }));
  }catch(_){}
}
function renderMCalGrid(){
  const cells=K.buildMonthGrid(mainCalY,mainCalM);
  const titleEl=document.querySelector('.cal-m-mname');
  if(titleEl)titleEl.textContent=`${K.MONTHS[mainCalM]} ${mainCalY}`;
  let h='<div class="mcal-dow">'+K.DOW_SHORT_MON_FIRST.map(d=>`<div class="mcal-dc">${d}</div>`).join('')+'</div><div class="mcal-days">';
  cells.forEach(cell=>{
    const {d,inMonth,isToday}=cell;
    const sel=inMonth&&d===mCalSel;
    const evs=inMonth?mCalEventsOnDay(mainCalY,mainCalM,d):[];
    const dots=evs.slice(0,3).map(e=>`<span class="mcal-dot ${e.st}"></span>`).join('');
    h+=`<div class="mcal-day${inMonth?'':' other'}${isToday?' today':''}${sel?' sel':''}"${inMonth?` data-d="${d}"`:''}>
      <span class="mcal-dn">${inMonth?d:''}</span><div class="mcal-dots">${dots}</div></div>`;
  });
  h+='</div>';
  document.getElementById('mCalGrid').innerHTML=h;
  document.querySelectorAll('#mCalGrid .mcal-day[data-d]').forEach(c=>c.addEventListener('click',()=>mCalPick(+c.dataset.d)));
  mCalListPaint();
}
function mCalPick(d){
  mCalSel=d;
  document.querySelectorAll('.mcal-day[data-d]').forEach(c=>c.classList.toggle('sel',+c.dataset.d===d));
  mCalListPaint();
}
function mCalListPaint(){
  const evs=mCalSel?mCalEventsOnDay(mainCalY,mainCalM,mCalSel):[];
  const dayLabel=mCalSel?`${mCalSel} ${K.MONTHS_GEN[mainCalM]} ${mainCalY}`:`${K.MONTHS[mainCalM]} ${mainCalY}`;
  document.getElementById('mCalList').innerHTML=
    `<div class="sec-title" style="padding:14px 20px 8px">${dayLabel}</div>`+
    (evs.length
      ?evs.map(e=>`<div class="card blk mcal-item" data-oid="${K.escapeHtml(e.id)}"><div class="mcal-dot2" style="background:${mCalDotC[e.st]||'var(--primary)'}"></div><div style="flex:1"><div class="nm">${K.escapeHtml(e.name)} · №${K.escapeHtml(e.id)}</div><div style="font-size:11px;color:var(--ink-3);margin-top:2px">${K.escapeHtml(mCalStL[e.st]||e.st)} · ${API.fmt.dateRange(e.issue_date,e.return_date)}</div></div><span class="st ${K.escapeHtml(e.st)}">${K.escapeHtml(mCalStL[e.st]||e.st)}</span></div>`).join('')
      :'<div style="text-align:center;padding:24px;color:var(--ink-3);font-size:13px">Нет заказов</div>');
}
renderMCalGrid();
// Кнопки prev/next в мобильном календаре
(function bindMCalNav(){
  const navs=document.querySelectorAll('.cal-m-nav');
  if(navs.length<2)return;
  navs[0].setAttribute('aria-label','Предыдущий месяц');
  navs[1].setAttribute('aria-label','Следующий месяц');
  navs[0].addEventListener('click',async()=>{
    mainCalM--; if(mainCalM<0){mainCalM=11; mainCalY--;}
    mCalSel=null; await loadCalMonth(mainCalY,mainCalM); renderMCalGrid();
  });
  navs[1].addEventListener('click',async()=>{
    mainCalM++; if(mainCalM>11){mainCalM=0; mainCalY++;}
    mCalSel=null; await loadCalMonth(mainCalY,mainCalM); renderMCalGrid();
  });
})();
window.mCalPick=mCalPick; // обратная совместимость

// клик по аватарке МК на главной → профиль
document.querySelectorAll('.home-greet .av-btn, .more-user').forEach(el=>el.addEventListener('click',()=>setTab('profile')));

// ===== Toast =====
function mToast(msg,icon='✓'){
  let t=document.querySelector('.toast');
  if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}
  t.innerHTML=`<span class="ic">${K.escapeHtml(icon)}</span>${K.escapeHtml(msg)}`;
  requestAnimationFrame(()=>t.classList.add('on'));
  clearTimeout(t._h);
  t._h=setTimeout(()=>t.classList.remove('on'),2200);
}
window.mToast=mToast;

document.getElementById('prfMLogout')?.addEventListener('click',async e=>{
  e.stopPropagation();
  const ok=await K.confirmDialog('Выйти из аккаунта?',{title:'Выход',ok:'Выйти',danger:true});
  if(!ok)return;
  try{ await API.Auth.logout(); }      // реальный выход: сбрасывает сессию и уводит на логин
  catch(_){ location.replace('/login.html'); }
});
document.getElementById('prfMEdit')?.addEventListener('click',e=>{e.stopPropagation();mToast('Редактирование (демо)','✎');});

// Смена пароля — модал + реальный вызов /auth/change-password
function openChangePwModal(){
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>Смена пароля</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Текущий пароль</label><input id="cpCur" type="password" autocomplete="current-password" maxlength="100"></div>
      <div class="mf"><label>Новый пароль <span style="color:var(--ink-3);font-weight:400">— минимум 8 символов</span></label><input id="cpNew" type="password" autocomplete="new-password" maxlength="100"></div>
      <div class="mf"><label>Повторите новый пароль</label><input id="cpNew2" type="password" autocomplete="new-password" maxlength="100"></div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="cpSave">Сменить пароль</button></div>
  </div>`;
  document.body.appendChild(bg);
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=ev=>{ if(ev.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',ev=>{ if(ev.target===bg)close(); });
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  bg.querySelector('#cpSave').addEventListener('click',async()=>{
    const cur=bg.querySelector('#cpCur').value;
    const next=bg.querySelector('#cpNew').value;
    const next2=bg.querySelector('#cpNew2').value;
    if(!cur||!next){mToast('Заполните все поля','!');return;}
    if(next.length<8){mToast('Новый пароль — минимум 8 символов','!');return;}
    if(next!==next2){mToast('Пароли не совпадают','!');return;}
    const btn=bg.querySelector('#cpSave'); btn.disabled=true; btn.textContent='Меняем…';
    try{
      await API.api('/auth/change-password',{method:'POST',body:{current:cur,next}});
      mToast('Пароль изменён ✓','✓');
      close();
    }catch(err){
      mToast('Ошибка: '+(err?.message||'не удалось'),'!');
      btn.disabled=false; btn.textContent='Сменить пароль';
    }
  });
  setTimeout(()=>bg.querySelector('#cpCur')?.focus(),50);
}
document.getElementById('prfChangePw')?.addEventListener('click',e=>{e.stopPropagation();openChangePwModal();});

// Выйти со всех устройств (мобайл)
document.getElementById('prfMLogoutAll')?.addEventListener('click',async e=>{
  e.stopPropagation();
  const ok=await K.confirmDialog('Завершить сессии на всех других устройствах? Текущая останется активной.',{title:'Выйти везде',ok:'Выйти везде',danger:true});
  if(!ok)return;
  try{ await API.api('/auth/logout-all',{method:'POST'}); mToast('Другие сессии завершены ✓','✓'); }
  catch(err){ mToast('Ошибка: '+(err?.message||'не удалось'),'!'); }
});

// ===== Профиль (мобайл) — реальные данные, кроме демо «Карнавал» =====
// Метрики сборщицы (мобайл): полнота/вовремя/⭐. null → «нет данных».
async function renderMAssemblerStats(bodyEl, userId){
  if(!bodyEl)return;
  bodyEl.innerHTML='<div class="set-m-row"><span class="k">Загрузка…</span></div>';
  let s;
  try{ s=await API.Team.stats(userId); }
  catch(e){ bodyEl.innerHTML='<div class="set-m-row"><span class="k">Нет доступа</span></div>'; return; }
  const pct=(v)=> v==null?'нет данных':`${v}%`;
  const rating= s.avg_rating!=null ? `${Number(s.avg_rating).toFixed(1)} ⭐ (${s.ratings_count})` : 'нет оценок';
  bodyEl.innerHTML=`
    <div class="set-m-row"><span class="k">Собрано заказов</span><span class="v">${s.orders_done}</span></div>
    <div class="set-m-row"><span class="k">Полнота сборки</span><span class="v">${K.escapeHtml(pct(s.assembled_pct))}</span></div>
    <div class="set-m-row"><span class="k">Выдано вовремя</span><span class="v">${K.escapeHtml(pct(s.ontime_pct))}</span></div>
    <div class="set-m-row"><span class="k">Средняя оценка</span><span class="v">${K.escapeHtml(rating)}</span></div>`;
}

function renderMProfile(me){
  if(!me || me.tenant_slug==='karnaval') return; // демо — витрина
  const setT=(id,v)=>{const el=document.getElementById(id); if(el)el.textContent=(v==null||v==='')?'—':v;};
  setT('mPrfName',me.name);
  const roleLabels={owner:'Владелец проката',manager:'Менеджер',employee:'Сотрудник'};
  let sub=roleLabels[me.role]||me.role;
  const created=Date.parse(me.created_at||'');
  if(created){ sub+=' · с '+new Date(created).toLocaleDateString('ru-RU'); }
  setT('mPrfSub',sub);
  const totalRevenue=(orders||[]).reduce((s,o)=>s+(Number(o.sum_raw||o.sum)||0),0);
  setT('mPrfOrders',(orders||[]).length);
  setT('mPrfRevenue',API.fmt.moneyShort(totalRevenue));
  setT('mPrfClients',(mClients||[]).length);
  if(created){ setT('mPrfDays',Math.max(0,Math.floor((Date.now()-created)/86400000))); }
  setT('mPrfEmail',me.email);
  setT('mPrfPhone',me.phone);
  setT('mPrfTg',me.telegram);
  setT('mPrfBd',me.birthday);
  // Показатели сборки — для сотрудниц/менеджеров.
  if(me.role==='employee'||me.role==='manager'){
    const card=document.getElementById('mPrfAssemblerCard');
    if(card)card.style.display='';
    renderMAssemblerStats(document.getElementById('mPrfAssemblerBody'), me.id);
  }
  // Мини-карточка профиля во вкладке «Ещё» (была статичной: Малика К. · «Карнавал»)
  setT('moreName',me.name);
  setT('moreSub',sub);
  setT('moreVer',`Rento · ${me.tenant_name||'прокат'} · v1.0`);
  const moreAv=document.getElementById('moreAv');
  if(moreAv){
    if(me.avatar_text)moreAv.textContent=me.avatar_text;
    if(me.gradient)moreAv.style.background=`linear-gradient(135deg,${me.gradient})`;
  }
}

// ===== Деньги (мобайл) — реальные данные, кроме демо «Карнавал» =====
function renderMMoney(summary, transactions, me){
  if(!me || me.tenant_slug==='karnaval') return; // демо — витрина
  const setT=(id,v)=>{const el=document.getElementById(id); if(el)el.textContent=v;};
  const {income,expense}=API.calc.monthMoney(summary);
  const monthsNom=K.MONTHS;
  const cap=document.getElementById('mMoneyCap');
  if(cap){ const svg=cap.querySelector('svg'); cap.textContent='Финансы · '+monthsNom[K.TODAY.m]+' '+K.TODAY.y; if(svg)cap.prepend(svg); }
  const inM=income>=1000000;
  setT('mMoneyBig', inM?(income/1000000).toFixed(1).replace('.0','').replace('.',','):String(Math.round(income/1000)));
  setT('mMoneyUnit', inM?'млн сум':'тыс сум');
  const prevInc=API.calc.prevMonthIncome(summary,new Date(K.TODAY.y,K.TODAY.m,1));
  const deltaEl=document.getElementById('mMoneyDelta');
  if(deltaEl){
    if(!income||prevInc<=0){deltaEl.style.display='none';}
    else{ const pct=Math.round((income-prevInc)/prevInc*100); deltaEl.style.display=''; deltaEl.textContent=(pct>=0?'↑':'↓')+Math.abs(pct)+'%'; }
  }
  setT('mMoneyExp',API.fmt.moneyShort(expense));
  setT('mMoneyProfit',API.fmt.moneyShort(income-expense));
  const renderCats=(el,type,color)=>{
    const cats=API.calc.categoryShare(summary,type);
    const max=cats.reduce((m,c)=>Math.max(m,c.total),0)||1;
    el.innerHTML=cats.length?cats.map(c=>`<div class="cat-m"><span class="cat-mn">${K.escapeHtml(c.name)}</span><div class="cat-mb"><div class="cat-mf" style="width:${Math.round(c.total/max*100)}%;background:${color}"></div></div><span class="cat-mv">${API.fmt.moneyShort(c.total)}</span></div>`).join('')
      :'<div style="text-align:center;padding:16px;color:var(--ink-3);font-size:12.5px">Нет данных</div>';
  };
  const incEl=document.getElementById('mMoneyIncomeCats'); if(incEl)renderCats(incEl,'income','var(--green)');
  const expEl=document.getElementById('mMoneyExpenseCats'); if(expEl)renderCats(expEl,'expense','var(--red)');
  const payEl=document.getElementById('mMoneyPayments');
  if(payEl){
    const txns=(transactions||[]).slice(0,8);
    payEl.innerHTML=txns.length?txns.map(t=>{
      const isIn=t.type==='income';
      const amt=(isIn?'+':'−')+API.fmt.money(Math.abs(Number(t.amount)||0));
      return `<div class="txn-m"><div class="txn-mi ${isIn?'in':'out'}">${isIn?'↓':'↑'}</div><div class="txn-mm"><div class="nm">${K.escapeHtml(t.desc||t.category||'Платёж')}</div><div class="ds">${K.escapeHtml((t.dateShort||'')+(t.pm?' · '+t.pm:''))}</div></div><div class="txn-ma ${isIn?'in':'out'}">${K.escapeHtml(amt)}</div></div>`;
    }).join('')
    :'<div style="text-align:center;padding:16px;color:var(--ink-3);font-size:12.5px">Платежей пока нет</div>';
  }
}

// ===== Уведомления (мобайл) =====
const mNotifs=[];
function openMNotifs(){
  const sheet=document.createElement('div');
  sheet.className='notif-sheet';
  sheet.innerHTML=`<div class="nb-card">
    <div class="nh"><h3>Уведомления</h3><span class="lnk" data-mark-all>Прочитать все</span></div>
    <div class="nbody" id="mNotifBody"></div>
  </div>`;
  document.body.appendChild(sheet);
  function render(){
    const e=K.escapeHtml;
    document.getElementById('mNotifBody').innerHTML=mNotifs.length?mNotifs.map((n,i)=>
      `<div class="notif-row ${n.unread?'unread':''}" data-mn="${i}">
        <div class="nico" style="background:${n.bg};color:${n.cl}">${e(n.ic)}</div>
        <div class="nbody2"><div class="t">${e(n.t)}</div><div class="s">${e(n.s)}</div></div>
        <div class="ntime">${e(n.time)}</div>
      </div>`).join('')
      :'<div style="text-align:center;padding:32px;color:var(--ink-3);font-size:13px">Новых уведомлений нет</div>';
  }
  render();
  sheet.addEventListener('click',e=>{
    if(e.target===sheet){sheet.remove();document.removeEventListener('keydown',onKey);return;}
    if(e.target.closest('[data-mark-all]')){
      mNotifs.forEach(n=>n.unread=0);render();updateMBellDot();
      API.api('/notifications/mark-read',{method:'POST',body:{}}).catch(()=>{});
      return;
    }
    const row=e.target.closest('[data-mn]');
    if(row){const n=mNotifs[+row.dataset.mn];n.unread=0;sheet.remove();document.removeEventListener('keydown',onKey);updateMBellDot();n.go?.();}
  });
  const onKey=e=>{if(e.key==='Escape'){sheet.remove();document.removeEventListener('keydown',onKey);}};
  document.addEventListener('keydown',onKey);
}
function updateMBellDot(){
  document.querySelectorAll('.bell .dot').forEach(d=>d.style.display=mNotifs.some(n=>n.unread)?'':'none');
}
document.addEventListener('click',e=>{
  if(e.target.closest('.bell, .home-top .bell, #homeTop .bell')){e.stopPropagation();openMNotifs();}
});
updateMBellDot();

// ===== Карточка заказа: тосты =====
// (Печать и «Написать клиенту» имеют собственные обработчики по id в openOrder —
//  отдельный делегированный блок убран, чтобы не дублировать тосты.)

// ===== Настройки: sticky save =====
const setMBar=document.createElement('div');
setMBar.id='setMBar';
setMBar.style.cssText='position:sticky;bottom:80px;background:var(--surface);border:1px solid var(--line);padding:11px 14px;display:none;gap:9px;margin:14px 0 0;border-radius:14px;box-shadow:0 -4px 18px rgba(0,0,0,.07);z-index:8';
setMBar.innerHTML='<button class="btn ghost" id="setMCancel" style="flex:1">Отменить</button><button class="btn" id="setMSave" style="flex:1">Сохранить</button>';
document.getElementById('t-settings')?.appendChild(setMBar);

// Делегированный клик по всей секции настроек
document.getElementById('t-settings').addEventListener('click',e=>{
  // кнопка редактирования секции
  const editBtn=e.target.closest('.set-edit-btn');
  if(editBtn){
    const sec=editBtn.dataset.sec;
    setEditing[sec]=!setEditing[sec];
    renderSetSec(sec);
    if(setEditing[sec]){
      setMBar.style.display='flex';
      setTimeout(()=>document.querySelector(`#${SET_IDS[sec]} .set-m-inp`)?.focus(),60);
    }
    return;
  }
  // переключатель уведомлений
  if(e.target.closest('.m-toggle'))setMBar.style.display='flex';
});

// Показывать save-bar при вводе в поля
document.getElementById('t-settings').addEventListener('input',e=>{
  if(e.target.classList.contains('set-m-inp'))setMBar.style.display='flex';
});

document.getElementById('setMSave')?.addEventListener('click',async ()=>{
  ['shop','price'].forEach(sec=>{
    if(!setEditing[sec])return;
    document.querySelectorAll(`#${SET_IDS[sec]} .set-m-inp`).forEach(inp=>{
      const i=+inp.dataset.si;
      const val=inp.value.trim();
      if(val)setMData[sec][i].v=val;
    });
    setEditing[sec]=false;
    renderSetSec(sec);
  });
  setMBar.style.display='none';
  try{
    const pInt=(s)=>{const n=parseInt(String(s).replace(/[^\d]/g,''),10);return Number.isFinite(n)?n:null;};
    await API.api('/settings',{method:'PUT',body:{
      shop_name:  setMData.shop[0].v,
      address:    setMData.shop[1].v,
      phone:      setMData.shop[2].v,
      work_hours: setMData.shop[3].v,
      min_rent_days:    pInt(setMData.price[0].v),
      deposit_pct:      pInt(setMData.price[1].v),
      fine_pct_per_day: pInt(setMData.price[2].v),
      notif_new_order:    setMData.notif[0].v==='on',
      notif_overdue:      setMData.notif[1].v==='on',
      notif_telegram:     setMData.notif[2].v==='on',
      notif_daily_report: setMData.notif[3].v==='on',
    }});
    mToast('Настройки сохранены','✓');
  }catch(err){
    mToast('Ошибка сохранения: '+err.message,'!');
  }
});
document.getElementById('setMCancel')?.addEventListener('click',()=>{
  ['shop','price'].forEach(sec=>{
    if(!setEditing[sec])return;
    setEditing[sec]=false;
    renderSetSec(sec);
  });
  setMBar.style.display='none';
});

// Обработчик «глаза» живёт в ui.js — здесь не дублируем

// ===== Контроль финансов =====
const finances = {
  salaries:[], // список сотрудников из /team (без сумм)
  salaryLog:[], // транзакции зарплат текущего месяца
  fixed:[],
  oneoff:[],
};

function renderFinance(){
  const e=K.escapeHtml;
  const fmtM=K.fmtMoney;
  const salaryTotal=finances.salaryLog.reduce((s,t)=>s+Number(t.amount),0);
  const fixedTotal=finances.fixed.reduce((s,x)=>s+x.amount,0);
  const oneoffTotal=finances.oneoff.reduce((s,x)=>s+x.amount,0);
  const total=salaryTotal+fixedTotal+oneoffTotal;
  const monthName=K.MONTHS[K.TODAY.m]||'';

  // Hero
  document.getElementById('finHero').innerHTML=
    `<div class="cap">💸 Расходы · ${monthName} ${K.TODAY.y}</div>`+
    `<div class="big u">${Math.round(total/1000)} <small>тыс сум</small></div>`+
    `<div class="hero-pills">`+
      `<div class="hero-pill"><div class="k">Зарплаты</div><div class="v" style="color:#F97B72">${Math.round(salaryTotal/1000)} тыс</div></div>`+
      `<div class="hero-pill"><div class="k">Расходы</div><div class="v" style="color:#F97B72">${Math.round((fixedTotal+oneoffTotal)/1000)} тыс</div></div>`+
    `</div>`;

  // Зарплаты — журнал выплат
  const ROLE_RU={owner:'Владелец',admin:'Администратор',manager:'Менеджер',employee:'Сотрудник',courier:'Курьер',assembler:'Сборщик'};
  document.getElementById('finSalaries').innerHTML=finances.salaries.map((s,i)=>{
    const roleLabel=ROLE_RU[s.role]||s.role||'Сотрудник';
    const txList=finances.salaryLog.filter(t=>(t.desc||'').includes(s.name));
    const paidSum=txList.reduce((sum,t)=>sum+Number(t.amount),0);
    const subLine=paidSum
      ?`выплачено ${fmtM(paidSum)} сум${txList.length>1?` · ${txList.length} раза`:''}`
      :'выплат нет';
    return`<div class="fin-row">
      <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(s.g)});width:38px;height:38px;border-radius:12px;font-size:12px;flex:none">${e(s.av)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600">${e(s.name)}</div>
        <div style="font-size:11.5px;color:${paidSum?'var(--ink-3)':'var(--ink-4,var(--ink-3))'}">${e(roleLabel)} · ${subLine}</div>
      </div>
      <button class="fin-pay-btn" data-fsi="${i}" data-name="${e(s.name)}" style="flex:none">Выплатить</button>
    </div>`;
  }).join('')||'<div style="text-align:center;padding:18px;color:var(--ink-3);font-size:13px">Нет сотрудников</div>';

  // Постоянные расходы
  document.getElementById('finFixed').innerHTML=finances.fixed.map((f,i)=>
    `<div class="fin-row fin-row-tap" data-ffi="${i}">
      <div class="fin-ico">${f.ic}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600">${e(f.cat)}</div>
        <div style="font-size:11.5px;color:var(--ink-3)">${e(f.period)} · ${e(f.due)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex:none">
        <div style="font-size:13.5px;font-weight:700">${fmtM(f.amount)}</div>
        <svg width="14" height="14" fill="none" stroke="var(--ink-3)" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </div>
    </div>`).join('')||'<div style="text-align:center;padding:18px;color:var(--ink-3);font-size:13px">Постоянных расходов пока нет</div>';

  // Разовые расходы
  document.getElementById('finOneoff').innerHTML=finances.oneoff.length
    ?finances.oneoff.map((x,i)=>
      `<div class="fin-row">
        <div class="fin-ico">${x.ic}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13.5px;font-weight:600">${e(x.cat)}</div>
          <div style="font-size:11.5px;color:var(--ink-3)">${e(x.date)}${x.note?` · ${e(x.note)}`:''}</div>
        </div>
        <div style="font-size:13.5px;font-weight:700;color:var(--red);flex:none">−${fmtM(x.amount)}</div>
      </div>`).join('')
    :'<div style="text-align:center;padding:18px;color:var(--ink-3);font-size:13px">Нет расходов за этот период</div>';
}

// Клик "Выплатить" зарплату — открывает модал с формой
document.getElementById('finSalaries').addEventListener('click',e=>{
  const btn=e.target.closest('.fin-pay-btn');
  if(!btn)return;
  openSalaryPayModal(btn.dataset.name||'');
});

// Перезагрузка данных с сервера + перерисовка (после операций, влияющих на несколько разделов).
async function mReloadAll(){
  const s=await API.loadAll();
  orders.length=0; orders.push(...s.orders);
  mClients.length=0; mClients.push(...s.clients);
  renderMOrders(); renderMClients(); renderMOrdNear(); renderMOrdMiniCal();
  renderHomeHero(s.summary); renderHomeStats(s.stats); renderHomeQueue(); renderHomeBookings();
  renderMMoney(s.summary, s.transactions, API.state.me);
  renderMProfile(API.state.me);
  buildCalEvs(); renderMCalGrid();
  if(API.state.me && !API.calc.isDemoTenant(API.state.me)){
    mNotifs.length=0; mNotifs.push(...adaptNotifs(s.notifications||[])); updateMBellDot();
  }
}

// Приём оплаты по заказу (мобайл): создаёт доход, обновляет долг и «Деньги».
function openMPayModal(o){
  const rem=Math.round(o.remaining!=null?o.remaining:Math.max(0,(o.total_raw||0)-(o.paidAmount||0)));
  const paid=Math.round(o.paidAmount||0);
  const tot=Math.round(o.total_raw||0);
  const bg=document.createElement('div');
  bg.className='modal-bg'; bg.setAttribute('role','dialog'); bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card pay-sheet">
    <div class="modal-hd"><h3>Оплата №${K.escapeHtml(o.id)}</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div id="mPayErr" class="pay-err" hidden></div>
      <div class="pay-hero"><div class="pay-k">К оплате</div><div class="pay-big">${K.fmtMoney(rem)} <small>сум</small></div>
        <div class="pay-sub">заказ ${K.fmtMoney(tot)}${paid?` · уже ${K.fmtMoney(paid)}`:''}</div></div>
      <div class="pay-chips">
        <button type="button" class="pay-chip on" data-amt="${rem}">Всё</button>
        ${rem>1?`<button type="button" class="pay-chip" data-amt="${Math.round(rem/2)}">Половина</button>`:''}
      </div>
      <div class="mf"><label>Сумма, сум</label><input id="mPayAmount" class="inp pay-inp" type="text" inputmode="numeric" value="${K.fmtMoney(rem)}"></div>
      <div class="pay-methods" id="mPayMethods">
        <button type="button" class="pay-method on" data-m="Наличные">Нал</button>
        <button type="button" class="pay-method" data-m="Карта">Карта</button>
        <button type="button" class="pay-method" data-m="Перевод">Перевод</button>
      </div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="mPaySave">Принять ${K.fmtMoney(rem)}</button></div>
  </div>`;
  document.body.appendChild(bg);
  const close=()=>{bg.remove();document.removeEventListener('keydown',onKey);};
  const onKey=ev=>{if(ev.key==='Escape')close();};
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',ev=>{if(ev.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const amtEl=bg.querySelector('#mPayAmount');
  const save=bg.querySelector('#mPaySave');
  const err=bg.querySelector('#mPayErr');
  let method='Наличные';
  const readAmt=()=>Math.round(Number(String(amtEl.value).replace(/\D/g,''))||0);
  const paintAmt=()=>{ const n=readAmt(); save.textContent=n?`Принять ${K.fmtMoney(n)}`:'Принять оплату'; };
  bg.querySelectorAll('.pay-chip').forEach(c=>c.addEventListener('click',()=>{
    bg.querySelectorAll('.pay-chip').forEach(x=>x.classList.toggle('on',x===c));
    amtEl.value=K.fmtMoney(+c.dataset.amt); paintAmt();
  }));
  bg.querySelector('#mPayMethods').addEventListener('click',e=>{
    const b=e.target.closest('[data-m]'); if(!b)return;
    bg.querySelectorAll('.pay-method').forEach(x=>x.classList.toggle('on',x===b));
    method=b.dataset.m;
  });
  amtEl.addEventListener('input',()=>{
    const n=readAmt(); amtEl.value=n?K.fmtMoney(n):'';
    bg.querySelectorAll('.pay-chip').forEach(x=>x.classList.toggle('on',+x.dataset.amt===n));
    paintAmt();
  });
  save.addEventListener('click',async ev=>{
    ev.stopPropagation(); err.hidden=true;
    const amount=readAmt();
    if(!amount){err.textContent='Введите сумму'; err.hidden=false; return;}
    if(amount>rem){err.textContent=`Остаток ${K.fmtMoney(rem)}`; err.hidden=false; return;}
    save.disabled=true; save.textContent='Сохраняем…';
    try{
      await API.Orders.pay(o.uuid, amount, method);
      close(); mToast('Оплата принята','✓');
      await mReloadAll();
      openOrder(o.id);
    }catch(er){
      err.textContent=er.message||'Не удалось принять оплату'; err.hidden=false;
      save.disabled=false; paintAmt();
    }
  });
  setTimeout(()=>amtEl.focus(),50);
}

// Модал выплаты зарплаты
function openSalaryPayModal(prefilledName=''){
  const e=K.escapeHtml;
  const teamNames=finances.salaries.map(s=>s.name);
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  const today=new Date().toISOString().slice(0,10);
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>Выплата зарплаты</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Сотрудник</label>
        <input id="spName" list="spNameList" class="inp" placeholder="Имя сотрудника" value="${e(prefilledName)}">
        <datalist id="spNameList">${teamNames.map(n=>`<option value="${e(n)}">`).join('')}</datalist>
      </div>
      <div class="mf"><label>Сумма, сум</label>
        <input id="spAmount" type="number" class="inp" placeholder="например 150 000" min="1">
      </div>
      <div class="mf"><label>Примечание</label>
        <input id="spNote" class="inp" placeholder="напр. 22–26 июн, 5 дней">
      </div>
      <div class="mf"><label>Дата</label>
        <input id="spDate" type="date" class="inp" value="${today}">
      </div>
    </div>
    <div class="modal-ft">
      <button class="btn ghost" id="spCancel">Отмена</button>
      <button class="btn" id="spSave">Выплатить 💰</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  const close=()=>{bg.remove();};
  bg.querySelector('.modal-cls').onclick=close;
  bg.querySelector('#spCancel').onclick=close;
  bg.addEventListener('click',ev=>{if(ev.target===bg)close();});
  bg.querySelector('#spSave').addEventListener('click',async()=>{
    const name=(bg.querySelector('#spAmount')&&bg.querySelector('[id=spName]')?.value||'').trim()||bg.querySelector('#spName')?.value?.trim()||'';
    const nameVal=bg.querySelector('#spName')?.value?.trim()||'';
    const amtRaw=bg.querySelector('#spAmount')?.value?.replace(/\s/g,'')||'';
    const amt=Number(amtRaw);
    const note=bg.querySelector('#spNote')?.value?.trim()||'';
    const dateVal=bg.querySelector('#spDate')?.value||today;
    if(!nameVal){mToast('Укажите имя сотрудника','!');return;}
    if(!amt||amt<=0){mToast('Укажите сумму','!');return;}
    const saveBtn=bg.querySelector('#spSave');
    saveBtn.disabled=true;saveBtn.textContent='Сохраняем…';
    try{
      const desc=`Зарплата ${nameVal}${note?` · ${note}`:''}`;
      const tx=await API.Transactions.create({
        type:'expense',amount:amt,category:'Зарплата',
        description:desc,date:dateVal,payment_method:'Наличные',
      });
      finances.salaryLog.push({...tx,desc});
      renderFinance();
      mToast(`Выплата ${nameVal} — ${K.fmtMoney(amt)} сум ✓`,'💰');
      close();
    }catch(err){
      mToast('Ошибка: '+err.message,'!');
      saveBtn.disabled=false;saveBtn.textContent='Выплатить 💰';
    }
  });
  setTimeout(()=>bg.querySelector('#spName')?.focus(),100);
}

// Добавить разовый расход
function openFinExpenseModal(){
  const ICONS=['🛒','🔧','🚗','📦','💊','🏪','📋','🖨','🧹','💸'];
  const e=K.escapeHtml;
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>Новый расход</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Тип</label>
        <div class="type-pick">
          <button type="button" data-ft="oneoff" class="active">⚡ Разовый</button>
          <button type="button" data-ft="fixed">🔄 Постоянный</button>
        </div></div>
      <div class="mf"><label>Категория / описание</label>
        <input id="finExpCat" placeholder="Аренда, расходники, ремонт…" maxlength="80"></div>
      <div class="mf"><label>Сумма, сум</label>
        <input id="finExpAmt" type="number" inputmode="numeric" placeholder="100 000" min="0"></div>
      <div class="mf" id="finExpDateWrap"><label>Дата</label>
        <input id="finExpDate" type="date" value="${K.TODAY.y}-${String(K.TODAY.m+1).padStart(2,'0')}-${String(K.TODAY.d).padStart(2,'0')}"></div>
      <div class="mf" id="finExpPeriodWrap" style="display:none"><label>Периодичность</label>
        <input id="finExpPeriod" placeholder="Ежемесячно" value="Ежемесячно" maxlength="40"></div>
      <div class="mf"><label>Иконка</label>
        <div class="fin-icon-pick" id="finIconPick">${ICONS.map(ic=>`<button type="button" class="fin-ico-opt" data-ic="${ic}">${ic}</button>`).join('')}</div></div>
      <div class="mf"><label>Заметка <span style="color:var(--ink-3);font-weight:400">— необязательно</span></label>
        <textarea id="finExpNote" rows="2" maxlength="200" placeholder="Дополнительно…"></textarea></div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="finExpSave">Добавить</button></div>
  </div>`;
  document.body.appendChild(bg);
  let expType='oneoff';
  let selIcon=ICONS[0];
  bg.querySelector(`[data-ic="${selIcon}"]`).classList.add('active');

  bg.querySelectorAll('.type-pick button').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.type-pick button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); expType=b.dataset.ft;
    document.getElementById('finExpDateWrap').style.display=expType==='fixed'?'none':'';
    document.getElementById('finExpPeriodWrap').style.display=expType==='fixed'?'':'none';
  }));
  bg.querySelectorAll('.fin-ico-opt').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.fin-ico-opt').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); selIcon=b.dataset.ic;
  }));

  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=ev=>{ if(ev.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',ev=>{ if(ev.target===bg)close(); });
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);

  bg.querySelector('#finExpSave').addEventListener('click',async ()=>{
    const cat=bg.querySelector('#finExpCat').value.trim();
    const amt=+bg.querySelector('#finExpAmt').value;
    if(!cat){mToast('Введите категорию','!');return;}
    if(!amt){mToast('Введите сумму','!');return;}
    const saveFinBtn=bg.querySelector('#finExpSave');
    saveFinBtn.disabled=true; saveFinBtn.textContent='Сохраняем…';
    try{
      if(expType==='fixed'){
        const period=bg.querySelector('#finExpPeriod').value.trim()||'Ежемесячно';
        finances.fixed.push({cat,amount:amt,period,due:'—',ic:selIcon});
      } else {
        const dateVal=bg.querySelector('#finExpDate').value;
        const [,y,m,d]=dateVal.match(/(\d{4})-(\d{2})-(\d{2})/)||[];
        const dateStr=d?`${+d} ${K.MONTHS_SHORT[+m-1]}`:'—';
        const note=bg.querySelector('#finExpNote').value.trim();
        await API.Transactions.create({
          type:'expense', amount:amt, category:cat, description:note,
          date:dateVal||new Date().toISOString().slice(0,10),
          payment_method:'Наличные',
        });
        finances.oneoff.push({cat,amount:amt,date:dateStr,ic:selIcon,note});
      }
      renderFinance(); close(); mToast('Расход добавлен','✓');
    }catch(err){
      mToast('Ошибка: '+err.message,'!');
      saveFinBtn.disabled=false; saveFinBtn.textContent='Добавить';
    }
  });
  setTimeout(()=>bg.querySelector('#finExpCat')?.focus(),50);
}

// Добавить сотрудника / статью зарплаты
function openFinSalaryModal(){
  const e=K.escapeHtml;
  const PALETTE=['#5FC4BA,#2E8F86','#DDB261,#C2891F','#8EB69B,#5E8475','#9B8EC4,#6E5BA8','#E0796D,#CB554A','#4FBE93,#2E9E78'];
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>Добавить сотрудника</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Имя сотрудника</label>
        <input id="finSalName" placeholder="Алишер Бектемиров" maxlength="80"></div>
      <div class="mf"><label>Должность</label>
        <input id="finSalRole" placeholder="Менеджер, Сотрудник…" maxlength="40"></div>
      <div class="mf"><label>Зарплата, сум</label>
        <input id="finSalAmt" type="number" inputmode="numeric" placeholder="700 000" min="0"></div>
      <div class="mf"><label>Дата выплаты</label>
        <input id="finSalDate" placeholder="25 числа" maxlength="20"></div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="finSalSave">Добавить</button></div>
  </div>`;
  document.body.appendChild(bg);
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=ev=>{ if(ev.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',ev=>{ if(ev.target===bg)close(); });
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  bg.querySelector('#finSalSave').addEventListener('click',()=>{
    const name=bg.querySelector('#finSalName').value.trim();
    const role=bg.querySelector('#finSalRole').value.trim()||'Сотрудник';
    const amount=+bg.querySelector('#finSalAmt').value;
    const date=bg.querySelector('#finSalDate').value.trim()||'—';
    if(!name){mToast('Введите имя','!');return;}
    if(!amount){mToast('Введите сумму','!');return;}
    const av=mSafeInitials(name,false);
    const g=PALETTE[finances.salaries.length%PALETTE.length];
    finances.salaries.push({name,role,amount,paid:false,date,av,g});
    renderFinance();
    close();
    mToast(`${name} добавлен в список`,'✓');
  });
  setTimeout(()=>bg.querySelector('#finSalName')?.focus(),50);
}

// Редактирование постоянного расхода
function openFinFixedModal(idx){
  const f=finances.fixed[idx];
  if(!f)return;
  const ICONS=['🏬','💡','✈️','🛒','🔧','🚗','📦','💊','🏪','📋','🖨','🧹','💸','📱','🌐'];
  const e=K.escapeHtml;
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>Изменить расход</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Иконка</label>
        <div class="fin-icon-pick" id="ffeIconPick">${ICONS.map(ic=>`<button type="button" class="fin-ico-opt${ic===f.ic?' active':''}" data-ic="${ic}">${ic}</button>`).join('')}</div></div>
      <div class="mf"><label>Категория / описание</label>
        <input id="ffecat" value="${e(f.cat)}" maxlength="80" placeholder="Аренда, интернет…"></div>
      <div class="mf"><label>Сумма, сум</label>
        <input id="ffeamt" type="number" inputmode="numeric" value="${f.amount}" min="0"></div>
      <div class="mf"><label>Периодичность</label>
        <input id="ffeper" value="${e(f.period)}" maxlength="40" placeholder="Ежемесячно"></div>
      <div class="mf"><label>Дата списания</label>
        <input id="ffedue" value="${e(f.due)}" maxlength="30" placeholder="1 числа"></div>
    </div>
    <div class="modal-ft">
      <button class="btn ghost modal-cls" style="flex:1">Отмена</button>
      <button class="btn" id="ffeSave" style="flex:1">Сохранить</button>
    </div>
    <div style="padding:0 20px 18px">
      <button class="btn ghost" id="ffeDel" style="width:100%;color:var(--red);justify-content:center">🗑 Удалить расход</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  let selIcon=f.ic;
  bg.querySelectorAll('.fin-ico-opt').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.fin-ico-opt').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); selIcon=b.dataset.ic;
  }));
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=ev=>{ if(ev.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',ev=>{ if(ev.target===bg)close(); });
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  bg.querySelector('#ffeSave').addEventListener('click',()=>{
    const cat=bg.querySelector('#ffecat').value.trim();
    const amount=+bg.querySelector('#ffeamt').value;
    if(!cat){mToast('Введите категорию','!');return;}
    if(!amount){mToast('Введите сумму','!');return;}
    finances.fixed[idx]={
      cat, amount,
      period:bg.querySelector('#ffeper').value.trim()||'Ежемесячно',
      due:bg.querySelector('#ffedue').value.trim()||'—',
      ic:selIcon,
    };
    renderFinance();
    close();
    mToast('Расход обновлён','✓');
  });
  bg.querySelector('#ffeDel').addEventListener('click',async()=>{
    const ok=await K.confirmDialog(`Удалить «${f.cat}»?`,{title:'Удалить расход',ok:'Удалить',danger:true});
    if(!ok)return;
    finances.fixed.splice(idx,1);
    renderFinance();
    close();
    mToast('Расход удалён','🗑');
  });
  setTimeout(()=>bg.querySelector('#ffecat')?.focus(),50);
}

// Клик по строке постоянного расхода → редактировать
document.getElementById('finFixed').addEventListener('click',e=>{
  const row=e.target.closest('[data-ffi]');
  if(row)openFinFixedModal(+row.dataset.ffi);
});

document.getElementById('finAddExpense').addEventListener('click',e=>{e.stopPropagation();openFinExpenseModal();});
document.getElementById('finAddSalary').addEventListener('click',e=>{e.stopPropagation();openSalaryPayModal('');});
document.getElementById('mGoFinance').addEventListener('click',()=>{renderFinance();setTab('finance');});
document.getElementById('mapTaxiBtn')?.addEventListener('click',()=>mToast('Интеграция с Яндекс Такси — скоро!','🚕'));
renderFinance();

// ===== Глобальные обработчики (всё что не подцеплено явно) =====
document.addEventListener('click',e=>{
  const t=e.target;
  const tg=t.closest('.toggle, .m-toggle');
  if(tg){tg.classList.toggle('off');return;}
  const btn=t.closest('button, .btn, .tpl-item, .nod-rm, .no-rm, .row-act, .mcal-item, .lnk, .qstat, .book-item, .card.blk, .conv-row');
  if(!btn)return;
  const text=(btn.textContent||'').trim();
  if(/Создать заказ|Новый заказ/i.test(text)){setTab(btn.closest('#t-new-order')?'orders':'new-order');return;}
  if(/Открыть.*№|Открыть карточку/i.test(text)){
    const m=text.match(/№(\d+)/);
    m?openOrder(m[1]):setTab('order');
    return;
  }
  if(/Все события|Все →|Подробнее →/i.test(text)){setTab('orders');return;}
  if(/Передать в выдачу|Принять|Подтвердить|Передать в /i.test(text) && !btn.id){setTab('orders');return;}
  if(btn.matches('.mcal-item')){btn.dataset.oid?openOrder(btn.dataset.oid):setTab('order');return;}
  // всё остальное → opacity-feedback
  btn.style.transition='opacity .15s';btn.style.opacity='.5';
  setTimeout(()=>btn.style.opacity='',150);
});

// ===== Старт: приветствие, дата, загрузка данных с сервера =====
// Ролевое скрытие управляющих элементов (C3, мобайл). Сервер enforce'ит права.
function applyRoleUIm(me){
  if(me.role!=='employee')return;
  const hide=(sel)=>{const el=document.querySelector(sel); if(el)el.style.display='none';};
  hide('.fab');
  hide('#whAddBtn');
  hide('#mAddClient');
  hide('#mcstEdit');
  hide('#mclEdit');
  hide('.more-tile[data-go="money"]');
  hide('.more-tile[data-go="settings"]');
  hide('.more-tile[data-go="team"]');
  hide('.more-tile[data-go="tg"]');
  document.querySelectorAll('.more-list').forEach(list=>{
    const vis=[...list.querySelectorAll('.more-tile')].some(t=>t.style.display!=='none');
    list.style.display=vis?'':'none';
  });
}

function updateGreeting(name){
  const h = new Date().getHours();
  const greet = h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  const firstName = (name || '').split(' ')[0];
  const hi = document.getElementById('homeHi');
  const dt = document.getElementById('homeDate');
  if(hi) hi.textContent = firstName ? `${greet}, ${firstName}` : greet;
  if(dt) dt.textContent = K.fmtTodayLong();
}
updateGreeting();

setTab('home');

// ===== Рендер данных главной страницы из API =====
const MONTHS_SHORT_RU=K.MONTHS_SHORT;

const MONTHS_IN_RU=K.MONTHS_PREP;

function renderHomeHero(summary){
  const income=API.calc.monthMoney(summary).income;
  const debt=API.calc.debt(mClients);
  const deposits=API.calc.deposits(orders);
  // динамический месяц в заголовке
  const cap=document.getElementById('heroCap');
  if(cap){
    const svgEl=cap.querySelector('svg');
    cap.textContent=`Заработано в ${MONTHS_IN_RU[K.TODAY.m]}`;
    if(svgEl)cap.prepend(svgEl);
  }
  // дельта: сравниваем с прошлым месяцем
  const prevIncome=API.calc.prevMonthIncome(summary,new Date(K.TODAY.y,K.TODAY.m,1));
  const deltaEl=document.getElementById('heroDelta');
  if(deltaEl){
    if(!income){deltaEl.style.display='none';}
    else if(prevIncome>0){
      const pct=Math.round((income-prevIncome)/prevIncome*100);
      deltaEl.style.display='';
      deltaEl.textContent=(pct>=0?'↑':'↓')+Math.abs(pct)+'%';
      deltaEl.style.color=pct>=0?'var(--green)':'var(--red)';
    }else{deltaEl.style.display='none';}
  }
  const rev=document.getElementById('heroRevenue');
  if(rev) rev.textContent=(API.fmt.money(income)||'0')+' сум';
  const d=document.getElementById('heroDebt');
  const dp=document.getElementById('heroDeposit');
  if(d) d.textContent=debt?API.fmt.money(debt)+' сум':'—';
  if(dp) dp.textContent=deposits?API.fmt.money(deposits)+' сум':'—';
}

function renderHomeStats(stats){
  if(!stats)return;
  const ns=document.querySelectorAll('#t-home .qstat .qn');
  const vals=[stats.issue_today,stats.return_today,stats.overdue,stats.assembling];
  ns.forEach((el,i)=>{ if(vals[i]!=null)el.textContent=vals[i]; });
}

function renderHomeQueue(){
  const card=document.getElementById('homeQueueCard');
  if(!card)return;
  const queue=K.todayQueue(orders);
  if(!queue.length){
    card.innerHTML=K.emptyState('На сегодня тихо','Нет выдач, возвратов и просрочек.');
    return;
  }
  card.innerHTML=queue.map(({o,kind,late,debt})=>{
    const costumes=(o.lines||[]).map(l=>l.name).filter(Boolean).join(', ')||'—';
    let pill='give', label='Открыть', meta='';
    if(kind==='over'){
      pill='over';
      label=debt?'Долг':'Забрать';
      meta=`<span class="q-late">${late?`Просрочка ${late} дн`:'Просрочен'}</span>`;
    }else if(kind==='issue'){
      pill='give';
      label=o.st==='build'?'Собрать':'Выдать';
      meta='<span class="q-kind">выдача</span>';
    }else{
      pill='take';
      label='Принять';
      meta='<span class="q-kind">возврат</span>';
    }
    const addr=K.orderAddr(o);
    return `<div class="q-item${addr?' has-loc':''}" data-qoi="${K.escapeHtml(o.id)}">
      <div class="q-body">
        <div class="q-row"><div class="nm">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.cl)}</div><span class="pill ${pill}">${label}</span></div>
        <div class="ds">${K.escapeHtml(costumes)}</div>
        <div class="q-meta">${meta}<span class="q-slot">${K.escapeHtml(o.slotL||'Утро')}</span>${addr?K.locPinHtml(addr,{phone:o.phone,name:o.cl,oid:o.id,cls:'quiet',short:28}):''}</div>
      </div>
    </div>`;
  }).join('');
  card.querySelectorAll('[data-qoi]').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.qoi)));
}

function renderHomeBookings(){
  const today=`${K.TODAY.y}-${String(K.TODAY.m+1).padStart(2,'0')}-${String(K.TODAY.d).padStart(2,'0')}`;
  const upcoming=orders.filter(o=>o.issue_date>today&&['book','conf'].includes(o.st))
    .sort((a,b)=>a.issue_date>b.issue_date?1:-1).slice(0,5);
  const card=document.getElementById('homeBookingsCard');
  if(!card)return;
  if(!upcoming.length){
    card.innerHTML='<div style="text-align:center;padding:18px;color:var(--ink-3);font-size:13px">Нет предстоящих броней</div>';
    return;
  }
  card.innerHTML=upcoming.map(o=>{
    const dt=new Date(o.issue_date);
    const mon=MONTHS_SHORT_RU[dt.getMonth()]||'';
    const day=dt.getDate();
    const cnt=(o.lines||[]).length||(o.items||[]).length||1;
    return `<div class="book-item" data-hboi="${K.escapeHtml(o.id)}" style="cursor:pointer">
      <div class="date-chip"><div class="m">${mon}</div><div class="d">${day}</div></div>
      <div><div class="nm">${K.escapeHtml(o.cl)}</div><div class="ds">${cnt} костюм${cnt===1?'':'ов'} · ${o.days||1} дн</div></div>
      <div class="sum">${K.escapeHtml(o.sm||o.sum||'—')}</div>
    </div>`;
  }).join('');
  card.querySelectorAll('[data-hboi]').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.hboi)));
}

function buildCalEvs(){
  mCalEvs.length=0;
  orders.forEach(o=>{
    if(!o.issue_date||!o.return_date)return;
    mCalEvs.push({id:o.id,name:o.cl,issue_date:o.issue_date,return_date:o.return_date,st:o.st});
  });
}

// Общий адаптер уведомлений из api.js (навигация — мобильная: setTab).
function adaptNotifs(apiNotifs){
  return API.notif.adapt(apiNotifs,{openOrder,goTab:setTab});
}

// Маппинг категории расхода → иконка
function catToIcon(cat){
  const m={'Аренда':'🏬','Интернет':'💡','Такси':'🚗','Yandex':'🚗','Расходн':'🛒','Ремонт':'🔧','Закупка':'🏪','Доставк':'📦','Канцел':'📋'};
  for(const[k,v] of Object.entries(m)) if(cat&&cat.includes(k)) return v;
  return '💸';
}

// Загрузка реальных данных
(async function init(){
  try{
    // loadMe и loadAll независимы (авторизация по cookie на каждый запрос),
    // поэтому запускаем их одним Promise.all — убирает лишний последовательный
    // круг до сервера, ускоряя загрузку почти вдвое.
    const [me, s] = await Promise.all([API.loadMe(), API.loadAll()]);
    updateGreeting(me.name);
    if(me.avatar_text){
      userAv.text=me.avatar_text;
      document.querySelectorAll('.av-btn').forEach(el=>{ el.textContent = me.avatar_text; });
    }
    if(me.gradient){
      userAv.gradient=me.gradient;
      document.querySelectorAll('.av-btn').forEach(el=>{
        el.style.background = `linear-gradient(135deg,${me.gradient})`;
      });
    }
    orders.length=0;   orders.push(...s.orders);
    mClients.length=0; mClients.push(...s.clients);
    costumes.length=0; costumes.push(...s.costumes);

    // Настройки из БД
    try{
      const sr=await API.api('/settings');
      const st=sr.settings||{};
      mSettings=st;
      if(st.shop_name)   setMData.shop[0].v=st.shop_name;
      if(st.address)     setMData.shop[1].v=st.address;
      if(st.phone)       setMData.shop[2].v=st.phone;
      if(st.work_hours)  setMData.shop[3].v=st.work_hours;
      if(st.min_rent_days!=null)    setMData.price[0].v=st.min_rent_days+' дн';
      if(st.deposit_pct!=null)      setMData.price[1].v=st.deposit_pct+'% от суммы';
      if(st.fine_pct_per_day!=null) setMData.price[2].v='+'+st.fine_pct_per_day+'%/день';
      if(st.notif_new_order!=null)    setMData.notif[0].v=st.notif_new_order?'on':'off';
      if(st.notif_overdue!=null)      setMData.notif[1].v=st.notif_overdue?'on':'off';
      if(st.notif_telegram!=null)     setMData.notif[2].v=st.notif_telegram?'on':'off';
      if(st.notif_daily_report!=null) setMData.notif[3].v=st.notif_daily_report?'on':'off';
      ['shop','price','notif'].forEach(sec=>renderSetSec(sec));
    }catch(se){console.warn('Settings load:',se);}

    // Финансы (демо «Карнавал» — витрина). Для реальных прокатов убираем
    // демо-заготовки и показываем только фактические расходы из транзакций.
    finances.fixed.length=0;
    finances.oneoff.length=0;
    // Финансы — разовые расходы из транзакций
    if(s.transactions?.length){
      const expenses=s.transactions.filter(t=>t.type==='expense');
      if(expenses.length){
        finances.oneoff.length=0;
        expenses.forEach(t=>finances.oneoff.push({
          cat: t.category||t.desc||'Расход',
          amount: t.amount,
          date: t.dateShort||'—',
          ic: catToIcon(t.category||t.desc||''),
          note: t.desc||'',
        }));
      }
    }

    renderMOrders();
    renderMClients();
    renderCostGrid();
    renderMOrdMiniCal();
    renderMOrdNear();

    // Главная — данные из API
    renderHomeHero(s.summary);
    renderHomeStats(s.stats);
    renderHomeQueue();
    renderHomeBookings();
    // Блок «Доставка» — демо-витрина (Yandex Go). Интеграции доставки пока нет,
    // поэтому у реальных прокатов его скрываем, чтобы не показывать чужой заказ.
    {
      const dSec=document.getElementById('mDeliverySec');
      const dCard=document.getElementById('mDeliveryCard');
      if(dSec)dSec.style.display='none';
      if(dCard)dCard.style.display='none';
    }

    // Профиль и Деньги — реальные данные (демо «Карнавал» остаётся витриной)
    renderMProfile(me);
    renderMMoney(s.summary, s.transactions, me);
    applyRoleUIm(me);
    // Сборщице по умолчанию — её очередь сборки, а не главная руководителя.
    if(me.role==='employee')setTab('mine');

    // Календарь — события из заказов
    buildCalEvs();
    renderMCalGrid();

    // Уведомления: реальные данные. Демо «Карнавал» — витрина.
    if(s.notifications?.length){
      const adapted=adaptNotifs(s.notifications);
      mNotifs.length=0;
      mNotifs.push(...adapted);
      updateMBellDot();
    }else{
      mNotifs.length=0;
      updateMBellDot();
    }

    // Зарплаты — загружаем команду + лог выплат из транзакций этого месяца
    try{
      const teamResp=await API.api('/team');
      const activeTeam=(teamResp.items||[]).filter(u=>u.is_active!==false);
      if(activeTeam.length){
        finances.salaries.length=0;
        activeTeam.forEach(u=>finances.salaries.push({
          name:u.name, role:u.role||'employee',
          av:u.avatar_text||u.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
          g:u.gradient||'#8EB69B,#5E8475',
        }));
      }
      const curMonth=`${K.TODAY.y}-${String(K.TODAY.m+1).padStart(2,'0')}`;
      finances.salaryLog.length=0;
      finances.salaryLog.push(
        ...s.transactions.filter(t=>t.category==='Зарплата'&&(t.date||'').startsWith(curMonth))
      );
      renderFinance();
      renderTeamM();
    }catch(_){}

  }catch(e){
    if(e.message==='unauthorized')return;
    console.error('Init failed:', e);
  }finally{
    // Данные на месте — показываем интерфейс (до этого он скрыт, чтобы не мигала демо-разметка).
    document.documentElement.classList.remove('app-loading');
  }
})();
