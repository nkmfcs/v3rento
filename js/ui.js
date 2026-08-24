/* ============================================================
   Костюмерная — общие UI-мелочи
   Кнопка «глаз» — единственный источник правды (раньше дублировалось в pc.js, mobile.js и inline onclick).
   ============================================================ */

(function(){
  const EYE_OPEN='<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF='<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-7-11-7a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 7 11 7a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  document.querySelectorAll('.eye-btn').forEach(btn=>{
    const hero=btn.closest('.hero');
    if(!hero)return;
    const draw=()=>{
      const on=hero.classList.contains('secret');
      btn.innerHTML=on?EYE_OFF:EYE_OPEN;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Показать суммы' : 'Скрыть суммы');
    };
    draw();
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      hero.classList.toggle('secret');
      draw();
    });
  });
})();
