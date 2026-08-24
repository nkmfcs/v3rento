/* ============================================================
   Костюмерная — ДЕСКТОП · навигация и данные
   ============================================================ */

// Настройки проката (deposit_pct и т.д.) — объявлено рано, т.к. читается уже при
// первом рендере формы нового заказа (иначе TDZ). Наполняется в loadSettings().
let settingsState={};

// заголовок страницы для каждого раздела
const PAGES={
  dash:       {t:'Главная',       s:`${K.fmtTodayLong()} · что нужно сделать сегодня`},
  orders:     {t:'Заказы',        s:'Все заказы и их статусы'},
  mine:       {t:'Мои заказы',    s:'Очередь сборки — что горит раньше'},
  order:      {t:'Заказ',         s:''},
  'new-order':{t:'Новый заказ',   s:'Клиент · костюмы · даты · оплата'},
  wh:         {t:'Склад',         s:'Костюмы и наличие'},
  rooms:      {t:'Комнаты',       s:'3 комнаты · стеллажи · где лежит костюм'},
  clients:    {t:'Клиенты',       s:'База клиентов и история'},
  cal:        {t:'Календарь',     s:'Брони и загрузка по дням'},
  money:      {t:'Деньги',        s:'Доходы, расходы, залоги'},
  tg:         {t:'Telegram-бот',  s:'Заказ из переписки'},
  team:       {t:'Команда',       s:'Сотрудники и доступы'},
  settings:   {t:'Настройки',     s:'Параметры проката'},
  audit:      {t:'Журнал',        s:'Действия сотрудников и события'},
  profile:    {t:'Профиль',       s:''}, // подзаголовок ставится динамически из renderProfile
  client:     {t:'Карточка клиента',s:''},
  costume:    {t:'Карточка костюма',s:''},
};

function go(v){
  const p=PAGES[v]||{t:v,s:''};
  document.getElementById('pgT').textContent=p.t;
  document.getElementById('pgSub').textContent=p.s;
  // back-кнопка для всех subview (не только order/new-order)
  const subPages=new Set(['order','new-order','client','costume','profile']);
  document.getElementById('backBtn').style.display=subPages.has(v)?'grid':'none';

  // переключаем активный view
  document.querySelectorAll('.view').forEach(s=>s.classList.remove('active'));
  const target=document.getElementById(v);
  if(target){target.classList.add('active');}

  // подсветка меню
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
  document.querySelector('.content').scrollTop=0;
  if(v==='mine')renderMyQueue();
  if(v==='audit')renderAudit();
  if(v==='rooms')renderPcRooms();
}

let pcRoomsView={room:null,rack:null};
function renderPcRooms(){
  const root=document.getElementById('pcRoomsRoot');
  if(!root)return;
  const list=whCostumes;
  K.forgetMissingBins(list);
  const occ=K.slotOccupancy(list);
  const can=API.state.me?.role!=='employee';
  if(!pcRoomsView.room){
    root.innerHTML='<div class="grid" style="grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px">'+
      K.ROOMS.map(rm=>{
        const n=K.roomFill(list, rm.id);
        return `<div class="card rm-card" data-rm="${rm.id}">${rm.kind==='boxes'?'<div class="rm-mini box"><i></i><i></i><i></i><i></i></div>':'<div class="rm-mini"><i class="a"></i><span><i class="b"></i><i></i><i class="c"></i></span></div>'}<div><div class="rm-n">${rm.name}</div><div class="rm-s">${rm.sub||''}</div></div><div class="rm-fill">${n}</div></div>`;
      }).join('')+'</div>';
    const loose=[...occ.loose];
    if(loose.length){
      root.innerHTML+=`<div class="card blk"><div class="sec-title" style="margin:0 0 8px">Не на месте</div>${loose.map(c=>`<div class="set-m-row"><span>${K.escapeHtml(c.name)}</span><span class="v">${K.escapeHtml(K.slotLabel(c.location)||c.location||'—')}</span></div>`).join('')}</div>`;
    }
    root.querySelectorAll('[data-rm]').forEach(el=>el.onclick=()=>{pcRoomsView.room=el.dataset.rm;pcRoomsView.rack=null;renderPcRooms();});
    return;
  }
  const roomMeta=K.ROOMS.find(r=>r.id===pcRoomsView.room);
  if(roomMeta && roomMeta.kind==='boxes'){
    let h=`<button class="btn ghost sm" id="pcRmBack" style="width:auto;margin-bottom:12px">← Все комнаты</button><div class="box-grid" style="max-width:520px">`;
    for(let i=1;i<=K.BOX_COUNT;i++){
      const code=K.formatBox(i);
      const items=occ.by[code]||[];
      h+=`<button type="button" class="box-card${items.length?' has':''}" data-slot="${code}"><div class="box-lid"></div><div class="box-n">${i}</div><div class="box-s">${items.length?K.escapeHtml(items.map(c=>c.name).join(', ')):'пусто'}</div></button>`;
    }
    root.innerHTML=h+'</div>';
    document.getElementById('pcRmBack').onclick=()=>{pcRoomsView.room=null;renderPcRooms();};
    root.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>pcOpenSlot(el.dataset.slot));
    return;
  }
  if(!pcRoomsView.rack){
    root.innerHTML=`<button class="btn ghost sm" id="pcRmBack" style="width:auto;margin-bottom:12px">← Все комнаты</button>
      <div style="max-width:420px">${K.renderRoomPlan(pcRoomsView.room, occ)}</div>`;
    document.getElementById('pcRmBack').onclick=()=>{pcRoomsView.room=null;renderPcRooms();};
    root.querySelectorAll('[data-rk]').forEach(el=>el.onclick=()=>{pcRoomsView.rack=el.dataset.rk;pcRoomsView.side=el.dataset.sd;renderPcRooms();});
    return;
  }
  const col=(side)=>`<div class="rack-col"><div class="rack-col-h">${K.SIDES[side]}</div>${[1,2,3,4,5,6].map(line=>{
    const code=K.formatSlot(pcRoomsView.room,pcRoomsView.rack,side,line);
    const items=occ.by[code]||[];
    return `<div class="rack-rail${items.length?'':' empty'}" data-slot="${code}"><div class="ln">${line}</div><div class="hh">${items.length?`<span class="nm">${K.escapeHtml(items.map(c=>c.name).join(', '))}</span>`:'пусто'}</div></div>`;
  }).join('')}</div>`;
  root.innerHTML=`<button class="btn ghost sm" id="pcRmBack" style="width:auto;margin-bottom:12px">← Комната ${pcRoomsView.room}</button>
    <h3 style="margin:0 0 12px">Стеллаж ${pcRoomsView.rack}</h3>
    <div class="rack-elev" style="max-width:640px">${col('П')}${col('З')}</div>`;
  document.getElementById('pcRmBack').onclick=()=>{pcRoomsView.rack=null;renderPcRooms();};
  root.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>pcOpenSlot(el.dataset.slot));
}

function pcOpenSlot(code){
  const can=API.state.me?.role!=='employee';
  if(!can)return;
  const occ=K.slotOccupancy(whCostumes);
  const here=occ.by[code]||[];
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.innerHTML=`<div class="modal-card"><div class="modal-hd"><h3>${K.escapeHtml(K.slotLabel(code))}</h3><button class="modal-cls" type="button">×</button></div>
    <div class="modal-body">
      ${here.length?here.map(c=>`<div class="set-m-row"><span>${K.escapeHtml(c.name)}</span><button class="set-edit-btn" data-un="${K.escapeHtml(c.type)}">убрать</button></div>`).join(''):'<div style="font-size:13px;color:var(--ink-3)">Пусто</div>'}
      <div class="sec-title" style="margin-top:14px">Положить сюда</div>
      ${whCostumes.filter(c=>K.parseSlot(c.location)?.code!==code).map(c=>`<div class="set-m-row" data-put="${K.escapeHtml(c.type)}" style="cursor:pointer"><span>${K.escapeHtml(c.name)}</span><span class="v">${K.escapeHtml(K.slotLabel(c.location)||c.location||'—')}</span></div>`).join('')}
    </div></div>`;
  document.body.appendChild(bg);
  const close=()=>bg.remove();
  bg.onclick=e=>{ if(e.target===bg||e.target.closest('.modal-cls')) close(); };
  bg.querySelectorAll('[data-put]').forEach(el=>el.onclick=()=>{pcPlace(el.dataset.put,code); close();});
  bg.querySelectorAll('[data-un]').forEach(el=>el.onclick=()=>{pcPlace(el.dataset.un,''); close();});
}
async function pcPlace(type, code){
  const c=whCostumes.find(x=>x.type===type);
  if(!c)return;
  c.location=code||'';
  try{ if(c.id) await API.Costumes.update(c.id,{location:code||null}); }catch(e){ toast(e.message,'!'); return; }
  renderWh(); renderPcRooms();
  toast(code?`«${c.name}» → ${K.slotLabel(code)}`:`«${c.name}» убран`,'✓');
}

// ===== Журнал действий (аудит) — только владелец =====
const AUDIT_LABELS={
  'order.create':'Создан заказ','order.status':'Смена статуса заказа','order.assign':'Назначена сборка',
  'order.payment':'Принята оплата','order.delete':'Удалён заказ',
  'costume.create':'Создан костюм','costume.update':'Изменён костюм','costume.delete':'Удалён костюм',
  'client.create':'Создан клиент','client.update':'Изменён клиент','client.delete':'Удалён клиент',
  'settings.update':'Изменены настройки','team.invite':'Приглашение сотрудника',
  'team.role_change':'Смена роли','team.delete':'Деактивация сотрудника',
  'order.rating':'Оценка сборки',
  'admin.create_account':'Создан аккаунт (оператор)','auth.login':'Вход','auth.password_change':'Смена пароля',
  'auth.logout_all':'Выход на всех устройствах',
};
async function renderAudit(){
  const list=document.getElementById('auditList');
  const meta=document.getElementById('auditMeta');
  if(!list)return;
  list.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:13px">Загрузка…</div>';
  let items=[];
  try{ const r=await API.api('/audit'); items=r.items||[]; }
  catch(e){ list.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:13px">Недоступно</div>'; return; }
  if(meta)meta.textContent=`${items.length} ${K.pluralItems(items.length)}`;
  if(!items.length){ list.innerHTML='<div style="text-align:center;padding:24px;color:var(--ink-3);font-size:13px">Событий пока нет</div>'; return; }
  list.innerHTML=items.map(a=>{
    const d=new Date(a.created_at);
    const t=isNaN(d)?'':`${d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})} ${d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
    const label=AUDIT_LABELS[a.action]||a.action;
    const ent=a.entity_id?`${K.escapeHtml(a.entity||'')} ${K.escapeHtml(a.entity_id)}`:K.escapeHtml(a.entity||'');
    return `<div class="prf-act-row" style="display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--line)">
      <div style="width:120px;flex:none;font-size:11.5px;color:var(--ink-3)">${K.escapeHtml(t)}</div>
      <div style="width:150px;flex:none;font-size:13px;font-weight:600">${K.escapeHtml(a.user_name||'—')}</div>
      <div style="flex:1;font-size:13px">${K.escapeHtml(label)} <span style="color:var(--ink-3)">${ent}</span></div>
    </div>`;
  }).join('');
}

// ===== «Мои заказы» — очередь сборки текущего пользователя =====
async function renderMyQueue(){
  const list=document.getElementById('myQueueList');
  const meta=document.getElementById('myQueueMeta');
  if(!list)return;
  list.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:13px">Загрузка…</div>';
  let mine=[];
  try{ mine=await API.Orders.mine(); }
  catch(e){ list.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:13px">Не удалось загрузить</div>'; return; }
  // Сортировка по времени выдачи — что горит раньше сверху.
  mine.sort((a,b)=>String(a.issue_date||'').localeCompare(String(b.issue_date||'')));
  if(meta)meta.textContent=`${mine.length} ${K.pluralOrders(mine.length)}`;
  if(!mine.length){ list.innerHTML=K.emptyState('Пока пусто','Когда руководитель назначит заказ — он появится здесь по времени выдачи.'); return; }
  const groups={late:[],today:[],tomorrow:[],later:[]};
  mine.forEach(o=>groups[K.queueBucket(o.issue_date)].push(o));
  const dueLbl={late:'уже',today:'сегодня',tomorrow:'завтра',later:''};
  list.innerHTML=['late','today','tomorrow','later'].map(key=>{
    const items=groups[key];
    if(!items.length)return '';
    return `<div class="q-group"><div class="q-group-h">${K.QUEUE_GROUP[key]}</div>${items.map(o=>{
      const asm=API.calc.assemblyStatus(o);
      const clr={assembled:'var(--green)',incomplete:'var(--red)',progress:'var(--gold)',none:'var(--ink-3)'}[asm.kind];
      const prog=asm.kind==='assembled'?'Собрано':asm.kind==='incomplete'?'Неполный':(asm.total?`${asm.done} из ${asm.total}`:'Собрать');
      return `<div class="q-card ${key}" data-open-mine="${K.escapeHtml(o.id)}">
        <div class="q-due">${dueLbl[key]||K.escapeHtml((o.dates||'').split('–')[0].trim()||'')}</div>
        <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(o.g)})">${K.escapeHtml(o.av)}</div>
        <div style="flex:1;min-width:0">
          <div class="nm" style="font-weight:600">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.cl)}</div>
          <div class="sub" style="font-size:12px;color:var(--ink-3)">${K.escapeHtml(o.dates||'')} · <span class="st ${o.st}" style="font-size:10.5px">${K.escapeHtml(o.stl)}</span></div>
        </div>
        <div style="text-align:right"><div style="font-weight:700;color:${clr}">${prog}</div></div>
      </div>`;
    }).join('')}</div>`;
  }).join('');
  list.querySelectorAll('[data-open-mine]').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.openMine)));
}

document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>go(b.dataset.v));
// кнопка «Новый заказ» в топбаре
document.querySelector('.topbar .btn').onclick=()=>{pno.depAuto=true;go('new-order');pnoRenderSummary();};
// инициализация заголовка под актуальный экран
document.getElementById('pgSub').textContent=PAGES.dash.s;

// ===== Таблица заказов =====
const orders=[];
// Рендер таблицы заказов — единственная функция (раньше дублировалась в pnoCreate)
function renderOrdersTable(){
  document.getElementById('ordersBody').innerHTML=orders.map(o=>{
    const thumbs=o.items.map(it=> it==='+6'?'<span class="more">+6</span>':`<span class="ts">${costumeSVG(it)}</span>`).join('');
    const asm=API.calc.assemblyStatus(o);
    const asmClr={assembled:'var(--green)',incomplete:'var(--red)',progress:'var(--gold)'}[asm.kind];
    const asmBadge=asm.kind==='none'?'':`<div class="sub" style="color:${asmClr};font-weight:600">${asm.kind==='assembled'?'Собрано':asm.kind==='incomplete'?'Неполный':K.escapeHtml(asm.label)}</div>`;
    const verb=K.orderMainLabel(o.st, API.state.me?.role);
    return `<tr data-oid="${K.escapeHtml(o.id)}" style="${o.danger?'background:var(--red-soft)':''}">
    <td class="ord-id">№${K.escapeHtml(o.id)}</td>
    <td><div class="cl-cell"><div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(o.g)})">${K.escapeHtml(o.av)}</div><div><div class="nm">${K.escapeHtml(o.cl)}</div><div class="sub">${K.escapeHtml(o.sub||'')}</div>${o.hasLoc?K.locPinHtml(o.delivery_addr,{phone:o.phone,name:o.cl,oid:o.id}):''}</div></div></td>
    <td><div class="thumbs">${thumbs}</div></td>
    <td style="${o.ddanger?'color:var(--red);font-weight:600':''}">${K.escapeHtml(o.dates||'')}${o.slotL?` · ${K.escapeHtml(o.slotL)}`:''}${o.dsub?`<div class="sub">${K.escapeHtml(o.dsub)}</div>`:''}</td>
    <td><b>${K.escapeHtml(o.sum)}</b>${o.ssub?`<div class="sub">${K.escapeHtml(o.ssub)}</div>`:''}</td>
    <td><span class="st ${o.st}">${K.escapeHtml(o.stl)}</span>${asmBadge}</td>
    <td>${verb?`<button class="row-act${o.st==='over'?'':' primary'}" type="button">${K.escapeHtml(verb)}</button>`:''}</td></tr>`;
  }).join('');
}
renderOrdersTable();
// Делегированный клик по строке — не нужно переподписываться после перерендера
document.getElementById('ordersBody').addEventListener('click',e=>{
  const tr=e.target.closest('tr[data-oid]');
  if(tr)openOrder(tr.dataset.oid);
});
// трек-карточка в заголовке (если есть) — открываем 1045
document.querySelectorAll('#orders .track').forEach(el=>el.addEventListener('click',()=>openOrder('1045')));

// helpers: вытащить id заказа из текста (№1045 → '1045')
const oidFrom=el=>{const m=(el.textContent||'').match(/№(\d+)/);return m?m[1]:null;};

// ===== Главная: навигация =====
document.querySelectorAll('#dash .tile').forEach(el=>el.addEventListener('click',()=>go('orders')));
document.querySelector('#dash .lnk').addEventListener('click',()=>go('orders'));
document.querySelectorAll('#dash .q-item').forEach(el=>el.addEventListener('click',()=>{const id=oidFrom(el);id?openOrder(id):go('order');}));
document.querySelectorAll('#dash .q-act').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();const id=oidFrom(el.closest('.q-item'));id?openOrder(id):go('order');}));
document.querySelectorAll('#dash .book-item').forEach(el=>el.addEventListener('click',()=>go('order')));
document.querySelectorAll('#dash .mini-stat').forEach((el,i)=>{if(i===0)el.addEventListener('click',()=>go('wh'));});

// ===== Заказы: воронка / фильтры / поиск =====
let ordF='all',ordST=null,ordQ='';
function applyOrdFilters(){
  const today=K.TODAY.d;
  const dayFrom=o=>{
    const m=(o.dates||'').match(/(\d+)/);return m?+m[1]:null;
  };
  let n=0;
  document.querySelectorAll('#ordersBody tr[data-oid]').forEach(tr=>{
    const o=orders.find(x=>x.id===tr.dataset.oid);if(!o){tr.style.display='none';return;}
    const text=(o.id+' '+o.cl+' '+(o.lines||[]).map(l=>l.name).join(' ')).toLowerCase();
    let pass=true;
    if(ordF==='active')pass=['book','conf','build','out','over','req'].includes(o.st);
    else if(ordF==='today'){const d=dayFrom(o);pass=d===today;}
    else if(ordF==='over')pass=o.st==='over';
    else if(ordF==='debt')pass=Number(o.remaining)>0||!!o.debt;
    if(pass && ordST)pass=o.st===ordST;
    if(pass && ordQ)pass=text.includes(ordQ);
    tr.style.display=pass?'':'none';
    if(pass)n++;
  });
  document.getElementById('ordsEmpty').style.display=n?'none':'';
}
// Воронка статусов — реальные счётчики из orders (раньше были захардкожены в HTML)
function updateOrderPipe(){
  const counts={};
  orders.forEach(o=>{counts[o.st]=(counts[o.st]||0)+1;});
  document.querySelectorAll('#ordPipe .stage').forEach(s=>{
    const el=s.querySelector('.n');
    if(el)el.textContent=counts[s.dataset.st]||0;
  });
}
document.querySelectorAll('#ordPipe .stage').forEach(s=>s.addEventListener('click',()=>{
  const wasOn=s.classList.contains('on');
  document.querySelectorAll('#ordPipe .stage').forEach(x=>x.classList.remove('on'));
  if(!wasOn){s.classList.add('on');ordST=s.dataset.st;}else{ordST=null;}
  applyOrdFilters();
}));
document.querySelectorAll('#ordToolbar .chip').forEach(c=>c.addEventListener('click',()=>{
  document.querySelectorAll('#ordToolbar .chip').forEach(x=>x.classList.remove('on'));
  c.classList.add('on');ordF=c.dataset.f;applyOrdFilters();
}));
document.getElementById('ordSearch').addEventListener('input',e=>{ordQ=e.target.value.trim().toLowerCase();applyOrdFilters();});
// глобальный поиск в топбаре — тоже фильтрует заказы
document.querySelector('.topbar .search input')?.addEventListener('input',e=>{
  if(document.querySelector('.view.active')?.id==='orders'){ordQ=e.target.value.trim().toLowerCase();applyOrdFilters();}
});

// календарь с навигацией + клик по дню
const PC_MONTHS=K.MONTHS;
const PC_MONTHS_GEN=K.MONTHS_GEN;
let pcCalY=K.TODAY.y, pcCalM=K.TODAY.m, pcCalSelDay=K.TODAY.d;
const PC_TODAY=K.TODAY;
// Возвращает реальные заказы на конкретный день/месяц/год — по ISO-датам issue/return.
function pcOrdersOnDay(y,m,d){
  const ymd=K.ymd(y,m,d);
  return orders.filter(o=>o.issue_date&&o.return_date&&ymd>=o.issue_date.slice(0,10)&&ymd<=o.return_date.slice(0,10));
}
function pcDayPool(){ return orders; }
function renderOrdMiniCal(){
  const cells=K.buildMonthGrid(pcCalY,pcCalM);
  document.getElementById('pcCalTitle').textContent=`${PC_MONTHS[pcCalM]} ${pcCalY}`;
  let h='<div class="mcal-mini-head">'+
    K.DOW_SHORT_MON_FIRST.map((d,i)=>`<div class="mcal-mini-dn${i>=5?' wknd':''}">${d}</div>`).join('')+'</div>';
  h+='<div class="mcal-mini-grid">';
  cells.forEach((cell,i)=>{
    const {d,inMonth,isToday}=cell;
    const sel=inMonth&&d===pcCalSelDay;
    const board=inMonth?K.dayBoard(pcDayPool(),K.ymd(pcCalY,pcCalM,d)):{nIssue:0,nRet:0,nOver:0};
    let cls='mcal-mini-d';
    if(!inMonth) cls+=' other';
    if(isToday) cls+=' today';
    if(sel) cls+=' sel';
    if(i%7===6 && inMonth) cls+=' sun';
    h+=`<div ${inMonth?`data-pcd="${d}"`:''} class="${cls}" role="button" tabindex="${inMonth?0:-1}">
      <span class="mcd-num">${inMonth?d:''}</span>
      ${inMonth?K.dayBoardMarks(board):'<div class="mcd-marks"></div>'}
    </div>`;
  });
  h+='</div><div class="cal-legend"><span><i class="issue"></i>выдача</span><span><i class="ret"></i>возврат</span><span><i class="over"></i>просрочка</span></div>';
  document.getElementById('ordMiniCal').innerHTML=h;
  document.querySelectorAll('#ordMiniCal [data-pcd]').forEach(el=>el.addEventListener('click',()=>{
    pcCalSelDay=+el.dataset.pcd;
    renderOrdMiniCal();renderOrdNear();
  }));
}
function pcOrdCalShift(dir){
  pcCalM+=dir;
  if(pcCalM<0){pcCalM=11;pcCalY--;}
  if(pcCalM>11){pcCalM=0;pcCalY++;}
  pcCalSelDay=null;renderOrdMiniCal();renderOrdNear();
}
document.getElementById('pcCalPrev').addEventListener('click',()=>pcOrdCalShift(-1));
document.getElementById('pcCalNext').addEventListener('click',()=>pcOrdCalShift(1));
document.getElementById('pcCalToday')?.addEventListener('click',()=>{
  pcCalY=K.TODAY.y; pcCalM=K.TODAY.m; pcCalSelDay=K.TODAY.d;
  renderOrdMiniCal();renderOrdNear();
});
K.bindSwipeX(document.getElementById('ordMiniCal'),{
  prev:()=>pcOrdCalShift(-1),
  next:()=>pcOrdCalShift(1),
});
renderOrdMiniCal();

// нижний блок — заказы выбранного дня или ближайшие активные
function renderDayBoardList(hostId, board, emptyTitle){
  const host=document.getElementById(hostId);
  if(!host)return;
  const row=(o,kind,label)=>`<div class="cl-cell" style="padding:11px 0;border-bottom:1px solid var(--line);cursor:pointer" data-near="${K.escapeHtml(o.id)}">
      <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(o.g||'#8EB69B,#5E8475')})">${K.escapeHtml(o.av||'?')}</div>
      <div style="flex:1;min-width:0"><div class="nm" style="font-size:13.5px;font-weight:600">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.cl)}</div>
      <div class="sub" style="font-size:11.5px;color:var(--ink-3)">${K.escapeHtml((o.lines||[]).map(l=>l.name).join(', ')||o.dates||'')}${o.slotL?` · ${K.escapeHtml(o.slotL)}`:''}</div></div>
      <span class="cal-kind ${kind}">${label}</span>
    </div>`;
  const parts=[];
  if(board.issue.length) parts.push(`<div class="cal-sec">Забирают · ${board.issue.length}</div>`+board.issue.map(o=>row(o,'issue','Выдача')).join(''));
  if(board.ret.length) parts.push(`<div class="cal-sec">Возвращают · ${board.ret.length}</div>`+board.ret.map(o=>row(o,'ret','Возврат')).join(''));
  const overOnly=board.over.filter(o=>!board.ret.includes(o)&&!board.issue.includes(o));
  if(overOnly.length) parts.push(`<div class="cal-sec">Просрочены · ${overOnly.length}</div>`+overOnly.map(o=>row(o,'over','Просрочен')).join(''));
  if(!parts.length){ host.innerHTML=K.emptyState(emptyTitle||'На эту дату тихо','Нет выдач и возвратов'); return; }
  host.innerHTML=parts.join('');
  host.querySelectorAll('[data-near]').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.near)));
}
function renderOrdNear(){
  const titleEl=document.getElementById('ordNearTitle');
  const metaEl=document.getElementById('ordNearMeta');
  if(pcCalSelDay){
    const board=K.dayBoard(pcDayPool(),K.ymd(pcCalY,pcCalM,pcCalSelDay));
    const n=board.nIssue+board.nRet+board.nOver;
    if(titleEl)titleEl.textContent=`${pcCalSelDay} ${PC_MONTHS_GEN[pcCalM]}`;
    if(metaEl)metaEl.textContent=n?`${board.nIssue} выд. · ${board.nRet} воз.`:'тихо';
    renderDayBoardList('ordNearList',board,'На эту дату тихо');
    return;
  }
  const board=K.dayBoard(pcDayPool(),K.TODAY.iso);
  if(titleEl)titleEl.textContent='Сегодня';
  if(metaEl)metaEl.textContent=`${board.nIssue} выд. · ${board.nRet} воз.`;
  renderDayBoardList('ordNearList',board,'Сегодня выдач и возвратов нет');
}
renderOrdNear();

// ===== Карточка заказа: главная кнопка — реальный переход статуса =====
let currentOrderId=null; // номер (строка) текущего открытого заказа
const NEXT_STATUS=API.status.next; // единая модель статусов из api.js
document.addEventListener('click',async e=>{
  const b=e.target.closest('#order .od-actions .btn');
  if(!b || b.classList.contains('ghost') || b.classList.contains('danger') || b.id==='odPayBtn')return;
  const o=orders.find(x=>x.id===currentOrderId);
  if(!o){go('orders');return;}
  if(o.st==='over'){
    if(!K.openClientChat({telegram:o.telegram, phone:o.phone})) toast('Нет телефона клиента','!');
    return;
  }
  const next=NEXT_STATUS[o.st];
  if(!next){go('orders');return;}
  const prevText=b.textContent;
  b.disabled=true; b.textContent='Обновляем…';
  try{
    await API.Orders.setStatus(o.uuid, next);
    const fresh=await API.Orders.one(o.uuid);
    const idx=orders.findIndex(x=>x.uuid===o.uuid);
    if(idx!==-1)orders[idx]=fresh;
    renderOrdersTable();applyOrdFilters();renderOrdMiniCal();renderOrdNear();renderCal();
    if(typeof updateOrderPipe==='function')updateOrderPipe();
    openOrder(fresh.id);
    toast('Статус обновлён','✓');
  }catch(err){
    toast(err.message||'Не удалось обновить статус','!');
    b.disabled=false; b.textContent=prevText;
  }
});

// ===== Карточка заказа — динамическая =====
const fmt=K.fmtMoney; // безопасный форматтер, не ломает дробные
const stepByStatus=API.status.step;
const TL=API.status.steps;

// Карточка «Сборка»: ответственная (для owner/manager — селектор) + статус сборки
// (собрано / X из Y / неполный) + что пропущено при неполной выдаче и кто собирал.
function renderAssemblyCard(o){
  const card=document.getElementById('odAssemblyCard');
  if(!card)return;
  const show=['build','out','over','closed'].includes(o.st)||o.assigned_to;
  if(!show){ card.style.display='none'; return; }
  card.style.display='';
  // Считаем прогресс из живого чек-листа, если он загружен (после отметок), иначе — из счётчиков списка.
  const src=Array.isArray(o.checklist)&&o.checklist.length
    ? {st:o.st,is_assembled:o.is_assembled,checklist_total:o.checklist.length,checklist_done:o.checklist.filter(c=>c.done).length}
    : o;
  const st=API.calc.assemblyStatus(src);
  const colors={assembled:'var(--green)',incomplete:'var(--red)',progress:'var(--gold)',none:'var(--ink-3)'};
  const statusEl=document.getElementById('odAssemblyStatus');
  statusEl.textContent=st.label; statusEl.style.color=colors[st.kind]||'var(--ink-3)';
  const canAssign=['owner','manager'].includes(API.state.me?.role);
  const emps=teamMembers.filter(m=>['employee','manager'].includes(m.role)&&m.is_active!==false);
  let html='';
  if(canAssign){
    const opts='<option value="">— не назначена —</option>'+emps.map(m=>`<option value="${K.escapeHtml(m.id)}"${m.id===o.assigned_to?' selected':''}>${K.escapeHtml(m.name)}</option>`).join('');
    html+=`<div class="set-field"><span class="k">Ответственная за сборку</span><select id="odAssignSel" class="set-inp" style="border:1.5px solid var(--line);border-radius:10px;padding:8px 12px;font-family:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);max-width:260px;width:260px">${opts}</select></div>`;
  }else{
    html+=`<div class="set-field"><span class="k">Ответственная за сборку</span><span class="v">${K.escapeHtml(o.assigned_to_name||'не назначена')}</span></div>`;
  }
  if(st.kind==='incomplete'){
    const missing=(o.checklist||[]).filter(c=>!c.done);
    const whoList=[...new Set((o.checklist||[]).filter(c=>c.done).map(c=>c.done_by_name).filter(Boolean))].join(', ')||'—';
    const missTxt=missing.length?missing.map(m=>K.escapeHtml(m.text)).join('; '):'нет данных чек-листа';
    html+=`<div style="margin-top:10px;background:var(--red-soft);border:1px solid #f0c9c4;border-radius:10px;padding:10px 12px">
      <div style="font-weight:700;color:var(--red);font-size:13px">⚠ Выдан неполным — пропущено ${missing.length}</div>
      <div style="font-size:12.5px;color:var(--ink-2);margin-top:4px">${missTxt}</div>
      <div style="font-size:11.5px;color:var(--ink-3);margin-top:4px">Собирал(а): ${K.escapeHtml(whoList)}</div>
    </div>`;
  }
  // Оценка сборки — руководитель ставит ⭐ на собранном/выданном заказе.
  const canRate=canAssign && o.assigned_to && (o.is_assembled || ['out','over','closed'].includes(o.st));
  const curStars=o.rating?Number(o.rating.stars):0;
  if(canRate){
    const starsHtml=[1,2,3,4,5].map(n=>`<span class="od-star" data-star="${n}" style="cursor:pointer;font-size:22px;line-height:1;color:${n<=curStars?'var(--gold)':'var(--line)'}">${n<=curStars?'★':'☆'}</span>`).join('');
    html+=`<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
      <div class="set-field" style="align-items:center"><span class="k">Оценка сборки</span><span id="odStars" style="display:flex;gap:3px">${starsHtml}</span></div>
      <textarea id="odRateNote" placeholder="Заметка (необязательно)…" maxlength="500" rows="2" style="width:100%;margin-top:8px;border:1.5px solid var(--line);border-radius:10px;padding:8px 12px;font-family:inherit;font-size:13.5px;background:var(--surface-2);color:var(--ink);resize:vertical">${K.escapeHtml(o.rating?.note||'')}</textarea>
      <button class="btn" id="odRateSave" style="margin-top:8px"${curStars?'':' disabled'}>Сохранить оценку</button>
      ${o.rating?`<div style="font-size:11.5px;color:var(--ink-3);margin-top:6px">Оценил(а): ${K.escapeHtml(o.rating.rated_by_name||'—')}</div>`:''}
    </div>`;
  }
  document.getElementById('odAssembly').innerHTML=html;
  document.getElementById('odAssignSel')?.addEventListener('change',async e=>{
    const val=e.target.value||null;
    try{
      const fresh=await API.Orders.assign(o.uuid,val);
      const idx=orders.findIndex(x=>x.uuid===o.uuid); if(idx!==-1)orders[idx]=fresh;
      if(currentOrderId===fresh.id)renderChecklistAndHistory(fresh);
      toast(val?'Назначена ответственная':'Ответственная снята','✓');
    }catch(err){ toast(err.message||'Ошибка','!'); }
  });
  if(canRate){
    let picked=curStars;
    const paint=(n)=>document.querySelectorAll('#odStars .od-star').forEach(s=>{const v=+s.dataset.star;s.textContent=v<=n?'★':'☆';s.style.color=v<=n?'var(--gold)':'var(--line)';});
    document.querySelectorAll('#odStars .od-star').forEach(s=>s.addEventListener('click',()=>{picked=+s.dataset.star;paint(picked);const b=document.getElementById('odRateSave');if(b)b.disabled=false;}));
    document.getElementById('odRateSave')?.addEventListener('click',async()=>{
      if(picked<1)return;
      const btn=document.getElementById('odRateSave'); btn.disabled=true; btn.textContent='Сохраняем…';
      try{
        const note=document.getElementById('odRateNote').value.trim();
        await API.Orders.rate(o.uuid,picked,note);
        o.rating={stars:picked,note,rated_by_name:API.state.me?.name};
        toast('Оценка сохранена','✓'); btn.textContent='Сохранить оценку';
      }catch(err){ toast(err.message||'Ошибка','!'); btn.disabled=false; btn.textContent='Сохранить оценку'; }
    });
  }
}

// Метрики сборщицы (полнота/вовремя/⭐) — общий рендер для профиля и вида руководителя.
// null в проценте → «нет данных» (не выдумываем).
async function renderAssemblerStats(bodyEl, userId){
  if(!bodyEl)return;
  bodyEl.innerHTML='<div style="color:var(--ink-3);font-size:13px;padding:6px 0">Загрузка…</div>';
  let s;
  try{ s=await API.Team.stats(userId); }
  catch(e){ bodyEl.innerHTML='<div style="color:var(--ink-3);font-size:13px;padding:6px 0">Нет доступа</div>'; return; }
  const pct=(v)=> v==null?'<span style="color:var(--ink-3)">нет данных</span>':`${v}%`;
  const rating= s.avg_rating!=null ? `${Number(s.avg_rating).toFixed(1)} ⭐ <span style="color:var(--ink-3);font-weight:400">(${s.ratings_count})</span>` : '<span style="color:var(--ink-3)">нет оценок</span>';
  bodyEl.innerHTML=`
    <div class="prf-field"><span class="k">Собрано заказов</span><span class="v">${s.orders_done}</span></div>
    <div class="prf-field"><span class="k">Полнота сборки</span><span class="v">${pct(s.assembled_pct)}</span></div>
    <div class="prf-field"><span class="k">Выдано вовремя</span><span class="v">${pct(s.ontime_pct)}</span></div>
    <div class="prf-field"><span class="k">Средняя оценка</span><span class="v">${rating}</span></div>`;
}

// Чек-лист сборки + история — вынесено отдельно, т.к. рендерится дважды:
// сразу из кэша (список) и повторно после дозагрузки полных деталей заказа.
function renderChecklistAndHistory(o){
  const checkCard=document.getElementById('odCheckCard');
  const checks=o.checklist||[];
  const done=checks.filter(c=>c.done).length;
  if(o.st==='build'){
    checkCard.style.display='';
    document.getElementById('odCheckMeta').textContent=`${done} из ${checks.length} готово`;
    document.getElementById('odChecks').innerHTML=checks.map(c=>{
      const who=c.done?(c.done_by_name||teamMembers.find(m=>m.id===c.done_by)?.name||'—'):'—';
      return `<div class="check-row${c.done?' on':''}" data-cid="${K.escapeHtml(c.id)}"><div class="cb${c.done?' on':''}">${c.done?'✓':''}</div><div class="ct">${K.escapeHtml(c.text)}</div><div class="cr-who">${K.escapeHtml(who)}</div></div>`;
    }).join('');
    // Кнопка «Собрано» — активна только при 100% отмеченных
    const wrap=document.getElementById('odAssembleBtnWrap');
    if(wrap){
      const all=checks.length>0 && done===checks.length;
      if(o.is_assembled){
        wrap.innerHTML='<div style="color:var(--green);font-weight:700;font-size:14px">✓ Заказ собран</div>';
      }else{
        wrap.innerHTML=`<button class="btn" id="odAssembleBtn"${all?'':' disabled style="opacity:.5;cursor:not-allowed"'}>Собрано${all?'':` · ${done} из ${checks.length}`}</button>`;
        document.getElementById('odAssembleBtn')?.addEventListener('click',async()=>{
          const b=document.getElementById('odAssembleBtn'); b.disabled=true; b.textContent='Сохраняем…';
          try{
            const fresh=await API.Orders.setAssembled(o.uuid,true);
            const idx=orders.findIndex(x=>x.uuid===o.uuid); if(idx!==-1)orders[idx]=fresh;
            if(currentOrderId===fresh.id)renderChecklistAndHistory(fresh);
            toast('Заказ собран','✓');
          }catch(err){ toast(err.message||'Не удалось','!'); b.disabled=false; b.textContent='Собрано'; }
        });
      }
    }
  }else{checkCard.style.display='none';}
  renderAssemblyCard(o);
  const hist=(o.history||[]).map(h=>{
    const d=new Date(h.created_at);
    const t=isNaN(d)?'':`${d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})} ${d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
    return {t,x:h.detail||h.event};
  });
  document.getElementById('odHist').innerHTML=hist.length?hist.map(h=>
    `<div class="hist-row"><div class="hist-dot"></div><div class="t">${K.escapeHtml(h.t)}</div><div class="x">${K.escapeHtml(h.x)}</div></div>`).join('')
    :'<div style="text-align:center;padding:16px;color:var(--ink-3);font-size:13px">Событий пока нет</div>';
}
function openOrder(id){
  const o=orders.find(x=>x.id===String(id));
  if(!o){go('order');return;}
  currentOrderId=o.id;
  document.getElementById('odArt').innerHTML=costumeSVG(o.lines[0].t);
  document.getElementById('odTitle').textContent=`Заказ №${o.id}`;
  document.getElementById('odMeta').textContent=[o.cl,o.phone,o.sub].filter(Boolean).join(' · ');
  const stEl=document.getElementById('odStatus');
  stEl.className='st '+o.st;
  stEl.textContent=o.stl;
  document.getElementById('odTl').innerHTML=K.renderOrderFlow(o);
  // позиции
  const lines=o.lines.map(li=>{
    const qty=li.qty||1;
    const total=li.pd?li.pd*o.days*qty:0;
    const d2=li.pd?`× ${o.days} дн${qty>1?` × ${qty}`:''} = ${fmt(total)}`:'—';
    return `<div class="line-item"><div class="li-img">${costumeSVG(li.t)}</div><div class="li-main"><div class="nm">${K.escapeHtml(li.name)}</div><div class="ds">${K.escapeHtml(li.desc||'')}</div></div><div class="li-price"><div class="p">${li.pd?fmt(li.pd)+'/день':''}</div><div class="d">${d2}</div></div></div>`;
  }).join('');
  document.getElementById('odItems').innerHTML=lines;
  document.getElementById('odItemsMeta').textContent=`${o.lines.length} ${K.pluralItems(o.lines.length)} · ${o.days} ${K.pluralDays(o.days)} · ${o.slotL||'Утро'}`;
  renderChecklistAndHistory(o);
  // деньги
  const pb=document.getElementById('odPayBadge');
  const oPaid=o.paidAmount||0, oTot=o.total_raw||0;
  const oRem=o.remaining!=null?o.remaining:Math.max(0,oTot-oPaid);
  const oFully=o.paid||oRem<=0;
  pb.textContent=oFully?'✓ Оплачено':(oPaid>0?`Оплачено ${fmt(oPaid)} из ${fmt(oTot)}`:'Ожидает оплаты');
  pb.style.background=oFully?'':'var(--gold-soft)';
  pb.style.color=oFully?'':'var(--gold)';
  const moneyLines=o.lines.map(li=>{
    if(!li.pd)return '';
    const qty=li.qty||1;
    return `<div class="money-line"><span class="k">${K.escapeHtml(li.name)} · ${fmt(li.pd)} × ${o.days} дня${qty>1?` × ${qty}`:''}</span><span class="v">${fmt(li.pd*o.days*qty)}</span></div>`;
  }).join('');
  const subtotal=o.lines.reduce((s,li)=>s+(li.pd||0)*o.days*(li.qty||1),0);
  const delCost=o.del.cost||0;
  const total=subtotal-(o.disc||0)+delCost;
  document.getElementById('odMoney').innerHTML=moneyLines+
    (o.disc?`<div class="money-line"><span class="k">${K.escapeHtml(o.discL||'Скидка')}</span><span class="v" style="color:var(--green)">−${fmt(o.disc)}</span></div>`:'')+
    (delCost?`<div class="money-line"><span class="k">Доставка</span><span class="v">${fmt(delCost)}</span></div>`:'')+
    `<div class="money-line total"><span class="k">Итого</span><span class="v">${fmt(total)}</span></div>`;
  document.getElementById('odDep').textContent=o.dep?fmt(o.dep):'—';
  document.getElementById('odPay').textContent=o.pay;
  // доставка
  const delEl=document.getElementById('odDelBlock');
  const addr=K.orderAddr(o);
  const phone=o.phone||'';
  if(addr){
    delEl.innerHTML=`<div class="loc-card" style="width:100%">
      <div class="loc-k">Где клиент</div>
      <div class="loc-v">${K.escapeHtml(addr)}</div>
      ${phone?`<div class="loc-ph">${K.escapeHtml(phone)}</div>`:''}
      <div class="del-actions">
        <button type="button" class="btn sm" id="pcOpenLoc">Открыть в картах</button>
        <button type="button" class="btn ghost sm" id="pcDelCopy">Скопировать</button>
      </div>
    </div>`;
    document.getElementById('pcOpenLoc')?.addEventListener('click',()=>K.openLocSheet({addr,phone,name:o.cl,oid:o.id}));
    document.getElementById('pcDelCopy')?.addEventListener('click',async()=>{
      try{ await navigator.clipboard.writeText(K.copyRideText(o)); toast('Адрес и телефон скопированы','✓'); }
      catch{ toast('Не скопировалось','!'); }
    });
  }else{
    delEl.innerHTML=`<div class="loc-card"><div class="loc-k">Адрес</div><div style="font-size:13px;color:var(--ink-3)">не указан — добавьте в карточке клиента</div></div>`;
  }
  // действия — главная кнопка зависит от статуса (req → book → conf, не пропускаем шаг)
  const mainAction=K.orderMainLabel(o.st, API.state.me?.role);
  const emp=API.state.me?.role==='employee';
  const empCanAdvance=emp && o.st==='conf' && o.assigned_to===API.state.me?.id;
  const showMain=!!mainAction && (!emp || empCanAdvance);
  const canPay=oRem>0 && o.st!=='cancelled' && !emp;
  document.getElementById('odActions').innerHTML=
    (showMain?`<button class="btn" type="button" id="odAdvance">${K.escapeHtml(mainAction)}</button>`:'')+
    (canPay?`<button class="btn pay-cta" id="odPayBtn" type="button">${oPaid>0?'Доплатить ':'Принять '}${fmt(oRem)}</button>`:'')+
    `<div class="act-row">
      <button type="button" class="act-ghost" id="odMsgCl">Написать в Telegram</button>
      ${(o.st!=='closed'&&o.st!=='req'&&o.st!=='cancelled'&&!emp)?`<button type="button" class="act-ghost danger" id="odCancel">Отменить</button>`:''}
    </div>`;
  document.getElementById('odPayBtn')?.addEventListener('click',()=>openPayModal(o));
  document.getElementById('odMsgCl')?.addEventListener('click',()=>{
    if(!K.openClientChat({telegram:o.telegram, phone:o.phone})) toast('Нет телефона клиента','!');
  });
  document.getElementById('odCancel')?.addEventListener('click',async()=>{
    const ok=await K.confirmDialog(`Отменить заказ №${o.id}?`,{title:'Отмена заказа',ok:'Отменить',cancel:'Не отменять',danger:true});
    if(!ok)return;
    try{
      await API.Orders.setStatus(o.uuid,'cancelled');
      const fresh=await API.Orders.one(o.uuid);
      const idx=orders.findIndex(x=>x.uuid===o.uuid);
      if(idx!==-1)orders[idx]=fresh;
      renderOrdersTable();applyOrdFilters();renderOrdMiniCal();renderOrdNear();
      openOrder(fresh.id);
      toast('Заказ отменён','✕');
    }catch(err){ toast(err.message||'Не удалось отменить','!'); }
  });
  go('order');
  // обновляем шапку под конкретный заказ
  document.getElementById('pgT').textContent=`Заказ №${o.id}`;
  document.getElementById('pgSub').textContent=`${o.cl} · ${o.stl.toLowerCase()}`;
  // Список отдаёт только сводку — чек-лист/историю дозагружаем полной карточкой.
  // Пропускаем, если уже есть свежие данные (например, сразу после создания/смены статуса).
  if(!o.checklist && !o.history && o.uuid){
    API.Orders.one(o.uuid).then(fresh=>{
      const idx=orders.findIndex(x=>x.uuid===o.uuid);
      if(idx!==-1)orders[idx]=fresh;
      if(currentOrderId!==fresh.id)return; // пользователь уже открыл другой заказ
      renderChecklistAndHistory(fresh);
    }).catch(()=>{});
  }
}
window.openOrder=openOrder;

// кнопка «назад» в шапке
document.getElementById('backBtn').onclick=()=>go('orders');

// ===== Toast helper =====
function toast(msg,icon='✓'){
  let t=document.querySelector('.toast');
  if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}
  t.innerHTML=`<span class="ic">${K.escapeHtml(icon)}</span>${K.escapeHtml(msg)}`;
  requestAnimationFrame(()=>t.classList.add('on'));
  clearTimeout(t._h);
  t._h=setTimeout(()=>t.classList.remove('on'),2200);
}
window.toast=toast;

// ===== Уведомления =====
const notifications=[
  {ic:'📥',bg:'var(--mint-soft)',cl:'var(--green)',t:'Новый запрос из Telegram',s:'Адиба Д. · Эльза и принцесса',time:'10 мин',unread:1,go:()=>go('tg')},
  {ic:'⚠️',bg:'var(--red-soft)',cl:'var(--red)',t:'Просрочка возврата',s:'№1031 · Камила Т. · +2 дня',time:'2 ч',unread:1,go:()=>openOrder('1031')},
  {ic:'💰',bg:'var(--gold-soft)',cl:'var(--gold)',t:'Оплата получена',s:'№1045 · Шохрух М. · 310 000 сум',time:'вчера',unread:0,go:()=>openOrder('1045')},
  {ic:'✓',bg:'var(--mint-soft)',cl:'var(--green)',t:'Костюм возвращён',s:'№1042 · Азиза Р. · залог возвращён',time:'вчера',unread:0,go:()=>openOrder('1042')},
];
function buildNotifPop(){
  let pop=document.getElementById('notifPop');
  if(pop)return pop;
  pop=document.createElement('div');
  pop.id='notifPop';pop.className='notif-pop';
  pop.innerHTML=`<div class="nh"><h3>Уведомления</h3><span class="lnk" data-mark-all>Прочитать все</span></div><div class="nb" id="notifBody"></div>`;
  document.body.appendChild(pop);
  pop.addEventListener('click',e=>{
    e.stopPropagation();
    if(e.target.closest('[data-mark-all]')){notifications.forEach(n=>n.unread=0);renderNotifBody();updateBellDot();API.api('/notifications/mark-read',{method:'POST',body:{}}).catch(()=>{});return;}
    const row=e.target.closest('[data-ni]');
    if(row){const n=notifications[+row.dataset.ni];n.unread=0;pop.classList.remove('on');renderNotifBody();updateBellDot();n.go?.();}
  });
  return pop;
}
function renderNotifBody(){
  const e=K.escapeHtml;
  const body=document.getElementById('notifBody');
  if(!body)return;
  body.innerHTML=notifications.length?notifications.map((n,i)=>
    `<div class="notif-row ${n.unread?'unread':''}" data-ni="${i}">
      <div class="nico" style="background:${n.bg};color:${n.cl}">${e(n.ic)}</div>
      <div class="nbody"><div class="t">${e(n.t)}</div><div class="s">${e(n.s)}</div></div>
      <div class="ntime">${e(n.time)}</div>
    </div>`).join('')
    :'<div style="text-align:center;padding:26px 14px;color:var(--ink-3);font-size:13px">Новых уведомлений нет</div>';
}
// Преобразует уведомления с сервера в формат колокольчика (общий адаптер из api.js).
function adaptNotifsPc(apiNotifs){
  return API.notif.adapt(apiNotifs,{openOrder,goTab:go});
}
function updateBellDot(){
  const dot=document.querySelector('.topbar .icon-btn .dot');
  const hasUnread=notifications.some(n=>n.unread);
  if(dot)dot.style.display=hasUnread?'':'none';
}
document.querySelector('.topbar .icon-btn')?.addEventListener('click',e=>{
  e.stopPropagation();
  const pop=buildNotifPop();
  if(!pop.classList.contains('on'))renderNotifBody();
  pop.classList.toggle('on');
});
document.addEventListener('click',e=>{
  const pop=document.getElementById('notifPop');
  if(pop?.classList.contains('on') && !e.target.closest('#notifPop') && !e.target.closest('.topbar .icon-btn'))pop.classList.remove('on');
});
updateBellDot();

// ===== Профиль =====
document.querySelector('.side-user').addEventListener('click',()=>go('profile'));
document.getElementById('prfLogout')?.addEventListener('click',async e=>{
  e.stopPropagation();
  const ok=await K.confirmDialog('Выйти из аккаунта?',{title:'Выход',ok:'Выйти',danger:true});
  if(!ok)return;
  try{ await API.Auth.logout(); }        // POST /api/auth/logout → редирект на /login.html
  catch{ location.replace('/login.html'); }
});
document.getElementById('prfEdit')?.addEventListener('click',e=>{e.stopPropagation();toast('Редактирование профиля — демо','✎');});
document.getElementById('prfEditData')?.addEventListener('click',e=>{e.stopPropagation();toast('Данные сохранены','✓');});

// Выйти со всех устройств — реальный отзыв всех сессий
document.getElementById('prfLogoutAll')?.addEventListener('click',async e=>{
  e.stopPropagation();
  const ok=await K.confirmDialog('Завершить сессии на всех устройствах? На других устройствах потребуется войти заново. Эта сессия останется активной.',{title:'Выйти везде',ok:'Выйти везде',danger:true});
  if(!ok)return;
  try{ await API.Auth.logoutAll(); toast('Все другие сессии завершены','✓'); }
  catch(err){ toast(err.message||'Не удалось','!'); }
});

// Смена пароля — реальный вызов API (кнопка была мёртвой)
document.getElementById('prfChangePwd')?.addEventListener('click',e=>{
  e.stopPropagation();
  openChangePwdModal();
});
function openChangePwdModal(){
  const bg=document.createElement('div');
  bg.className='modal-bg'; bg.setAttribute('role','dialog'); bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card" style="max-width:400px">
    <div class="modal-hd"><h3>Смена пароля</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="error" id="cpErr" style="display:none;background:var(--red-soft);border:1px solid #f0c9c4;color:var(--red);font-size:13px;padding:10px 12px;border-radius:10px;margin-bottom:12px"></div>
      <div class="mf"><label>Текущий пароль</label><input id="cpCur" type="password" autocomplete="current-password" maxlength="200"></div>
      <div class="mf"><label>Новый пароль <span style="color:var(--ink-3);font-weight:400">— минимум 8 символов</span></label><input id="cpNew" type="password" autocomplete="new-password" maxlength="200"></div>
      <div class="mf"><label>Повторите новый пароль</label><input id="cpNew2" type="password" autocomplete="new-password" maxlength="200"></div>
      <div style="font-size:11.5px;color:var(--ink-3);line-height:1.5;background:var(--surface-2);padding:10px 12px;border-radius:10px">После смены пароля все другие устройства будут разлогинены автоматически.</div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="cpSave">Сменить пароль</button></div>
  </div>`;
  document.body.appendChild(bg);
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=e=>{ if(e.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',e=>{if(e.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  const err=bg.querySelector('#cpErr');
  const showErr=m=>{err.textContent=m;err.style.display='block';};
  bg.querySelector('#cpSave').addEventListener('click',async ev=>{
    ev.stopPropagation();
    err.style.display='none';
    const cur=bg.querySelector('#cpCur').value;
    const nw=bg.querySelector('#cpNew').value;
    const nw2=bg.querySelector('#cpNew2').value;
    if(nw.length<8){showErr('Новый пароль — минимум 8 символов');return;}
    if(nw!==nw2){showErr('Пароли не совпадают');return;}
    const btn=bg.querySelector('#cpSave'); btn.disabled=true; btn.textContent='Сохраняем…';
    try{
      await API.Auth.changePassword(cur,nw);
      close();
      toast('Пароль изменён','✓');
    }catch(e){
      showErr(e.message||'Не удалось сменить пароль');
      btn.disabled=false; btn.textContent='Сменить пароль';
    }
  });
  setTimeout(()=>bg.querySelector('#cpCur')?.focus(),50);
}

// Перезагрузка всех данных с сервера + перерисовка (после операций, влияющих на несколько разделов).
async function reloadAllData(){
  const s=await API.loadAll();
  orders.length=0;     orders.push(...s.orders);
  clients.length=0;    clients.push(...s.clients);
  whCostumes.length=0; whCostumes.push(...s.costumes);
  renderOrdersTable(); renderClients(); renderWh();
  applyOrdFilters(); updateOrderPipe();
  renderDashboard(API.state.me); renderMoneyTiles();
  if(API.state.me && !API.calc.isDemoTenant(API.state.me)){
    notifications.length=0; notifications.push(...adaptNotifsPc(s.notifications||[])); updateBellDot();
  }
}

// Приём оплаты по заказу (полная/частичная) → создаёт доход, обновляет долг и «Деньги».
function openPayModal(o){
  const rem=Math.round(o.remaining!=null?o.remaining:Math.max(0,(o.total_raw||0)-(o.paidAmount||0)));
  const paid=Math.round(o.paidAmount||0);
  const tot=Math.round(o.total_raw||0);
  const bg=document.createElement('div');
  bg.className='modal-bg'; bg.setAttribute('role','dialog'); bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card pay-sheet">
    <div class="modal-hd"><h3>Оплата №${K.escapeHtml(o.id)}</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div id="payErr" class="pay-err" hidden></div>
      <div class="pay-hero"><div class="pay-k">К оплате</div><div class="pay-big">${K.fmtMoney(rem)} <small>сум</small></div>
        <div class="pay-sub">заказ ${K.fmtMoney(tot)}${paid?` · уже ${K.fmtMoney(paid)}`:''}</div></div>
      <div class="pay-chips">
        <button type="button" class="pay-chip on" data-amt="${rem}">Всё</button>
        ${rem>1?`<button type="button" class="pay-chip" data-amt="${Math.round(rem/2)}">Половина</button>`:''}
      </div>
      <div class="mf"><label>Сумма, сум</label><input id="payAmount" class="pay-inp" type="text" inputmode="numeric" value="${K.fmtMoney(rem)}"></div>
      <div class="pay-methods" id="payMethods">
        <button type="button" class="pay-method on" data-m="Наличные">Нал</button>
        <button type="button" class="pay-method" data-m="Карта">Карта</button>
        <button type="button" class="pay-method" data-m="Перевод">Перевод</button>
      </div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="paySave">Принять ${K.fmtMoney(rem)}</button></div>
  </div>`;
  document.body.appendChild(bg);
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=e=>{ if(e.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',e=>{if(e.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  const err=bg.querySelector('#payErr');
  const amtEl=bg.querySelector('#payAmount');
  const save=bg.querySelector('#paySave');
  let method='Наличные';
  const readAmt=()=>Math.round(Number(String(amtEl.value).replace(/\D/g,''))||0);
  const paintAmt=()=>{ const n=readAmt(); save.textContent=n?`Принять ${K.fmtMoney(n)}`:'Принять оплату'; };
  bg.querySelectorAll('.pay-chip').forEach(c=>c.addEventListener('click',()=>{
    bg.querySelectorAll('.pay-chip').forEach(x=>x.classList.toggle('on',x===c));
    amtEl.value=K.fmtMoney(+c.dataset.amt); paintAmt();
  }));
  bg.querySelector('#payMethods').addEventListener('click',e=>{
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
      close(); toast('Оплата принята','✓');
      await reloadAllData();
      openOrder(o.id);
    }catch(e){
      err.textContent=e.message||'Не удалось принять оплату'; err.hidden=false;
      save.disabled=false; paintAmt();
    }
  });
  setTimeout(()=>amtEl.focus(),50);
}

// ===== Карточка заказа: тосты на кнопки действий =====
document.addEventListener('click',e=>{
  const b=e.target.closest('#order .od-actions .btn.ghost, #order .btn.ghost.sm');
  if(!b)return;
  const text=(b.textContent||'').trim();
  if(/Вызвать курьера/i.test(text)){return;}
});

// ===== Деньги: клики =====
document.addEventListener('click',e=>{
  if(document.querySelector('.view.active')?.id!=='money')return;
  const t=e.target;
  if(t.closest('.txn'))toast('Детали транзакции (демо)','💸');
  else if(t.closest('.lnk'))toast('Открываю детальный отчёт (демо)','📊');
  else {
    const btn=t.closest('button.btn');
    if(btn && /расход/i.test(btn.textContent||''))toast('Форма расхода (демо)','💰');
  }
});

// ===== Настройки: кнопка Сохранить =====
const setBar=document.createElement('div');
setBar.id='setSaveBar';
setBar.style.cssText='position:sticky;bottom:0;background:var(--surface);border-top:1px solid var(--line);padding:14px 22px;display:none;justify-content:flex-end;gap:10px;margin:18px -28px -28px;border-radius:0 0 18px 18px';
setBar.innerHTML='<button class="btn ghost" id="setCancel">Отменить</button><button class="btn" id="setSave">Сохранить изменения</button>';
document.getElementById('settings')?.appendChild(setBar);
document.getElementById('settings')?.addEventListener('change',()=>setBar.style.display='flex');
document.getElementById('settings')?.addEventListener('click',e=>{
  if(e.target.closest('.toggle'))setBar.style.display='flex';
});
document.getElementById('setSave').addEventListener('click',()=>{
  toast('Настройки сохранены','✓');setBar.style.display='none';
});
document.getElementById('setCancel').addEventListener('click',()=>setBar.style.display='none');

// ===== Глобальный поиск в топбаре — работает на всех страницах =====
const topbarSearch=document.querySelector('.topbar .search input');
if(topbarSearch){
  topbarSearch.placeholder='Поиск заказа, клиента, костюма…';
  topbarSearch.addEventListener('input',e=>{
    const q=e.target.value.trim().toLowerCase();
    if(!q){
      // сброс — на текущей странице
      const v=document.querySelector('.view.active')?.id;
      if(v==='orders'){ordQ='';applyOrdFilters();}
      else if(v==='clients')document.querySelectorAll('#clientsBody tr').forEach(r=>r.style.display='');
      else if(v==='wh')document.querySelectorAll('.wh-card').forEach(c=>c.classList.remove('hidden'));
      return;
    }
    const v=document.querySelector('.view.active')?.id;
    if(v==='orders'){ordQ=q;applyOrdFilters();}
    else if(v==='clients'){
      document.querySelectorAll('#clientsBody tr').forEach(r=>{
        const txt=(r.textContent||'').toLowerCase();
        r.style.display=txt.includes(q)?'':'none';
      });
    }
    else if(v==='wh'){
      document.querySelectorAll('.wh-card').forEach(c=>{
        const txt=(c.textContent||'').toLowerCase();
        c.classList.toggle('hidden',!txt.includes(q));
      });
    } else {
      // переключиться на заказы и применить
      go('orders');ordQ=q;applyOrdFilters();
      const sLocal=document.getElementById('ordSearch');if(sLocal)sLocal.value=q;
    }
  });
}

// ===== Новый заказ: реальная логика =====
const _pnoT0=new Date(K.TODAY.y,K.TODAY.m,K.TODAY.d);
const _pnoIso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const pno={clId:null,items:[],from:_pnoIso(_pnoT0),to:_pnoIso(_pnoT0),slot:'am',addr:'',pay:'Карта',dep:0,depAuto:false};
let pcPickMode=false;
const pcFmt=K.fmtMoney;
const pcDays=()=>Math.max(1,Math.round((new Date(pno.to)-new Date(pno.from))/86400000));
function pnoRenderCl(filter=''){
  const list=document.getElementById('pnoClList');
  const picked=document.getElementById('pnoClPicked');
  const search=document.getElementById('pnoClSearch');
  if(pno.clId!=null && !filter){
    const c=clients[pno.clId];
    picked.style.display='';
    picked.innerHTML=`<div class="cl-sug sel" style="padding:10px 12px"><div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(c.g)})">${K.escapeHtml(c.av)}</div><div style="flex:1"><div class="nm">${K.escapeHtml(c.name)}</div><div class="sub">${K.escapeHtml(c.sub)} · ${c.orders} заказов</div></div><button data-clrm style="background:none;border:none;color:var(--ink-3);font-size:20px;cursor:pointer">×</button></div>`;
    list.style.display='none';search.style.display='none';
    const addrs=K.parseAddresses(c);
    if(!pno.addr && addrs[0]) pno.addr=addrs[0];
    K.renderAddrPick(document.getElementById('pnoAddrPick'),c,pno.addr,v=>{pno.addr=v;pnoRenderCl();});
    return;
  }
  search.style.display='';picked.style.display='none';
  K.renderAddrPick(document.getElementById('pnoAddrPick'),null,'');
  const f=filter.trim().toLowerCase();
  if(!f){list.style.display='none';return;}
  list.style.display='';
  list.innerHTML=clients.map((c,i)=>({c,i})).filter(({c})=>c.name.toLowerCase().includes(f))
    .map(({c,i})=>`<div class="cl-sug" data-cli="${i}" style="margin-top:4px"><div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(c.g)})">${K.escapeHtml(c.av)}</div><div style="flex:1"><div class="nm">${K.escapeHtml(c.name)}</div><div class="sub">${K.escapeHtml(c.sub)} · ${c.orders} заказов</div></div></div>`).join('') ||
    '<div style="text-align:center;padding:14px;color:var(--ink-3);font-size:13px">Не найдено</div>';
}
function pnoRenderItems(){
  const list=document.getElementById('pnoItemsList');
  if(!pno.items.length){
    list.innerHTML='<div style="padding:14px 0;text-align:center;color:var(--ink-3);font-size:13px">Корзина пуста</div>';
    document.getElementById('pnoItemsMeta').textContent='';return;
  }
  const d=pcDays();
  list.innerHTML=pno.items.map((it,i)=>
    `<div class="line-item"><div class="li-img">${costumeSVG(it.t)}</div><div class="li-main"><div class="nm">${K.escapeHtml(it.name)}</div><div class="ds">${K.escapeHtml(it.desc||'')}</div></div><div class="li-price"><div class="p">${pcFmt(it.pd)}/день</div><div class="d">× ${d} = ${pcFmt(it.pd*d)}</div></div><button class="no-rm" data-ri="${i}">×</button></div>`).join('');
  document.getElementById('pnoItemsMeta').textContent=`${pno.items.length} ${K.pluralItems(pno.items.length)} · ${d} ${K.pluralDays(d)}`;
}
function pnoRenderSummary(){
  const d=pcDays();
  document.getElementById('pnoDays').textContent=`${d} ${K.pluralDays(d)}`;
  const lines=pno.items.map(it=>`<div class="calc-ln"><span>${K.escapeHtml(it.name)} · ${pcFmt(it.pd)} × ${d}</span><span style="color:#EAFBF1">${pcFmt(it.pd*d)}</span></div>`).join('');
  const subtotal=pno.items.reduce((s,it)=>s+it.pd*d,0);
  const total=subtotal;
  document.getElementById('pnoSummary').innerHTML=
    `<div class="no-hd"><span class="no-n" style="background:rgba(255,255,255,.12);color:#9FE3C0">✓</span><h3 style="color:#EAFBF1;margin:0">Итого</h3></div>`+
    (lines||'<div class="calc-ln"><span style="color:rgba(221,243,228,.55)">Костюмы не выбраны</span><span style="color:#EAFBF1">0</span></div>')+
    `<div class="calc-ln tot"><span>К оплате</span><span>${pcFmt(total)}</span></div>`+
    `<div class="calc-ln" style="margin-top:8px"><span>Залог</span><span style="color:#9FE3C0;font-weight:700">${pcFmt(pno.dep)}</span></div>`;
}
function pnoRenderAll(){pnoRenderCl();pnoRenderItems();pnoRenderSummary();}
pnoRenderAll();
document.getElementById('pnoFrom').value=pno.from;
document.getElementById('pnoTo').value=pno.to;
document.getElementById('pnoDep').value='';
// клиент
document.getElementById('pnoClSearch').addEventListener('input',e=>pnoRenderCl(e.target.value));
document.getElementById('pnoClList').addEventListener('click',e=>{
  const row=e.target.closest('[data-cli]');
  if(row){
    pno.clId=+row.dataset.cli;
    const c=clients[pno.clId];
    pno.addr=K.parseAddresses(c)[0]||'';
    document.getElementById('pnoClSearch').value='';
    pnoRenderCl();
  }
});
document.getElementById('pnoClPicked').addEventListener('click',e=>{
  if(e.target.closest('[data-clrm]')){pno.clId=null;pno.addr='';pnoRenderCl();}
});
// удалить позицию
document.getElementById('pnoItemsList').addEventListener('click',e=>{
  const rm=e.target.closest('[data-ri]');
  if(rm){pno.items.splice(+rm.dataset.ri,1);pnoRenderItems();pnoRenderSummary();}
});
// pickMode → склад
function pcRenderWhForPick(){
  const sec=document.getElementById('wh');
  let bar=document.getElementById('pcPickBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='pcPickBar';
    bar.style.cssText='position:sticky;top:0;background:var(--surface);padding:14px 18px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--line);z-index:5;margin-bottom:14px;border-radius:14px;box-shadow:var(--shadow)';
    sec.insertBefore(bar,sec.firstChild);
  }
  bar.innerHTML=`<div style="flex:1"><div style="font-size:14px;font-weight:700">Выберите костюмы для заказа</div><div style="font-size:12px;color:var(--ink-3)" id="pcPickCount">${pno.items.length} выбрано</div></div><button class="btn" id="pcPickDone">Готово · в форму →</button>`;
  bar.style.display='';
  document.querySelectorAll('#whGrid .wh-card').forEach(c=>{
    const t=c.dataset.t;
    const cnt=pno.items.filter(it=>it.t===t).length;
    c.style.outline=cnt?'2px solid var(--primary)':'';
    c.style.position='relative';
    let badge=c.querySelector('.pc-pick-badge');
    if(cnt){
      if(!badge){badge=document.createElement('div');badge.className='pc-pick-badge';badge.style.cssText='position:absolute;top:10px;right:10px;background:var(--primary);color:#fff;font-weight:700;font-size:13px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;z-index:2';c.appendChild(badge);}
      badge.textContent=cnt;
    }else if(badge){badge.remove();}
  });
}
function pcHideWhPick(){
  const bar=document.getElementById('pcPickBar');if(bar)bar.style.display='none';
  document.querySelectorAll('#whGrid .wh-card').forEach(c=>{c.style.outline='';c.querySelector('.pc-pick-badge')?.remove();});
}
document.getElementById('pnoPickFromWh').addEventListener('click',e=>{
  e.stopPropagation();pcPickMode=true;go('wh');pcRenderWhForPick();
});
document.addEventListener('click',e=>{
  if(!pcPickMode)return;
  if(e.target.closest('#pcPickDone')){pcPickMode=false;pcHideWhPick();go('new-order');pnoRenderItems();pnoRenderSummary();return;}
  const card=e.target.closest('#whGrid .wh-card');
  if(!card)return;
  const t=card.dataset.t;
  const c=whCostumes.find(x=>x.type===t);if(!c)return;
  const pickedQty=pno.items.filter(it=>it.t===t).length;
  if(pickedQty>=c.avail){toast('Больше нет свободных единиц этого костюма','!');return;}
  e.stopPropagation();
  pno.items.push({costume_id:c.id,t:c.type,name:c.name,desc:c.sizes?`размер ${String(c.sizes).split(',')[0].trim()}`:'',pd:c.price_raw});
  pcRenderWhForPick();
});
// даты
document.getElementById('pnoFrom').addEventListener('change',e=>{
  pno.from=e.target.value;
  if(!pno.to || pno.to < pno.from){ pno.to=pno.from; document.getElementById('pnoTo').value=pno.to; }
  pnoRenderItems();pnoRenderSummary();
});
document.getElementById('pnoTo').addEventListener('change',e=>{pno.to=e.target.value;pnoRenderItems();pnoRenderSummary();});
document.getElementById('pnoSlot')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-slot]'); if(!b)return;
  b.parentElement.querySelectorAll('.pay-opt').forEach(x=>x.classList.toggle('active',x===b));
  pno.slot=b.dataset.slot;
});
// оплата
document.getElementById('pnoPay').addEventListener('click',e=>{
  const b=e.target.closest('[data-pay]');if(!b)return;
  b.parentElement.querySelectorAll('.pay-opt').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  pno.pay=b.dataset.pay;
});
// залог
document.getElementById('pnoDep').addEventListener('input',e=>{
  const n=+e.target.value.replace(/\D/g,'');
  pno.dep=n||0; e.target.value=n?pcFmt(n):'';
  pnoRenderSummary();
});
// создать — реальный вызов API, без локальной подмены
document.getElementById('pnoCreate').addEventListener('click',async e=>{
  e.stopPropagation();
  if(pno.clId==null){toast('Выберите клиента','!');return;}
  if(!pno.items.length){toast('Добавьте хотя бы один костюм','!');return;}
  if(new Date(pno.to) < new Date(pno.from)){toast('Дата возврата не может быть раньше выдачи','!');return;}
  const cl=clients[pno.clId];
  const btn=e.currentTarget;
  const prevText=btn.textContent;
  btn.disabled=true;btn.textContent='Создаём…';
  try{
    const created=await API.Orders.create({
      client_id:cl.id,
      issue_date:pno.from,
      return_date:pno.to,
      slot:pno.slot||'am',
      delivery_addr:pno.addr||'',
      deposit:pno.dep,
      payment_method:pno.pay,
      paid:false,
      items:pno.items.map(it=>({costume_id:it.costume_id,qty:1})),
    });
    orders.unshift(created);
    renderOrdersTable();applyOrdFilters();renderOrdMiniCal();renderOrdNear();renderCal();updateOrderPipe();
    pno.items.length=0;
    pno.clId=null;
    pno.addr='';
    pno.dep=0;
    pno.slot='am';
    pno.from=_pnoIso(new Date(K.TODAY.y,K.TODAY.m,K.TODAY.d));
    pno.to=pno.from;
    document.getElementById('pnoFrom').value=pno.from;
    document.getElementById('pnoTo').value=pno.to;
    document.getElementById('pnoDep').value='';
    document.querySelectorAll('#pnoSlot .pay-opt').forEach(x=>x.classList.toggle('active',x.dataset.slot==='am'));
    pnoRenderAll();
    openOrder(created.id);
    toast('Заказ создан','✓');
  }catch(err){
    toast(err.message||'Не удалось создать заказ','!');
  }finally{
    btn.disabled=false;btn.textContent=prevText;
  }
});

// ===== Клиенты =====
const clients=[];
function renderClients(){
  document.getElementById('clientsBody').innerHTML=clients.map((c,i)=>`
    <tr data-cl-type="${K.escapeHtml(c.type)}" data-ci="${i}" style="cursor:pointer;${c.debt?'background:var(--red-soft)':''}">
      <td><div class="cl-cell"><div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(c.g)})">${K.escapeHtml(c.av)}</div><div><div class="nm">${K.escapeHtml(c.name)}</div>${K.parseAddresses(c)[0]?`<div class="sub">${K.locPinHtml(K.parseAddresses(c)[0],{phone:c.phone,name:c.name})}</div>`:''}</div></div></td>
      <td><span class="badge ${K.escapeHtml(c.type)}">${K.escapeHtml(c.sub)}</span></td>
      <td>${c.orders}</td>
      <td>${K.escapeHtml(c.last||'')}</td>
      <td><b>${K.escapeHtml(c.sum||'')}</b></td>
      <td>${c.debt?`<span class="st over">${Math.round(c.debt/1000)} тыс</span>`:'<span style="color:var(--ink-3)">—</span>'}</td>
      <td><button class="row-act" aria-label="Действия">⋯</button></td>
    </tr>`).join('');
  // Верхние плитки — реальные агрегаты (раньше были захардкожены: 47/12/35/23/186/1/150k)
  const setT=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  const orgCount=clients.filter(c=>c.type==='org').length;
  const personCount=clients.filter(c=>c.type==='person').length;
  const totalOrders=clients.reduce((s,c)=>s+(Number(c.orders)||0),0);
  const debtors=clients.filter(c=>Number(c.debt)>0);
  const debtSum=debtors.reduce((s,c)=>s+Number(c.debt),0);
  // «Активные в этом месяце» — клиенты с last_order_at в текущем месяце (заказы уже загружены — считаем по ним)
  const now=new Date();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const activeIds=new Set((orders||[]).filter(o=>o.issue_date&&o.issue_date.startsWith(ym)&&o.client_id).map(o=>o.client_id));
  setT('clientsTileTotal',clients.length);
  setT('clientsTileTotalSub', clients.length?`${orgCount} ${K.plural(orgCount,['организация','организации','организаций'])} · ${personCount} ${K.plural(personCount,['физлицо','физлица','физлиц'])}`:'ещё нет клиентов');
  setT('clientsTileActive',activeIds.size);
  setT('clientsTileOrders',totalOrders);
  setT('clientsTileDebtors',debtors.length);
  setT('clientsTileDebtorsSub', debtSum?`${Math.round(debtSum).toLocaleString('ru-RU')} сум не возвращено`:'нет задолженностей');
}
// Делегированный клик — не пересоздаём listeners при перерендере
document.getElementById('clientsBody').addEventListener('click',e=>{
  const tr=e.target.closest('tr[data-ci]');
  if(tr)openClient(+tr.dataset.ci);
});
renderClients();

function openClient(idx){
  const c=clients[idx];if(!c)return;
  // textContent безопасен, не нуждается в escapeHtml
  document.getElementById('clAv').textContent=c.av;
  document.getElementById('clAv').style.background=`linear-gradient(135deg,${K.escapeHtml(c.g)})`;
  document.getElementById('clName').textContent=c.name;
  const tp=document.getElementById('clType');tp.textContent=c.sub;tp.className='badge '+c.type;
  document.getElementById('clSince').textContent='клиент с '+(c.last||'—');
  const addrs=K.parseAddresses(c);
  const contact=[c.phone&&c.phone,c.email&&c.email,c.telegram&&c.telegram].filter(Boolean).join(' · ');
  document.getElementById('clContact').textContent=contact||'контактных данных нет';
  document.getElementById('clTotalOrd').textContent=c.orders;
  document.getElementById('clTotalSum').textContent=c.sum||'0';
  document.getElementById('clLast').textContent=c.last||'—';
  document.getElementById('clDebtTile').style.display=c.debt?'':'none';
  document.getElementById('clDebt').textContent=c.debt?Math.round(c.debt/1000)+' тыс':'—';
  // поля — innerHTML с escape
  const fields=[
    ['Имя / название',c.name],
    ['Тип',c.sub],
    ['Телефон',c.phone||'—'],
    ['Email',c.email||'—'],
    ['Telegram',c.telegram||'—'],
    ...((addrs.length?addrs:['не указан']).map((a,i)=>[i?'Ещё адрес':'Адрес',a])),
  ];
  document.getElementById('clFields').innerHTML=fields.map(([k,v])=>
    `<div class="prf-field"><span class="k">${K.escapeHtml(k)}</span><span class="v">${addrs.includes(v)?K.locPinHtml(v,{phone:c.phone,name:c.name}):K.escapeHtml(v)}</span></div>`).join('');
  // заметка
  document.getElementById('clNote').textContent=c.note||'Заметок нет';
  document.getElementById('clNoteCard').style.display=c.note?'':'none';
  // заказы клиента
  const ords=orders.filter(o=>o.cl===c.name);
  const last=ords[0];
  if(last){
    document.getElementById('clLastOrderCard').style.display='';
    document.getElementById('clLastOrder').innerHTML=`<div class="cl-cell" style="padding:14px;background:var(--surface-2);border-radius:14px;cursor:pointer" data-open-ord="${K.escapeHtml(last.id)}">
      <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(last.g)})">${K.escapeHtml(last.av)}</div>
      <div style="flex:1"><div class="nm">Заказ №${K.escapeHtml(last.id)}</div><div class="sub">${K.escapeHtml(last.dates||last.dt||'')} · ${K.escapeHtml(last.lines?.map(l=>l.name).join(', ')||'')}</div></div>
      <div style="text-align:right"><div style="font-weight:700">${K.escapeHtml(last.sum||last.sm||'')}</div><span class="st ${last.st}">${K.escapeHtml(last.stl)}</span></div>
    </div>`;
    document.querySelector('[data-open-ord]')?.addEventListener('click',e=>{e.stopPropagation();openOrder(last.id);});
  }else{
    document.getElementById('clLastOrderCard').style.display='none';
  }
  document.getElementById('clHistory').innerHTML=ords.length
    ?ords.map(o=>`<div class="prf-act-row" style="cursor:pointer" data-h-ord="${K.escapeHtml(o.id)}"><div class="d">${K.escapeHtml(o.dates||o.dt||'')}</div><div class="t">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.lines?.map(l=>l.name).join(', ')||'')} · <b>${K.escapeHtml(o.sum||o.sm||'')}</b></div></div>`).join('')
    :'<div style="text-align:center;padding:18px;color:var(--ink-3);font-size:13px">У клиента пока нет заказов</div>';
  document.querySelectorAll('[data-h-ord]').forEach(r=>r.addEventListener('click',()=>openOrder(r.dataset.hOrd)));
  // редактирование
  document.getElementById('clEdit').onclick=e=>{e.stopPropagation();openClientModal(idx);};
  document.getElementById('clNewOrder').onclick=()=>go('new-order');
  document.getElementById('clAllOrders').onclick=()=>go('orders');
  go('client');
}
window.openClient=openClient;

// Безопасная сборка инициалов: учитывает пустые и неконвенционные имена
function safeInitials(name, isOrg){
  name = (name||'').trim();
  if(!name) return '?';
  if(isOrg) return name.charAt(0).toUpperCase();
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.charAt(0) || '';
  const b = parts[1]?.charAt(0) || '';
  return (a+b).toUpperCase() || '?';
}

// модалка добавления / редактирования клиента
function openClientModal(editIdx){
  const palette=['#DDB261,#C2891F','#8EB69B,#5E8475','#4FBE93,#2E9E78','#5FC4BA,#2E8F86','#9B8EC4,#6E5BA8','#E0796D,#CB554A'];
  const exist=editIdx!=null?clients[editIdx]:null;
  const e=K.escapeHtml;
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>${exist?'Редактировать клиента':'Новый клиент'}</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Тип клиента</label><div class="type-pick"><button type="button"${(!exist||exist.type==='person')?' class="active"':''} data-tp="person">👤 Физлицо</button><button type="button"${exist&&exist.type==='org'?' class="active"':''} data-tp="org">🏢 Организация</button></div></div>
      <div class="mf"><label>Имя или название</label><input id="mcName" placeholder="Шохрух Мирзаев" value="${e(exist?.name||'')}" maxlength="80"></div>
      <div class="mf-row"><div class="mf"><label>Телефон</label><input id="mcPhone" type="tel" placeholder="+998 90 123-45-67" value="${e(exist?.phone||'')}" maxlength="20"></div></div>
      <div class="mf"><label>Email <span style="color:var(--ink-3);font-weight:400">— необязательно</span></label><input id="mcEmail" type="email" placeholder="client@example.com" value="${e(exist?.email||'')}" maxlength="100"></div>
      <div class="mf"><label>Telegram <span style="color:var(--ink-3);font-weight:400">— необязательно</span></label><input id="mcTg" placeholder="@username" value="${e(exist?.telegram||'')}" maxlength="40"></div>
      <div class="mf"><label>Адреса</label><div id="mcAddrs"></div></div>
      <div class="mf"><label>Заметка <span style="color:var(--ink-3);font-weight:400">— необязательно</span></label><textarea id="mcNote" rows="2" maxlength="500" placeholder="Постоянный, любит костюмы супергероев…">${e(exist?.note||'')}</textarea></div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="mcSave">${exist?'Сохранить':'Создать'}</button></div>
  </div>`;
  document.body.appendChild(bg);
  let type=exist?.type||'person';
  const addrBox=bg.querySelector('#mcAddrs');
  let addrDraft=K.parseAddresses(exist);
  if(!addrDraft.length) addrDraft=[''];
  function paintAddrs(){
    addrBox.innerHTML=addrDraft.map((a,i)=>`<div class="addr-edit-row"><input class="no-inp" data-ae="${i}" value="${e(a)}" maxlength="200" placeholder="улица, дом, ориентир"><button type="button" class="x" data-ae-rm="${i}" aria-label="Удалить">×</button></div>`).join('')
      +`<button type="button" class="addr-add" data-ae-add>+ ещё адрес</button>`;
    addrBox.querySelectorAll('[data-ae]').forEach(inp=>inp.oninput=()=>{addrDraft[+inp.dataset.ae]=inp.value;});
    addrBox.querySelectorAll('[data-ae-rm]').forEach(b=>b.onclick=()=>{
      addrDraft.splice(+b.dataset.aeRm,1);
      if(!addrDraft.length) addrDraft=[''];
      paintAddrs();
    });
    addrBox.querySelector('[data-ae-add]')?.addEventListener('click',()=>{addrDraft.push('');paintAddrs();addrBox.querySelectorAll('[data-ae]')[addrDraft.length-1]?.focus();});
  }
  paintAddrs();
  bg.querySelectorAll('.type-pick button').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.type-pick button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');type=b.dataset.tp;
  }));
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=e=>{ if(e.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',e=>{if(e.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  bg.querySelector('#mcSave').addEventListener('click',async ev=>{
    ev.stopPropagation();
    const name=bg.querySelector('#mcName').value.trim();
    if(!name){toast('Введите имя клиента','!');return;}
    if(!exist){
      const dup=K.findSameName(clients,name);
      if(dup){
        const open=await K.confirmDialog(`Клиент «${name}» уже есть. Открыть карточку?`,{title:'Клиент уже есть',ok:'Открыть',cancel:'Создать ещё'});
        if(open){
          close();
          const i=clients.findIndex(x=>x.id===dup.id);
          if(i>=0) openClient(i);
          return;
        }
      }
    }
    const av=safeInitials(name, type==='org');
    const payload={
      name,type,
      phone:bg.querySelector('#mcPhone').value.trim(),
      email:bg.querySelector('#mcEmail').value.trim(),
      telegram:bg.querySelector('#mcTg').value.trim(),
      address:addrDraft.map(s=>s.trim()).filter(Boolean)[0]||'',
      addresses:addrDraft.map(s=>s.trim()).filter(Boolean),
      note:bg.querySelector('#mcNote').value.trim(),
      avatar_text:av,
      gradient:exist?.g||palette[clients.length % palette.length],
    };
    const saveBtn=bg.querySelector('#mcSave');
    saveBtn.disabled=true;
    try{
      if(exist){
        const updated=await API.Clients.update(exist.id,payload);
        Object.assign(clients[editIdx],updated);
        renderClients();
        openClient(editIdx);
      }else{
        const created=await API.Clients.create(payload);
        clients.unshift(created);
        renderClients();
      }
      close();
    }catch(err){
      toast(err.message||'Не удалось сохранить клиента','!');
      saveBtn.disabled=false;
    }
  });
  setTimeout(()=>bg.querySelector('#mcName')?.focus(),50);
}
document.getElementById('pcAddClient')?.addEventListener('click',openClientModal);

document.querySelectorAll('.cl-chip').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.cl-chip').forEach(x=>x.classList.remove('on'));
    btn.classList.add('on');
    const f=btn.dataset.cl;
    document.querySelectorAll('#clientsBody tr').forEach(r=>{
      const match=f==='all'||(f==='debt'?r.style.background:r.dataset.clType===f);
      r.style.display=match?'':'none';
    });
  };
});

// ===== Склад =====
const whCostumes=[];
function renderWh(){
  const host=document.getElementById('whGrid');
  if(!whCostumes.length){
    host.innerHTML=K.emptyState('Склад пуст','Добавьте первый костюм — карточка появится здесь.');
    return;
  }
  host.innerHTML=whCostumes.map(c=>{
    const bc=c.st==='out'?'out':c.st==='rep'?'rep':'ok';
    const bl=c.st==='out'?'На руках':c.st==='rep'?'Ремонт':`${c.avail} из ${c.total}`;
    const pct=c.st==='out'?0:c.total>0?Math.round(c.avail/c.total*100):0;
    const chips=K.sizeChips(c.sizes);
    return `<div class="wh-card" data-wh-st="${c.st}" data-t="${K.escapeHtml(c.type)}" style="cursor:pointer" tabindex="0" role="button" aria-label="Открыть костюм ${K.escapeHtml(c.name)}">
      <div class="wh-art">${costumeThumb(c)}<span class="wh-av ${bc}">${bl}</span></div>
      <div>
        <div class="wh-name">${K.escapeHtml(c.name)}</div>
        <div class="size-row">${chips}</div>
        ${c.location?`<div class="loc-chip">${K.escapeHtml(K.slotLabel(c.location)||c.location)}</div>`:''}
        <div class="wh-bar"><div class="wh-bar-fill ${bc}" style="width:${pct}%"></div></div>
      </div>
      <div class="wh-price">${K.escapeHtml(c.price)} <small>сум/день</small></div>
    </div>`;
  }).join('');
  // Верхние плитки — реальные агрегаты (раньше были захардкожены в HTML)
  const setT=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  const totalUnits=whCostumes.reduce((s,c)=>s+(c.total||0),0);
  const availUnits=whCostumes.reduce((s,c)=>s+(c.avail||0),0);
  const outUnits=whCostumes.reduce((s,c)=>s+Math.max(0,(c.total||0)-(c.avail||0)),0);
  const repTypes=whCostumes.filter(c=>c.st==='rep');
  const repUnits=repTypes.reduce((s,c)=>s+(c.total||0),0);
  const pluralUnits=n=>K.plural(n,['единица','единицы','единиц']);
  setT('whTileTotal',whCostumes.length);
  setT('whTileTotalSub',`${totalUnits} ${pluralUnits(totalUnits)} включая наборы`);
  setT('whTileAvail',whCostumes.filter(c=>c.avail>0).length);
  setT('whTileAvailSub',`${availUnits} ${pluralUnits(availUnits)} готовы к выдаче`);
  setT('whTileOut',whCostumes.filter(c=>(c.total||0)>(c.avail||0)).length);
  setT('whTileOutSub',`${outUnits} ${pluralUnits(outUnits)} у клиентов`);
  setT('whTileRep',repTypes.length);
  setT('whTileRepSub',`${repUnits} ${pluralUnits(repUnits)} на восстановлении`);
}
renderWh();
// Делегированный handler на грид — переживает перерендер
document.getElementById('whGrid').addEventListener('click',e=>{
  const chip=e.target.closest('.loc-chip');
  if(chip){
    const card=chip.closest('.wh-card');
    const c=whCostumes.find(x=>x.type===card?.dataset.t);
    if(c){
      const p=K.parseSlot(c.location);
      pcRoomsView={room:p?p.room:null,rack:p&&p.kind==='rail'?p.rack:null};
      go('rooms');
    }
    return;
  }
  const card=e.target.closest('.wh-card');
  if(!card)return;
  if(pcPickMode)return;
  openCostume(card.dataset.t);
});

function renderPcPhotos(c){
  const host=document.getElementById('cstPhotos');
  if(!host)return;
  const can=API.state.me?.role!=='employee';
  const photos=c.photos||[];
  host.innerHTML=photos.map(p=>`<div class="photo-cell"><img src="${K.escapeHtml(p.url)}" alt="">${can?`<button type="button" class="x" data-ph-del="${K.escapeHtml(p.id)}">×</button>`:''}</div>`).join('')
    +(can&&photos.length<10?`<button type="button" class="photo-add" id="cstAddPh">+</button>`:'');
  host.querySelector('#cstAddPh')?.addEventListener('click',()=>{
    if(!c.id){toast('Сначала сохраните костюм','!');return;}
    const inp=document.createElement('input');
    inp.type='file'; inp.accept='image/jpeg,image/png,image/webp';
    inp.onchange=async()=>{
      const f=inp.files&&inp.files[0]; if(!f)return;
      if(f.size>3*1024*1024){toast('Файл больше 3 МБ','!');return;}
      if(f.type && !/^image\/(jpeg|png|webp)$/i.test(f.type)){toast('Только JPEG, PNG или WebP','!');return;}
      const btn=host.querySelector('#cstAddPh');
      btn?.classList.add('loading');
      try{
        const ph=await API.Costumes.uploadPhoto(c.id,f);
        c.photos=c.photos||[]; c.photos.push(ph); c.cover_url=c.photos[0].url;
        renderWh(); openCostume(c.type); toast('Фото добавлено','✓');
      }catch(err){ toast(err.message,'!'); }
      finally{ btn?.classList.remove('loading'); }
    };
    inp.click();
  });
  host.querySelectorAll('[data-ph-del]').forEach(b=>b.onclick=async()=>{
    try{
      await API.Costumes.removePhoto(c.id,b.dataset.phDel);
      c.photos=(c.photos||[]).filter(x=>x.id!==b.dataset.phDel);
      c.cover_url=c.photos[0]?.url||'';
      renderWh(); openCostume(c.type);
    }catch(err){ toast(err.message,'!'); }
  });
}

function openCostume(type){
  const c=whCostumes.find(x=>x.type===type);if(!c)return;
  document.getElementById('cstArt').innerHTML=costumeThumb(c);
  renderPcPhotos(c);
  document.getElementById('cstName').textContent=c.name;
  const bc=c.st==='out'?'out':c.st==='rep'?'rep':'ok';
  const bl=c.st==='out'?'На прокате':c.st==='rep'?'Ремонт':'В наличии';
  const stEl=document.getElementById('cstStatus');stEl.textContent=bl;stEl.className='wh-av '+bc;
  document.getElementById('cstSizes').textContent='размеры '+c.sizes;
  document.getElementById('cstPrice').textContent=c.price+' сум/день';
  document.getElementById('cstAvail').textContent=c.avail;
  document.getElementById('cstOut').textContent=c.total-c.avail;
  document.getElementById('cstTotal').textContent=c.total;
  const ords=orders.filter(o=>o.items?.includes(type)||o.lines?.some(l=>l.t===type));
  // Реальный доход по костюму: сумма строк (цена/день × дней × кол-во) именно по этому
  // типу из фактических заказов, исключая отменённые. Без выдуманных множителей.
  const typeRevenue=ords.reduce((sum,o)=>{
    if(o.st==='cancelled')return sum;
    const days=Number(o.days)||1;
    return sum+(o.lines||[]).filter(l=>l.t===type)
      .reduce((s,l)=>s+(Number(l.pd)||0)*days*(Number(l.qty)||1),0);
  },0);
  document.getElementById('cstRevenue').textContent=fmt(typeRevenue);
  document.getElementById('cstFields').innerHTML=[
    ['Артикул',`CST-${type.toUpperCase()}-${c.total}`],
    ['Тип костюма',c.name],
    ['Где лежит',K.slotLabel(c.location)||c.location||'—'],
    ['Доступные размеры',c.sizes],
    ['Цена за день',c.price+' сум'],
    ['Залог по умолчанию','50% от стоимости'],
    ['Всего единиц',c.total],
    ['Свободно сейчас',c.avail],
    ['Статус',bl],
  ].map(([k,v])=>`<div class="prf-field"><span class="k">${K.escapeHtml(k)}</span><span class="v">${K.escapeHtml(String(v))}</span></div>`).join('');
  document.getElementById('cstNote').textContent=c.note||'Костюм в хорошем состоянии. Регулярно стирается и отпаривается перед каждой выдачей.';
  document.getElementById('cstHistory').innerHTML=ords.length
    ?ords.map(o=>`<div class="prf-act-row" data-ho="${K.escapeHtml(o.id)}" style="cursor:pointer"><div class="d">${K.escapeHtml(o.dates||o.dt||'')}</div><div class="t">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.cl)} · <b>${K.escapeHtml(o.sum||o.sm||'')}</b></div></div>`).join('')
    :'<div style="text-align:center;padding:18px;color:var(--ink-3);font-size:13px">Этот костюм ещё не выдавали</div>';
  document.querySelectorAll('#cstHistory [data-ho]').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.ho)));
  document.getElementById('cstEdit').onclick=e=>{e.stopPropagation();openCostumeModal(type);};
  document.getElementById('cstNewOrder').onclick=()=>{
    pno.items.push({t:c.type,name:c.name,desc:'размер '+c.sizes.split(',')[0],pd:parseInt(c.price.replace(/\s/g,''))||0});
    pnoRenderItems();pnoRenderSummary();
    go('new-order');
    toast(`«${c.name}» добавлен в новый заказ`,'✓');
  };
  document.getElementById('cstDelete').onclick=async()=>{
    const ok=await K.confirmDialog(`Удалить «${c.name}» из склада?`,{title:'Удалить костюм',ok:'Удалить',danger:true});
    if(!ok)return;
    const i=whCostumes.findIndex(x=>x.type===type);
    if(i>=0){whCostumes.splice(i,1);renderWh();go('wh');toast('Костюм удалён','🗑');}
  };
  go('costume');
}
window.openCostume=openCostume;

function openCostumeModal(editType){
  const exist=editType?whCostumes.find(x=>x.type===editType):null;
  const e=K.escapeHtml;
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>${exist?'Редактировать костюм':'Новый костюм'}</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Название</label><input id="cmName" placeholder="Бэтмен" value="${e(exist?.name||'')}" maxlength="60"></div>
      ${exist?`<div class="mf"><label>Артикул</label><input id="cmType" value="${e(exist.type)}" readonly maxlength="20" style="opacity:.6"></div>`:''}
      <div class="mf-row"><div class="mf"><label>Цена/день, сум</label><input id="cmPrice" inputmode="numeric" placeholder="85 000" value="${e(exist?.price||'')}" maxlength="20"></div></div>
      <div class="mf"><label>Доступные размеры</label><input id="cmSizes" placeholder="92, 98, 104, 110, 116" value="${e(exist?.sizes||'')}" maxlength="60"></div>
      <div class="mf"><label>Где лежит</label>
        <input type="hidden" id="cmLocation" value="${e(exist?.location||'')}">
        <button type="button" class="loc-pick" id="cmLocBtn">${e(K.slotLabel(exist?.location)||exist?.location||'Выбрать место')}</button>
      </div>
      <div class="mf-row">
        <div class="mf"><label>Всего единиц</label><input id="cmTotal" type="number" min="0" max="9999" inputmode="numeric" placeholder="1" value="${e(exist?.total||1)}"></div>
        <div class="mf"><label>Свободно</label><input id="cmAvail" type="number" min="0" max="9999" inputmode="numeric" placeholder="1" value="${e(exist?.avail??1)}"></div>
      </div>
      <div class="mf"><label>Статус</label><div class="type-pick">
        <button type="button" data-cs="avail" class="${(!exist||exist.st==='avail')?'active':''}">✓ В наличии</button>
        <button type="button" data-cs="out" class="${exist?.st==='out'?'active':''}">🚀 На прокате</button>
        <button type="button" data-cs="rep" class="${exist?.st==='rep'?'active':''}">🔧 Ремонт</button>
      </div></div>
      <div class="mf"><label>Описание</label><textarea id="cmNote" rows="2" maxlength="500" placeholder="Особенности, комплектация…">${e(exist?.note||'')}</textarea></div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="cmSave">${exist?'Сохранить':'Создать'}</button></div>
  </div>`;
  document.body.appendChild(bg);
  let st=exist?.st||'avail';
  bg.querySelectorAll('.type-pick button').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.type-pick button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');st=b.dataset.cs;
  }));
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=e=>{ if(e.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',e=>{if(e.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);
  const locInp=bg.querySelector('#cmLocation');
  const locBtn=bg.querySelector('#cmLocBtn');
  if(locBtn) locBtn.onclick=()=>{
    K.openLocPicker({
      current: locInp.value,
      items: whCostumes,
      onPick: code => {
        if(code===undefined) return;
        locInp.value=code||'';
        locBtn.textContent=code?(K.slotLabel(code)||code):'Выбрать место';
      }
    });
  };
  bg.querySelector('#cmSave').addEventListener('click',async ev=>{
    ev.stopPropagation();
    const name=bg.querySelector('#cmName').value.trim();
    if(!name){toast('Введите название','!');return;}
    if(!exist){
      const dup=K.findSameName(whCostumes,name);
      if(dup){
        const open=await K.confirmDialog(`«${name}» уже есть на складе. Открыть карточку?`,{title:'Костюм уже есть',ok:'Открыть',cancel:'Создать ещё'});
        if(open){close(); openCostume(dup.type); return;}
      }
    }
    const type=exist?.type || (bg.querySelector('#cmType')?.value.trim()) || K.uniqueType(name,whCostumes);
    const total=Math.max(0, Math.min(9999, +bg.querySelector('#cmTotal').value||1));
    const avail=Math.max(0, Math.min(total, +bg.querySelector('#cmAvail').value||0));
    const priceRaw=Number(String(bg.querySelector('#cmPrice').value).replace(/\D/g,''))||0;
    const payload={
      name,type,
      price_per_day:priceRaw,
      sizes:bg.querySelector('#cmSizes').value.trim()||null,
      location:bg.querySelector('#cmLocation').value.trim()||null,
      total,available:avail,
      status:st,note:bg.querySelector('#cmNote').value.trim()||null,
    };
    const saveBtn=bg.querySelector('#cmSave');
    saveBtn.disabled=true;
    try{
      if(exist){
        const updated=await API.Costumes.update(exist.id,payload);
        Object.assign(exist,updated);
        renderWh();
        openCostume(updated.type);
      }else{
        const created=await API.Costumes.create(payload);
        whCostumes.push(created);
        renderWh();
      }
      close();
      toast(exist?'Костюм обновлён':'Костюм добавлен','✓');
    }catch(err){
      toast(err.message||'Не удалось сохранить костюм','!');
      saveBtn.disabled=false;
    }
  });
  setTimeout(()=>bg.querySelector('#cmName')?.focus(),50);
}
document.getElementById('pcAddCostume')?.addEventListener('click',e=>{e.stopPropagation();openCostumeModal();});
document.getElementById('pcWhRooms')?.addEventListener('click',()=>{pcRoomsView={room:null,rack:null};go('rooms');});
document.querySelectorAll('.wh-chip').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.wh-chip').forEach(x=>x.classList.remove('on'));
    btn.classList.add('on');
    const f=btn.dataset.wh;
    document.querySelectorAll('.wh-card').forEach(c=>c.classList.toggle('hidden',f!=='all'&&c.dataset.whSt!==f));
  };
});

// чек-лист сборки — реальный API-вызов (раньше только переключал CSS-класс)
document.addEventListener('click',async e=>{
  const r=e.target.closest('#odChecks .check-row');
  if(!r)return;
  const o=orders.find(x=>x.id===currentOrderId);
  if(!o)return;
  const cid=r.dataset.cid;
  const nowDone=!r.classList.contains('on');
  r.style.pointerEvents='none';
  try{
    await API.Orders.toggleChecklist(o.uuid,cid,nowDone);
    const item=(o.checklist||[]).find(c=>c.id===cid);
    if(item)item.done=nowDone;
    r.classList.toggle('on',nowDone);
    const cb=r.querySelector('.cb');
    if(cb){cb.classList.toggle('on',nowDone);cb.textContent=nowDone?'✓':'';}
    o.checklist_done=(o.checklist||[]).filter(c=>c.done).length;
    o.checklist_total=(o.checklist||[]).length;
    // Сняли позицию → на сервере is_assembled сбрасывается; отражаем локально.
    if(!nowDone)o.is_assembled=false;
    // Перерисовываем чек-лист+кнопку «Собрано»+карточку сборки из обновлённого o.
    renderChecklistAndHistory(o);
  }catch(err){
    toast(err.message||'Не удалось обновить чек-лист','!');
  }finally{
    r.style.pointerEvents='';
  }
});

// ===== Календарь =====
const calStL={req:'Запрос',book:'Бронь',conf:'Подтверждён',build:'Сборка',out:'Выдан',over:'Просрочка',closed:'Закрыт',cancelled:'Отменён'};
const calDotC={req:'#8B6200',book:'#8B6200',conf:'#2A56C6',build:'#2A56C6',out:'#3D7AD9',over:'#C0392B',closed:'#8B93A8',cancelled:'#8B93A8'};
let calY=K.TODAY.y, calM=K.TODAY.m, calSel=K.TODAY.d;

// Реальные заказы на день — по ISO issue/return, а не по статичному списку.
function calEventsOnDay(y,m,d){
  return K.dayBoard(orders, K.ymd(y,m,d));
}
function renderCal(){
  const dH='<div class="cal-dow">'+K.DOW_SHORT_MON_FIRST.map(d=>`<div class="cal-dc">${d}</div>`).join('')+'</div>';
  const cells=K.buildMonthGrid(calY,calM);
  const title=document.querySelector('#cal .cal-mname');
  if(title)title.textContent=`${K.MONTHS[calM]} ${calY}`;
  let body='';
  cells.forEach(cell=>{
    const {d,inMonth,isToday}=cell;
    const sel=inMonth&&d===calSel;
    const board=inMonth?calEventsOnDay(calY,calM,d):{issue:[],ret:[],over:[]};
    const chips=[];
    board.issue.forEach(e=>chips.push({cls:'issue',t:'Выдача · '+e.cl,id:e.id}));
    board.ret.forEach(e=>chips.push({cls:'ret',t:'Возврат · '+e.cl,id:e.id}));
    board.over.filter(e=>!board.ret.includes(e)).forEach(e=>chips.push({cls:'over',t:'Просрочен · '+e.cl,id:e.id}));
    let ev=chips.slice(0,2).map(e=>`<div class="cev ${e.cls}" data-oid="${K.escapeHtml(e.id)}">${K.escapeHtml(e.t)}</div>`).join('');
    if(chips.length>2)ev+=`<div class="cev-more">+${chips.length-2}</div>`;
    body+=`<div class="cday${inMonth?'':' other'}${isToday?' today':''}${sel?' sel':''}"${inMonth?` data-d="${d}"`:''}>
      <div class="cdn">${inMonth?d:''}</div>${ev}</div>`;
  });
  document.getElementById('calGrid').innerHTML=dH+'<div class="cdays">'+body+'</div>';
  document.querySelectorAll('#calGrid .cday[data-d]').forEach(c=>c.addEventListener('click',()=>calPick(+c.dataset.d)));
  calSidePaint();
}
function calPick(d){
  calSel=d;
  document.querySelectorAll('.cday[data-d]').forEach(c=>c.classList.toggle('sel',+c.dataset.d===d));
  calSidePaint();
}
function calSidePaint(){
  const board=calEventsOnDay(calY,calM,calSel);
  const row=(o,kind,label)=>`<div class="cal-sd-row" data-oid="${K.escapeHtml(o.id)}" style="cursor:pointer">
      <span class="cal-kind ${kind}">${label}</span>
      <div><div class="nm" style="font-size:13px;font-weight:600">№${K.escapeHtml(o.id)} · ${K.escapeHtml(o.cl)}</div>
      <div style="font-size:11px;color:var(--ink-3);margin-top:2px">${K.escapeHtml((o.lines||[]).map(l=>l.name).join(', ')||o.dates||'')}</div></div>
    </div>`;
  const parts=[`<div class="cal-sd-date">${calSel} ${K.MONTHS_GEN[calM]} ${calY}</div>`];
  if(board.issue.length) parts.push(`<div class="cal-sec">Забирают</div>`+board.issue.map(o=>row(o,'issue','Выдача')).join(''));
  if(board.ret.length) parts.push(`<div class="cal-sec">Возвращают</div>`+board.ret.map(o=>row(o,'ret','Возврат')).join(''));
  const overOnly=board.over.filter(o=>!board.ret.includes(o));
  if(overOnly.length) parts.push(`<div class="cal-sec">Просрочены</div>`+overOnly.map(o=>row(o,'over','Просрочен')).join(''));
  if(parts.length===1) parts.push('<div class="cal-empty">Нет выдач и возвратов</div>');
  document.getElementById('calSide').innerHTML=parts.join('');
}
renderCal();
window.calPick=calPick; // для обратной совместимости

// ===== Telegram-бот =====
const tgConvs=[
  {av:'ШМ',g:'#DDB261,#C2891F',name:'Шохрух М.',text:'Бэтмен на 25 июня есть? Размер 110',time:'11:42',st:'conf',stl:'Заказ создан',ordId:'1050'},
  {av:'АД',g:'#4FBE93,#2E9E78',name:'Адиба Д.',text:'Добрый день, хочу взять Эльзу и ещё одну принцессу',time:'09:15',st:'req',stl:'Ожидает ответа'},
  {av:'З',g:'#9B8EC4,#6E5BA8',name:'Зарина Т.',text:'Спасибо, костюм получили! Всё отлично',time:'Вчера',st:'out',stl:'Закрыто'},
];
document.getElementById('tgConvs').innerHTML=tgConvs.map(c=>{
  const e=K.escapeHtml;
  return `
  <div class="conv-row">
    <div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(c.g)})">${e(c.av)}</div>
    <div class="conv-meta">
      <div class="conv-name-row"><span class="nm">${e(c.name)}</span><span class="st ${c.st}">${e(c.stl)}</span></div>
      <div class="conv-text">${e(c.text)}</div>
      <div class="conv-acts">
        ${c.ordId?`<button class="btn sm" data-tg-open="${e(c.ordId)}">Открыть №${e(c.ordId)}</button>`:
          c.st==='req'?'<button class="btn sm">Создать заказ</button><button class="btn ghost sm">Ответить</button>':
          '<button class="btn ghost sm">Оставить отзыв</button>'}
      </div>
    </div>
    <div style="font-size:11px;color:var(--ink-3);white-space:nowrap;padding-top:2px">${K.escapeHtml(c.time)}</div>
  </div>`;
}).join('');
// Делегирование на кнопку "Открыть №X" — раньше был inline onclick (CSP-unsafe)
document.getElementById('tgConvs').addEventListener('click',e=>{
  const b=e.target.closest('[data-tg-open]');
  if(b)openOrder(b.dataset.tgOpen);
});
document.getElementById('tgTpls').innerHTML=
  ['✅ Да, костюм свободен! Напишите размер и дату — оформим бронь.',
   '📅 Укажите дату выдачи и возврата, подберём варианты.',
   '💰 Стоимость от 35 000 сум/день. Залог 50% от суммы.']
  .map(t=>`<div class="tpl-item">${t}</div>`).join('')+
  '<div style="color:var(--ink-3);font-size:12px;cursor:pointer;margin-top:2px">+ Добавить шаблон</div>';
document.getElementById('tgBotSet').innerHTML=
  [['Авто-ответ на приветствие','on'],['Уведомлять о запросах','on'],['Рабочие часы','off','09:00–20:00']]
  .map(([l,v,val])=>`<div class="tog-row"><span class="lbl">${l}</span>${val?`<span style="font-size:12.5px;font-weight:600">${val}</span>`:`<div class="toggle${v==='off'?' off':''}"></div>`}</div>`)
  .join('');

// ===== Команда =====
const ROLE_META={
  owner:{cls:'out',label:'Владелец'},
  manager:{cls:'conf',label:'Менеджер'},
  employee:{cls:'req',label:'Сотрудник'},
};
let teamMembers=[];
function fmtLastSeen(iso){
  if(!iso)return 'ещё не заходил';
  const min=Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if(min<2)return 'онлайн';
  if(min<60)return `${min} мин назад`;
  const h=Math.floor(min/60);
  if(h<24)return `${h} ч назад`;
  return K.fmtDateShortRu(new Date(iso));
}
function renderTeam(){
  document.getElementById('teamBody').innerHTML=teamMembers.map(m=>{
    const rm=ROLE_META[m.role]||{cls:'req',label:m.role};
    const deactivated=m.is_active===false;
    const seen=deactivated?'деактивирован':fmtLastSeen(m.last_login_at);
    const seenC=deactivated?'var(--red)':(seen==='онлайн'?'var(--green)':'var(--ink-3)');
    return `<tr data-id="${K.escapeHtml(m.id)}">
    <td><div class="cl-cell"><div class="mini-av" style="background:linear-gradient(135deg,${K.escapeHtml(m.gradient||'#8EB69B,#5E8475')})">${K.escapeHtml(m.avatar_text||'?')}</div><div class="nm">${K.escapeHtml(m.name)}</div></div></td>
    <td><span class="sub">${K.escapeHtml(m.email||'—')}</span></td>
    <td><span class="st ${rm.cls}">${K.escapeHtml(rm.label)}</span></td>
    <td><span style="font-size:12px;color:${seenC}">${seen}</span></td>
    <td data-stats-cell="${K.escapeHtml(m.id)}"><span class="sub">${m.role==='owner'?'—':'…'}</span></td>
    <td>${m.role==='owner'?'':'<button class="row-act" data-deactivate aria-label="Деактивировать">⋯</button>'}</td></tr>`;
  }).join('');
  const cntEl=document.getElementById('teamCount');
  if(cntEl)cntEl.textContent=teamMembers.length;
  const onlineEl=document.getElementById('teamOnlineCount');
  if(onlineEl)onlineEl.textContent=teamMembers.filter(m=>m.is_active!==false&&fmtLastSeen(m.last_login_at)==='онлайн').length;
  // Метрики сборки по каждой сотруднице/менеджеру (полнота % · ⭐). Владельца пропускаем.
  teamMembers.filter(m=>m.role!=='owner').forEach(async m=>{
    const cell=document.querySelector(`[data-stats-cell="${K.cssEscape(m.id)}"]`);
    if(!cell)return;
    try{
      const s=await API.Team.stats(m.id);
      const full=s.assembled_pct==null?'—':`${s.assembled_pct}%`;
      const star=s.avg_rating!=null?` · ${Number(s.avg_rating).toFixed(1)}⭐`:'';
      cell.innerHTML=`<span class="sub" title="Полнота сборки · средняя оценка · собрано заказов">${full}${star} <span style="color:var(--ink-3)">(${s.orders_done})</span></span>`;
    }catch(e){ cell.innerHTML='<span class="sub">—</span>'; }
  });
}
async function loadTeam(){
  try{
    teamMembers=await API.Team.list();
    renderTeam();
  }catch(e){ console.error('loadTeam failed:',e); }
}
document.getElementById('teamBody').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-deactivate]');
  if(!btn)return;
  const id=btn.closest('tr')?.dataset.id;
  const m=teamMembers.find(x=>x.id===id);
  if(!m||m.is_active===false)return;
  const ok=await K.confirmDialog(`Деактивировать ${m.name}? Сотрудник больше не сможет войти в систему.`,{title:'Деактивировать сотрудника',ok:'Деактивировать',danger:true});
  if(!ok)return;
  try{
    await API.Team.remove(id);
    toast(`${m.name} деактивирован(а)`,'✓');
    loadTeam();
  }catch(err){ toast(err.message||'Не удалось деактивировать','!'); }
});

// модалка приглашения — создаёт реальную ссылку через API, без отправки email
function openTeamModal(){
  const bg=document.createElement('div');
  bg.className='modal-bg';
  bg.setAttribute('role','dialog');
  bg.setAttribute('aria-modal','true');
  bg.innerHTML=`<div class="modal-card">
    <div class="modal-hd"><h3>Пригласить в команду</h3><button class="modal-cls" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <div class="mf"><label>Имя сотрудника <span style="color:var(--ink-3);font-weight:400">— необязательно</span></label><input id="tmName" placeholder="Алишер Бектемиров" maxlength="80"></div>
      <div class="mf"><label>Роль</label><div class="type-pick"><button type="button" data-rl="manager" class="active">👔 Менеджер</button><button type="button" data-rl="employee">👤 Сотрудник</button></div></div>
      <div style="font-size:11.5px;color:var(--ink-3);line-height:1.5;background:var(--surface-2);padding:11px 13px;border-radius:11px">Сгенерируем ссылку-приглашение — отправьте её сотруднику сами (Telegram, WhatsApp). Ссылка действует 7 дней и одноразовая.</div>
    </div>
    <div class="modal-ft"><button class="btn ghost modal-cls">Отмена</button><button class="btn" id="tmSave">Создать ссылку</button></div>
  </div>`;
  document.body.appendChild(bg);
  let role='manager';
  bg.querySelectorAll('.type-pick button').forEach(b=>b.addEventListener('click',()=>{
    bg.querySelectorAll('.type-pick button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');role=b.dataset.rl;
  }));
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); releaseFocus(); };
  const onKey=e=>{ if(e.key==='Escape')close(); };
  bg.querySelectorAll('.modal-cls').forEach(b=>b.addEventListener('click',close));
  bg.addEventListener('click',e=>{if(e.target===bg)close();});
  document.addEventListener('keydown',onKey);
  const releaseFocus=K.trapFocus(bg);

  bg.querySelector('#tmSave').addEventListener('click',async ev=>{
    ev.stopPropagation();
    const nameHint=bg.querySelector('#tmName').value.trim();
    const saveBtn=bg.querySelector('#tmSave');
    saveBtn.disabled=true;
    try{
      const r=await API.Team.invite({ role, name_hint: nameHint||undefined });
      bg.querySelector('.modal-body').innerHTML=`
        <div class="mf"><label>Ссылка для сотрудника</label>
          <div style="display:flex;gap:8px">
            <input id="tmLink" readonly value="${K.escapeHtml(r.url)}" style="flex:1">
            <button class="btn sm" id="tmCopy" type="button">Копировать</button>
          </div>
        </div>
        <div style="font-size:11.5px;color:var(--ink-3);line-height:1.5;background:var(--surface-2);padding:11px 13px;border-radius:11px">Отправьте эту ссылку сотруднику. Она действует 7 дней и станет недействительной после первого использования.</div>`;
      bg.querySelector('.modal-ft').innerHTML=`<button class="btn" id="tmDone" type="button">Готово</button>`;
      bg.querySelector('#tmCopy').addEventListener('click',async()=>{
        try{
          await navigator.clipboard.writeText(r.url);
          toast('Ссылка скопирована','📋');
        }catch{
          bg.querySelector('#tmLink').select();
          toast('Выделено — скопируйте вручную (Ctrl+C)','!');
        }
      });
      bg.querySelector('#tmDone').addEventListener('click',()=>{ close(); loadTeam(); });
    }catch(err){
      toast(err.message||'Не удалось создать ссылку','!');
      saveBtn.disabled=false;
    }
  });
  setTimeout(()=>bg.querySelector('#tmName')?.focus(),50);
}
document.getElementById('pcAddTeam')?.addEventListener('click',openTeamModal);
document.getElementById('permGrid').innerHTML=`<table class="perm-tbl">
  <thead><tr><th>Действие</th><th>Владелец</th><th>Менеджер</th><th>Сотрудник</th></tr></thead>
  <tbody>`+[
  ['Создавать заказы',1,1,1],['Видеть финансы',1,1,0],['Управлять складом',1,1,0],
  ['Добавлять сотрудников',1,0,0],['Изменять настройки',1,0,0],
].map(([a,o,m,s])=>`<tr><td>${a}</td>${[o,m,s].map(v=>`<td><span class="perm-${v?'y':'n'}">${v?'✓':'—'}</span></td>`).join('')}</tr>`).join('')+
'</tbody></table>';

// ===== Настройки — реальные данные + сохранение через PUT /api/settings =====
async function loadSettings(){
  try{ const r=await API.api('/settings'); settingsState=r.settings||{}; }
  catch(e){ console.error('settings load failed',e); }
  // Название проката в сайдбаре — из настроек (редактируемое), а не из имени тенанта.
  if(API.state.me?.tenant_slug!=='karnaval' && settingsState.shop_name){
    const bs=document.querySelector('.brand-sub'); if(bs)bs.textContent=settingsState.shop_name;
  }
  const active=document.querySelector('.set-nav-item.active')?.dataset.panel||'shop';
  setPanel(active);
}
const SET_FIELDS={
  shop:[
    {k:'shop_name',label:'Название проката',type:'text',ph:'Прокат «Сказка»'},
    {k:'address',label:'Адрес склада (откуда курьер)',type:'text',ph:'ул. Навои 12, Ташкент'},
    {k:'phone',label:'Телефон',type:'text',ph:'+998 90 000-00-00'},
    {k:'work_hours',label:'Рабочие часы',type:'text',ph:'09:00 – 20:00'},
    {k:'currency',label:'Валюта',type:'text',ph:'UZS'},
  ],
  price:[
    {k:'min_rent_days',label:'Мин. срок аренды, дней',type:'number'},
    {k:'deposit_pct',label:'Залог по умолчанию, %',type:'number'},
    {k:'fine_pct_per_day',label:'Штраф за просрочку, %/день',type:'number'},
    {k:'org_discount_pct',label:'Скидка для организаций, %',type:'number'},
  ],
  notif:[
    {k:'notif_new_order',label:'Новый заказ',type:'bool'},
    {k:'notif_overdue',label:'Просрочка возврата',type:'bool'},
    {k:'notif_telegram',label:'Уведомления в Telegram',type:'bool'},
    {k:'notif_daily_report',label:'Ежедневный отчёт',type:'bool'},
  ],
};
function setPanel(p){
  document.querySelectorAll('.set-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.panel===p));
  const el=document.getElementById('setContent');
  if(p==='int'){
    const tg=settingsState.telegram_bot_connected;
    el.innerHTML=`<div class="card" style="padding:20px">
      <div class="set-field"><span class="k">Telegram-бот</span><span class="v">${tg?K.escapeHtml(settingsState.telegram_bot_handle||'подключён'):'не подключён'}</span></div>
      <div class="set-field" style="opacity:.55"><span class="k">WhatsApp</span><span class="v">в разработке</span></div>
      <div class="set-field" style="opacity:.55"><span class="k">1С Бухгалтерия</span><span class="v">в разработке</span></div>
    </div>`;
    return;
  }
  if(p==='sec'){
    el.innerHTML=`<div class="card" style="padding:20px">
      <div class="set-field"><span class="k">Пароль</span><button class="btn ghost sm" id="setChangePwd">Сменить</button></div>
      <div class="set-field"><span class="k">Сессии на устройствах</span><button class="btn ghost sm" id="setLogoutAll">Выйти везде</button></div>
      <div class="set-field" style="opacity:.55"><span class="k">Двухфакторная аутентификация</span><span class="v">в разработке</span></div>
      <div class="set-field" style="opacity:.55"><span class="k">Пин-код при входе</span><span class="v">в разработке</span></div>
    </div>`;
    document.getElementById('setChangePwd').onclick=()=>openChangePwdModal();
    document.getElementById('setLogoutAll').onclick=async()=>{
      const ok=await K.confirmDialog('Завершить сессии на всех других устройствах? Текущая останется активной.',{title:'Выйти везде',ok:'Выйти везде',danger:true});
      if(ok){ try{ await API.Auth.logoutAll(); toast('Другие сессии завершены','✓'); }catch(e){ toast(e.message||'Ошибка','!'); } }
    };
    return;
  }
  const fields=SET_FIELDS[p]||[];
  el.innerHTML=`<div class="card" style="padding:20px">
    ${fields.map(f=>{
      const v=settingsState[f.k];
      if(f.type==='bool'){
        return `<div class="set-field"><span class="k">${K.escapeHtml(f.label)}</span><div class="toggle${v?'':' off'}" data-sk="${f.k}" role="switch" aria-checked="${!!v}"></div></div>`;
      }
      return `<div class="set-field"><span class="k">${K.escapeHtml(f.label)}</span><input class="set-inp" data-sk="${K.escapeHtml(f.k)}" type="${f.type==='number'?'number':'text'}" value="${K.escapeHtml(v==null?'':String(v))}" placeholder="${K.escapeHtml(f.ph||'')}" style="text-align:right;border:1.5px solid var(--line);border-radius:10px;padding:8px 12px;font-family:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);max-width:280px;width:280px"></div>`;
    }).join('')}
    <button class="btn" id="setSaveBtn" style="margin-top:16px">Сохранить</button>
  </div>`;
  el.querySelectorAll('.toggle[data-sk]').forEach(t=>t.addEventListener('click',()=>{ t.classList.toggle('off'); t.setAttribute('aria-checked', String(!t.classList.contains('off'))); }));
  document.getElementById('setSaveBtn').onclick=async()=>{
    const body={};
    el.querySelectorAll('.set-inp[data-sk]').forEach(inp=>{
      const k=inp.dataset.sk;
      const raw=inp.value.trim();
      body[k]= inp.type==='number' ? (raw===''?null:Number(raw)) : (raw===''?null:raw);
    });
    el.querySelectorAll('.toggle[data-sk]').forEach(t=>{ body[t.dataset.sk]=!t.classList.contains('off'); });
    const btn=document.getElementById('setSaveBtn'); btn.disabled=true; btn.textContent='Сохраняем…';
    try{
      const r=await API.api('/settings',{method:'PUT',body});
      settingsState=r.settings||settingsState;
      if(body.shop_name && API.state.me?.tenant_slug!=='karnaval'){ const bs=document.querySelector('.brand-sub'); if(bs)bs.textContent=body.shop_name; }
      toast('Настройки сохранены','✓');
    }catch(e){ toast(e.message||'Не удалось сохранить','!'); }
    finally{ btn.disabled=false; btn.textContent='Сохранить'; }
  };
}
document.querySelectorAll('.set-nav-item').forEach(b=>b.onclick=()=>setPanel(b.dataset.panel));
setPanel('shop');

// Обработчик «глаза» живёт в ui.js — здесь не дублируем

// календарь: переключение месяца — реально работает
(function bindCalNav(){
  const navs=document.querySelectorAll('#cal .cal-nav');
  function shift(dir){
    calM+=dir;
    if(calM<0){calM=11; calY--;}
    if(calM>11){calM=0; calY++;}
    calSel=null; renderCal();
  }
  if(navs.length>=2){
    navs[0].setAttribute('aria-label','Предыдущий месяц');
    navs[1].setAttribute('aria-label','Следующий месяц');
    navs[0].addEventListener('click',()=>shift(-1));
    navs[1].addEventListener('click',()=>shift(1));
  }
  K.bindSwipeX(document.getElementById('calGrid'),{prev:()=>shift(-1),next:()=>shift(1)});
})();
// клик по событию в боковой панели — открыть конкретный заказ
document.addEventListener('click',e=>{
  const r=e.target.closest('#calSide .cal-sd-row');
  if(r && r.dataset.oid)openOrder(r.dataset.oid);
});
document.querySelectorAll('#cal .chip').forEach(c=>c.addEventListener('click',()=>{
  c.parentElement.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));
  c.classList.add('on');
}));

// ===== Глобальные обработчики (всё что не подцеплено явно) =====
document.addEventListener('click',e=>{
  const t=e.target;
  // toggle переключатели
  const tg=t.closest('.toggle');
  if(tg){tg.classList.toggle('off');return;}
  // кнопки навигации по тексту/data
  const btn=t.closest('button, .btn, .conv-acts .btn, .row-act, .nof-cl, .ord, .cl-row, .conv-row, .tg-conv, .stock-row, .perm-row, .li-img, .li-main, .tpl-item, .lnk, .tile, .card.tile');
  if(!btn)return;
  const text=(btn.textContent||'').trim();
  if(btn.closest('#new-order') && /Создать заказ/i.test(text)){go('orders');return;}
  if(/Создать заказ|Новый заказ/i.test(text)){go('new-order');return;}
  if(/Открыть.*№|Открыть карточку/i.test(text)){
    const m=text.match(/№(\d+)/);
    m?openOrder(m[1]):openOrder('1045');
    return;
  }
  if(/Все события|Все →|Подробнее →/i.test(text)){go('orders');return;}
  if(/Передать в выдачу/i.test(text)){go('orders');return;}
  if(/Настроить бота/i.test(text)){go('settings');return;}
  // ВСЕ остальные кнопки/плитки/строки → opacity-feedback
  btn.style.transition='opacity .15s';
  btn.style.opacity='.5';
  setTimeout(()=>btn.style.opacity='',150);
});

// ===== Профиль — реальные данные пользователя (раньше вся страница была захардкожена) =====
function renderProfile(me){
  if(!me)return;
  const setT=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v||'—';};
  // Аватар в шапке профиля
  const prfAv=document.getElementById('prfAv');
  if(prfAv){
    prfAv.textContent=me.avatar_text||safeInitials(me.name,false);
    if(me.gradient)prfAv.style.background=`linear-gradient(135deg,${me.gradient})`;
  }
  // Шапка
  setT('prfName',me.name);
  const roleLabels={owner:'Владелец проката',manager:'Менеджер',employee:'Сотрудник'};
  setT('prfRole',roleLabels[me.role]||me.role);
  const createdMs=Date.parse(me.created_at||'');
  if(createdMs){
    const d=new Date(createdMs);
    setT('prfSince','с '+d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}));
  }
  const contact=[me.email&&'📧 '+me.email,me.phone&&'📱 '+me.phone].filter(Boolean).join(' · ');
  setT('prfContact',contact||'контактных данных нет');
  // подзаголовок страницы Профиль (в шапке)
  PAGES.profile.s=`${me.name} · ${roleLabels[me.role]||me.role}`;
  if(document.querySelector('.view.active')?.id==='profile'){
    document.getElementById('pgSub').textContent=PAGES.profile.s;
  }
  // Показатели сборки — для сотрудниц/менеджеров (у владельца обычно 0 назначенных).
  if(me.role==='employee'||me.role==='manager'){
    let statsCard=document.getElementById('prfAssemblerCard');
    if(!statsCard){
      statsCard=document.createElement('div');
      statsCard.id='prfAssemblerCard'; statsCard.className='card'; statsCard.style.cssText='padding:20px;margin-bottom:18px';
      statsCard.innerHTML='<div class="panel-h" style="padding:0 0 12px"><h3>Показатели сборки</h3></div><div id="prfAssemblerBody"></div>';
      const host=document.getElementById('profile');
      if(host)host.insertBefore(statsCard, host.firstChild);
    }
    renderAssemblerStats(document.getElementById('prfAssemblerBody'), me.id);
  }
  // Личные данные
  setT('prfDataName',me.name);
  setT('prfDataEmail',me.email);
  setT('prfDataPhone',me.phone);
  setT('prfDataTg',me.telegram);
  setT('prfDataBd',me.birthday);
  setT('prfDataAddr',me.address);
  // Плитки — считаем из реальных данных тенанта
  const myOrders=(orders||[]).filter(o=>o.created_by===me.id);
  const totalRevenue=(orders||[]).reduce((s,o)=>s+(Number(o.sum_raw||o.sum)||0),0);
  setT('prfTileOrders',myOrders.length||orders.length||0);
  setT('prfTileOrdersSub',myOrders.length?`из ${orders.length} за всё время`:'за всё время работы');
  setT('prfTileRevenue',API.fmt.moneyShort(totalRevenue));
  setT('prfTileRevenueSub',totalRevenue?'по всем закрытым заказам':'ещё нет выручки');
  setT('prfTileClients',(clients||[]).length);
  setT('prfTileClientsSub',(clients||[]).length?'в базе проката':'ещё нет клиентов');
  if(createdMs){
    const days=Math.max(0,Math.floor((Date.now()-createdMs)/86400000));
    setT('prfTileDays',days);
    if(days<30) setT('prfTileDaysSub','с момента регистрации');
    else if(days<365) setT('prfTileDaysSub',`≈ ${Math.round(days/30)} мес`);
    else setT('prfTileDaysSub',`≈ ${(days/365).toFixed(1)} года`);
  }
  // Активность за месяц — последние заказы этого владельца
  const actEl=document.getElementById('prfActList');
  if(actEl){
    const monthAgo=Date.now()-30*86400000;
    const recent=(orders||[])
      .filter(o=>{const t=Date.parse(o.created_at||o.issue_date||'');return t&&t>=monthAgo;})
      .slice(0,6);
    if(recent.length){
      actEl.innerHTML=recent.map(o=>{
        const d=new Date(o.created_at||o.issue_date);
        const today=new Date(); today.setHours(0,0,0,0);
        const yest=new Date(today); yest.setDate(yest.getDate()-1);
        const dTxt=d>=today?'сегодня':(d>=yest?'вчера':d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}));
        return `<div class="prf-act-row"><div class="d">${K.escapeHtml(dTxt)}</div><div class="t">${K.escapeHtml('Заказ №'+o.id+' · '+(o.cl||'без клиента')+' · '+(o.stl||o.st))}</div></div>`;
      }).join('');
    }else{
      actEl.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:13px">Пока нет активности за последний месяц</div>';
    }
  }
  // Безопасность — реальный «когда изменён пароль» из last_login_at (proxy, пока нет отдельного поля)
  setT('prfPwdSub','управляется в настройках безопасности');
}

// ===== Плитки «Деньги» — реальные суммы из транзакций и залогов активных заказов =====
async function renderMoneyTiles(){
  const setT=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  const now=new Date();
  const months=K.MONTHS_PREP; // «Доход в июле» (предложный), как на мобайле
  setT('moneyTileIncomeLbl',`Доход в ${months[now.getMonth()]}`);
  let summary=null;
  try{
    summary=await API.Dashboard.summary();
    const {income:inc,expense:exp,profit}=API.calc.monthMoney(summary);
    setT('moneyTileIncome',API.fmt.moneyShort(inc));
    setT('moneyTileExpense',API.fmt.moneyShort(exp));
    setT('moneyTileProfit',API.fmt.moneyShort(profit));
    setT('moneyTileIncomeSub', inc?'по данным транзакций':'ещё нет доходов');
    setT('moneyTileExpenseSub', exp?'по данным транзакций':'нет расходов');
    setT('moneyTileProfitSub', inc?`маржа ${inc>0?Math.round(profit/inc*100):0}%`:'—');
  }catch(e){ console.error('money summary failed:',e); }
  const activeOrders=API.calc.activeOrders(orders);
  const deposits=API.calc.deposits(orders);
  setT('moneyTileDeposits',API.fmt.moneyShort(deposits));
  setT('moneyTileDepositsSub', activeOrders.length?`от ${activeOrders.length} ${K.plural(activeOrders.length,['активного заказа','активных заказов','активных заказов'])}`:'нет активных заказов');

  // Нижние 4 карточки: реальные данные. Демо-тенант «Карнавал» оставляем как статичную витрину.
  const me=API.state.me;
  if(me && !API.calc.isDemoTenant(me)) renderMoneyCards(summary);
}

// Заполняет 4 нижние карточки раздела «Деньги» реальными данными (не-демо тенанты).
function renderMoneyCards(summary){
  // Доходы по месяцам (последние 6 месяцев) — расчёт общий (API.calc)
  const bars=document.getElementById('moneyBars');
  if(bars){
    const buckets=API.calc.sixMonthIncome(summary,new Date(),K.MONTHS_SHORT);
    const max=buckets.reduce((m,b)=>Math.max(m,b.income),0);
    if(max<=0){
      bars.innerHTML='<div style="text-align:center;padding:26px 0;color:var(--ink-3);font-size:13px;width:100%">Пока нет данных о доходах</div>';
    }else{
      bars.innerHTML=buckets.map(b=>{
        const h=Math.max(4,Math.round(b.income/max*100));
        const val=b.income?API.fmt.moneyShort(b.income):'0';
        return `<div class="m-bar${b.cur?' cur':''}"><div class="m-bar-val${b.cur?' cur':''}">${K.escapeHtml(val)}</div><div class="m-bar-fill" style="height:${h}%"></div><div class="m-bar-lbl${b.cur?' cur':''}">${K.escapeHtml(b.label)}</div></div>`;
      }).join('');
    }
  }

  // Последние платежи
  const txnsEl=document.getElementById('moneyTxns');
  if(txnsEl){
    const txns=(API.state.transactions||[]).slice(0,6);
    txnsEl.innerHTML=txns.length?txns.map(t=>{
      const isIn=t.type==='income';
      const amt=(isIn?'+':'−')+API.fmt.money(Math.abs(Number(t.amount)||0));
      const nm=t.desc||t.category||'Платёж';
      const ds=(t.dateShort||'')+(t.pm?' · '+t.pm:'');
      return `<div class="txn"><div class="txn-ic ${isIn?'in':'out'}">${isIn?'↓':'↑'}</div><div class="txn-main"><div class="nm">${K.escapeHtml(nm)}</div><div class="ds">${K.escapeHtml(ds)}</div></div><div class="txn-amt ${isIn?'in':'out'}">${K.escapeHtml(amt)}</div></div>`;
    }).join('')
    :'<div style="text-align:center;padding:22px 0;color:var(--ink-3);font-size:13px">Платежей пока нет</div>';
  }

  // Категории дохода / расхода (доля за текущий месяц) — расчёт общий (API.calc)
  const renderCats=(elId,type,color)=>{
    const el=document.getElementById(elId); if(!el)return;
    const cats=API.calc.categoryShare(summary,type);
    el.innerHTML=cats.length?cats.map(c=>
      `<div class="cat-row"><span class="cat-dot" style="background:${color}"></span><span class="cat-nm">${K.escapeHtml(c.name)}</span><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${c.pct}%;background:${color}"></div></div><span class="cat-pct">${c.pct}%</span><span class="cat-val">${API.fmt.moneyShort(c.total)}</span></div>`
    ).join('')
    :'<div style="text-align:center;padding:18px 0;color:var(--ink-3);font-size:13px">Нет данных</div>';
  };
  renderCats('moneyIncomeCats','income','var(--green)');
  renderCats('moneyExpenseCats','expense','var(--red)');
}

// ===== Главная: реальные данные (кроме демо-тенанта «Карнавал») =====
async function renderDashboard(me){
  if(!me || me.tenant_slug==='karnaval') return; // демо оставляем как есть — витрина
  // Telegram-бот: для не-демо показываем плашку «в разработке» и скрываем моковый контент,
  // чтобы новый владелец не видел чужой бот @karnaval_uz_bot и «3 запроса сегодня».
  const tgBadge=document.getElementById('tgDemoBadge');
  if(tgBadge)tgBadge.style.display='';
  document.querySelectorAll('#tg [data-tg-real]').forEach(el=>{el.style.display='none';});
  document.querySelectorAll('#tg .card').forEach(el=>{el.style.display='none';});
  const setN=(id,v)=>{const el=document.getElementById(id); if(el)el.textContent=v;};
  let stats,summary,queue,upcoming;
  try{
    [stats,summary,queue,upcoming]=await Promise.all([
      API.Dashboard.stats(),
      API.Dashboard.summary().catch(()=>null),
      API.Dashboard.queue().catch(()=>[]),
      API.Dashboard.upcoming().catch(()=>[]),
    ]);
  }catch(e){ console.error('dashboard load failed:',e); return; }

  // Плитки «сегодня»
  setN('dTileIssue',stats.issue_today); setN('dTileReturn',stats.return_today);
  setN('dTileOverdue',stats.overdue);   setN('dTileBuild',stats.assembling);
  setN('dTileIssueSub',stats.issue_today?'к выдаче сегодня':'на сегодня ничего');
  setN('dTileReturnSub',stats.return_today?'проверить и вернуть залог':'возвратов нет');
  setN('dTileOverdueSub',stats.overdue?'вернуть просроченные':'просрочек нет');
  setN('dTileBuildSub',stats.assembling?'в сборке':'сборок нет');

  // Загрузка склада
  const total=stats.warehouse_total||0, free=stats.warehouse_free||0;
  const pct=total?Math.round(free/total*100):0;
  setN('dGaugePct',pct+'%');
  setN('dGaugeText',`Свободно ${free} из ${total}`);
  const ring=document.getElementById('dGaugeRing');
  if(ring) ring.setAttribute('stroke-dashoffset', Math.round(207*(1-pct/100)));
  const legOut=document.getElementById('dLegOut');
  if(legOut) legOut.innerHTML=`<i style="background:var(--line-2)"></i>в прокате ${Math.max(0,total-free)}`;
  const legRep=document.getElementById('dLegRep');
  const repUnits=(API.state.costumes||[]).filter(c=>c.st==='rep').reduce((s,c)=>s+(Number(c.total)||0),0);
  if(legRep) legRep.innerHTML=`<i style="background:var(--gold)"></i>ремонт ${repUnits}`;
  // Бейдж активных заказов в меню
  const badge=document.getElementById('ordersBadge');
  if(badge){
    const active=(API.state.orders||[]).filter(o=>!['closed','cancelled'].includes(o.st)).length;
    if(active>0){ badge.textContent=active; badge.style.display=''; } else badge.style.display='none';
  }

  // Деньги
  setN('dEarned', API.fmt.moneyShort(API.calc.monthMoney(summary).income));
  const dEl=document.getElementById('dEarnedDelta'); if(dEl) dEl.style.display='none';
  setN('dDebt', API.fmt.moneyShort(API.calc.debt(API.state.clients)));
  setN('dDeposits', API.fmt.moneyShort(API.calc.deposits(API.state.orders)));

  // Очередь на сегодня
  const q=document.getElementById('dQueue');
  if(q){
    if(!queue.length){
      q.innerHTML='<div style="text-align:center;padding:28px;color:var(--ink-3);font-size:13px">На сегодня событий нет</div>';
    }else{
      q.innerHTML=queue.map(o=>{
        const items=(o.items||[]).map(i=>i.name).join(', ');
        const st=o.status;
        const issue=String(o.issue_date||'').slice(0,10);
        const ret=String(o.return_date||'').slice(0,10);
        const late=K.lateDays(ret);
        const kind=late>0?'over':((st==='out'||st==='over')&&ret===K.TODAY.iso?'return':'issue');
        const pill=kind==='over'?'over':kind==='issue'?'give':'take';
        const time=kind==='over'?(late?`+${late}`:'—'):'·';
        const timeLbl=kind==='over'?(late===1?'день':(late>=2&&late<=4?'дня':'дней')):kind==='issue'?'выдача':'возврат';
        const act=kind==='over'?'Забрать':kind==='issue'?(st==='build'?'Собрать':'Выдать'):'Принять';
        return `<div class="q-item${(o.delivery_addr||o.client_address)?' has-loc':''}" data-oid="${K.escapeHtml(String(o.number))}"><div class="q-time">${time}<small>${timeLbl}</small></div><div class="q-main"><div class="nm">Заказ №${K.escapeHtml(String(o.number))} · ${K.escapeHtml(o.client_name||'без клиента')}</div><div class="ds"${kind==='over'?' style="color:var(--red)"':''}>${K.escapeHtml(items||'—')}</div>${(o.delivery_addr||o.client_address)?K.locPinHtml(o.delivery_addr||o.client_address,{phone:o.client_phone,name:o.client_name,oid:String(o.number)}):''}</div><span class="pill ${pill}">${act}</span><button class="q-act">${act}</button></div>`;
      }).join('');
      q.querySelectorAll('.q-item').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.oid)));
    }
  }

  // Ближайшие брони
  const b=document.getElementById('dBookings');
  if(b){
    if(!upcoming.length){
      b.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-3);font-size:12.5px">Броней пока нет</div>';
    }else{
      b.innerHTML=upcoming.map(o=>{
        const d=String(o.issue_date).match(/^(\d{4})-(\d{2})-(\d{2})/);
        const day=d?+d[3]:'', mon=d?K.MONTHS_SHORT[+d[2]-1]:'';
        return `<div class="book-item" data-oid="${K.escapeHtml(String(o.number))}"><div class="date-chip"><div class="m">${mon}</div><div class="d">${day}</div></div><div><div class="nm">Заказ №${K.escapeHtml(String(o.number))}</div><div class="ds">${K.escapeHtml(o.client_name||'без клиента')} · ${o.items_count} костюм.</div></div><div class="sum">${API.fmt.moneyShort(o.total)}</div></div>`;
      }).join('');
      b.querySelectorAll('.book-item').forEach(el=>el.addEventListener('click',()=>openOrder(el.dataset.oid)));
    }
  }
}

// ===== Загрузка реальных данных с сервера =====
// Ролевое скрытие управляющих элементов (C3). Сервер enforce'ит права, это — UX,
// чтобы у сборщицы не было кнопок, дающих 403.
function applyRoleUI(me){
  const emp=me.role==='employee';
  const hide=(sel)=>{const el=document.querySelector(sel); if(el)el.style.display='none';};
  if(emp){
    hide('.topbar .btn');   // Новый заказ
    hide('#pcAddCostume');  // Добавить костюм
    hide('#pcAddClient');   // Добавить клиента
    hide('#cstEdit');       // Редактировать костюм
    hide('#clEdit');        // Редактировать клиента
    hide('#clNewOrder');    // Новый заказ из карточки клиента
    hide('.nav-item[data-v="money"]');
    hide('.nav-item[data-v="tg"]');
    hide('.nav-item[data-v="settings"]');
    hide('.nav-item[data-v="team"]');
  }
  // «Журнал» — только владелец.
  if(me.role==='owner'){ const n=document.getElementById('navAudit'); if(n)n.style.display=''; }
}

(async function init(){
  try{
    // loadMe и loadAll независимы (авторизация по cookie на каждый запрос) —
    // запускаем одним Promise.all, чтобы убрать лишний последовательный круг
    // до сервера. Интерфейс всё равно скрыт гейтом до finally, так что порядок
    // отрисовки не важен, а загрузка ускоряется почти вдвое.
    const [me, s] = await Promise.all([API.loadMe(), API.loadAll()]);
    // Профиль в сайдбаре
    document.querySelectorAll('.avatar, .side-user .avatar').forEach(el=>{
      if(me.avatar_text) el.textContent = me.avatar_text;
      if(me.gradient) el.style.background = `linear-gradient(135deg,${me.gradient})`;
    });
    const nm=document.querySelector('.side-user .nm');
    if(nm) nm.textContent = me.name;
    const rl=document.querySelector('.side-user .rl');
    if(rl){ const RL={owner:'Владелец проката',admin:'Администратор',manager:'Менеджер',employee:'Сотрудник',courier:'Курьер',assembler:'Сборщик'}; rl.textContent=RL[me.role]||me.role||''; }
    // Название проката в шапке сайдбара (демо оставляем «Карнавал»)
    if(me.tenant_slug!=='karnaval'){
      const bs=document.querySelector('.brand-sub');
      if(bs && me.tenant_name) bs.textContent = me.tenant_name;
    }
    // Ссылка на консоль оператора — только владельцу платформы (демо «Карнавал»)
    if(me.tenant_slug==='karnaval' && me.role==='owner'){
      const host=document.querySelector('.nav-item[data-v="settings"]')?.parentElement;
      if(host && !document.getElementById('opConsoleLink')){
        const a=document.createElement('a');
        a.id='opConsoleLink'; a.href='/admin.html'; a.className='nav-item'; a.style.textDecoration='none';
        a.innerHTML='<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z"/></svg>Консоль оператора';
        host.appendChild(a);
      }
    }

    orders.length=0;     orders.push(...s.orders);
    clients.length=0;    clients.push(...s.clients);
    whCostumes.length=0; whCostumes.push(...s.costumes);

    renderOrdersTable();
    renderClients();
    renderWh();
    renderOrdMiniCal();
    renderOrdNear();
    renderCal();
    applyOrdFilters();
    updateOrderPipe();
    const ordCntEl=document.getElementById('teamOrdersCount');
    if(ordCntEl)ordCntEl.textContent=orders.length;
    renderDashboard(me);
    renderMoneyTiles();
    renderProfile(me);
    applyRoleUI(me);
    // Сборщице по умолчанию открываем её очередь, а не дашборд руководителя.
    if(me.role==='employee')go('mine');
    else loadTeam();
    loadSettings();
    // Уведомления: реальные данные пользователя. Демо «Карнавал» оставляем витриной.
    if(s.notifications && s.notifications.length){
      notifications.length=0; notifications.push(...adaptNotifsPc(s.notifications));
    }else if(me.tenant_slug!=='karnaval'){
      notifications.length=0;
    }
    updateBellDot();
  }catch(e){
    if(e.message==='unauthorized')return;
    console.error('Init failed:', e);
  }finally{
    // Данные на месте — показываем интерфейс (до этого он скрыт, чтобы не мигала демо-разметка).
    document.documentElement.classList.remove('app-loading');
  }
})();
