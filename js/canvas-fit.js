/* canvas-fit.js — Final iOS + Print safe version */
(function () {
  const S = (window.SANWA = window.SANWA || {});
  const BPX = 900;

  function ready(fn){
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function vpHeight(){
    if (window.visualViewport && typeof window.visualViewport.height === "number") {
      return Math.max(0, Math.round(window.visualViewport.height));
    }
    return Math.max(0, Math.round(window.innerHeight));
  }

  function lockLayout(){
    const isMobile = window.innerWidth <= BPX;
    const topbar = document.querySelector(".topbar");
    const wrap   = document.getElementById("canvasWrap") || document.body;
    if (!wrap) return;

    const tbH = topbar ? topbar.getBoundingClientRect().height : 0;
    const vh  = vpHeight();
    const avail = Math.max(0, vh - tbH);

    // 👇 Hard lock to visible height (prevents multi-page grid)
    wrap.style.height = avail + "px";
    wrap.style.maxHeight = avail + "px";
    wrap.style.overflow = "hidden";
    wrap.style.position = "relative";

    const canvas = (S.els && S.els.canvas) || document.querySelector("canvas");
    if (!canvas) return;

    const cssW = Math.max(0, Math.floor(wrap.clientWidth));
    const cssH = Math.max(0, Math.floor(wrap.clientHeight));

    // Clamp canvas height to viewport (no taller than visible area)
    const vhLimit = window.innerHeight || cssH;
    const safeH = Math.min(cssH, vhLimit);

    // DPR adjustments
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const targetW = Math.max(1, Math.floor(cssW * dpr));
    const targetH = Math.max(1, Math.floor(safeH * dpr));

    // Only resize if changed
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.style.width  = cssW + "px";
      canvas.style.height = safeH + "px";
      canvas.width  = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Trigger redraw
    if (S.draw && typeof S.draw.resize === "function") { try{ S.draw.resize(); }catch(e){} }
    if (S.draw && typeof S.draw.all === "function")    { try{ S.draw.all();    }catch(e){} }
  }

  function layout(){
    lockLayout();
  }

  ready(layout);

  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", ()=>setTimeout(layout, 120));
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", layout);
    window.visualViewport.addEventListener("scroll", layout);
  }
})();
