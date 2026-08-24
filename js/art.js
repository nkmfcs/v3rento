/* ============================================================
   Костюмерная — генератор стилизованных SVG-костюмов (общий)
   Требует <linearGradient id="gA"> в документе.
   ============================================================ */
function costumeSVG(type){
  const W='viewBox="0 0 220 172" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"';
  const bg='<rect width="220" height="172" fill="url(#gA)"/><circle cx="110" cy="74" r="58" fill="#fff" opacity=".55"/>';
  function suit(c1,c2,deco){return `<g transform="translate(110,30)"><line x1="0" y1="-6" x2="0" y2="6" stroke="#9DB6A8" stroke-width="2"/><path d="M-26 8 Q0 -10 26 8" fill="none" stroke="#9DB6A8" stroke-width="3" stroke-linecap="round"/><path d="M-30 14 L30 14 L40 40 L24 48 L24 110 Q0 120 -24 110 L-24 48 L-40 40 Z" fill="${c1}"/><path d="M-24 48 L-24 110 Q0 120 24 110 L24 48 Z" fill="${c2}" opacity=".85"/>${deco||''}</g>`;}
  const map={
    spider:suit('#C0392B','#7A1F16','<path d="M0 30 L0 100 M-18 50 L18 50 M-16 70 L16 70 M-12 90 L12 90" stroke="#1c1c1c" stroke-width="1.6" opacity=".7"/><circle cx="0" cy="40" r="9" fill="#fff" opacity=".25"/>'),
    elsa:suit('#A9D4EC','#6FB0D6','<path d="M-22 48 L22 48 L18 110 Q0 118 -18 110 Z" fill="#dff1fb" opacity=".6"/><circle cx="-8" cy="62" r="2" fill="#fff"/><circle cx="6" cy="78" r="2" fill="#fff"/><circle cx="-4" cy="94" r="2" fill="#fff"/>'),
    bat:suit('#2C3E50','#1A252F','<path d="M-30 14 Q-44 70 -30 96 Q-14 70 0 78 Q14 70 30 96 Q44 70 30 14 Z" fill="#1A252F" opacity=".55"/><path d="M-10 40 L0 30 L10 40 L6 52 L-6 52 Z" fill="#E2BA78" opacity=".8"/>'),
    snow:suit('#D7ECF5','#A9D4EC','<g stroke="#fff" stroke-width="1.4" opacity=".8"><path d="M0 44 L0 104 M-16 60 L16 88 M16 60 L-16 88"/></g><circle cx="0" cy="14" r="6" fill="#fff" opacity=".7"/>'),
    tiger:suit('#E08A2B','#C56F12','<g stroke="#5a3410" stroke-width="2.4" opacity=".75"><path d="M-18 40 L-10 52 M0 36 L0 50 M18 40 L10 52 M-14 70 L-6 80 M14 70 L6 80 M-10 96 L-4 104 M10 96 L4 104"/></g>'),
    bee:suit('#F2C500','#D9A400','<g fill="#2b2b2b" opacity=".82"><rect x="-24" y="52" width="48" height="9" rx="3"/><rect x="-22" y="74" width="44" height="9" rx="3"/><rect x="-18" y="96" width="36" height="9" rx="3"/></g>'),
    sofia:suit('#E8A0C0','#C76A98','<path d="M-22 48 L22 48 L18 110 Q0 118 -18 110 Z" fill="#f6dcea" opacity=".55"/><path d="M-10 36 L-6 26 L0 34 L6 26 L10 36 Z" fill="#E2BA78"/>'),
    santa:suit('#C0392B','#8E1F16','<rect x="-26" y="100" width="52" height="14" rx="6" fill="#2b2b2b" opacity=".8"/><path d="M-30 14 L30 14 L30 24 L-30 24 Z" fill="#fff" opacity=".85"/><circle cx="0" cy="6" r="7" fill="#fff" opacity=".8"/>')
  };
  return `<svg ${W}>${bg}${map[type]||map.bat}</svg>`;
}
function costumeThumb(c){
  const url=c&&c.cover_url;
  if(url) return `<img class="cst-cover" src="${K.escapeHtml(url)}" alt="">`;
  return costumeSVG(c&&c.type);
}
