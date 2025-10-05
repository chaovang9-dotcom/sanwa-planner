// js/mobile.js — unobtrusive mobile gestures (safe with desktop)
(function(){
  const S = window.SANWA || {};
  function ready(fn){ (document.readyState!=='loading') ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  ready(()=> {
    const cvs = document.querySelector('canvas');
    if (!cvs) return;

    // Pointer events unify mouse + touch; forward to existing handlers if present
    cvs.addEventListener('pointerdown', (e)=>{
      try{ cvs.setPointerCapture(e.pointerId); }catch(_){}
      if (S.input && S.input.onDown) S.input.onDown(e);
    }, {passive:false});

    cvs.addEventListener('pointermove', (e)=>{
      if (S.input && S.input.onMove) S.input.onMove(e);
    }, {passive:false});

    const end = (e)=>{
      if (S.input && S.input.onUp) S.input.onUp(e);
      try{ cvs.releasePointerCapture(e.pointerId); }catch(_){}
    };
    cvs.addEventListener('pointerup', end, {passive:false});
    cvs.addEventListener('pointercancel', end, {passive:false});
    cvs.addEventListener('pointerleave', end, {passive:false});

    // Pinch zoom with two pointers
    const active = new Map();
    function dist(a,b){ const dx=a.clientX-b.clientX, dy=a.clientY-b.clientY; return Math.hypot(dx,dy); }
    let baseD = 0, lastScale = 1;

    cvs.addEventListener('pointerdown', e=>{
      active.set(e.pointerId, e);
      if (active.size===2){ baseD = 0; lastScale = 1; }
    }, {passive:false});

    cvs.addEventListener('pointermove', e=>{
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, e);
      if (active.size===2){
        const [p1,p2] = [...active.values()];
        const d = dist(p1,p2);
        if (!baseD) baseD = d;
        const scale = d / baseD;
        if (Math.abs(scale - lastScale) > 0.015){
          const centerX = (p1.clientX+p2.clientX)/2, centerY=(p1.clientY+p2.clientY)/2;
          if (S.input && typeof S.input.onPinch === 'function'){
            S.input.onPinch({scale, centerX, centerY, preventDefault:()=>{}});
          } else if (S.input && typeof S.input.onWheel === 'function'){
            const deltaY = (scale > lastScale) ? -40 : 40;
            S.input.onWheel({deltaY, clientX:centerX, clientY:centerY, preventDefault:()=>{}});
          }
          lastScale = scale;
        }
      }
    }, {passive:false});

    ['pointerup','pointercancel','pointerleave'].forEach(type=>{
      cvs.addEventListener(type, e=>{
        active.delete(e.pointerId);
        if (active.size<2){ baseD=0; lastScale=1; }
      }, {passive:true});
    });

    // Double-tap to zoom in
    let lastTap = 0;
    cvs.addEventListener('pointerup', e=>{
      const now = performance.now();
      if (now - lastTap < 300){
        if (S.input && typeof S.input.onWheel === 'function'){
          S.input.onWheel({deltaY:-120, clientX:e.clientX, clientY:e.clientY, preventDefault:()=>{}});
        }
      }
      lastTap = now;
    });

    // Prevent native scroll/zoom while interacting
    ['touchstart','touchmove'].forEach(t=>{
      cvs.addEventListener(t, ev => ev.preventDefault(), {passive:false});
    });
  });
})();