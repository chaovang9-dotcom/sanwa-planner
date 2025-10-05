/* canvas-fit.js — iOS-safe canvas sizing + DPR fix
   - Uses window.visualViewport on iOS for the true visible height
   - Clamps DPR to avoid huge buffers on phones
   - Sets canvas.width/height (backing store) + CSS size
   - Triggers your existing resize/redraw without touching your logic
*/
(function () {
  const S = (window.SANWA = window.SANWA || {});
  const BPX = 900; // mobile breakpoint

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

  function lockMobileLayout(){
    // Hard-pin #canvasWrap to visible viewport minus topbar
    const isMobile = window.innerWidth <= BPX;
    const topbar = document.querySelector(".topbar");
    const wrap   = document.getElementById("canvasWrap") || document.body;
    if (!wrap) return;

    if (!isMobile){
      wrap.style.height = "";
      wrap.style.maxHeight = "";
      return;
    }
    const tbH   = topbar ? topbar.getBoundingClientRect().height : 0;
    const avail = Math.max(0, vpHeight() - tbH);
    wrap.style.height = avail + "px";
    wrap.style.maxHeight = avail + "px";
    wrap.style.overflow = "hidden";
    wrap.style.position = "relative";
  }

  function sizeCanvas(){
    // Find canvas the same way your app does
    const canvas = (S.els && S.els.canvas) || document.querySelector("canvas");
    if (!canvas) return;

    // Size from its container (#canvasWrap or parentNode)
    const parent = document.getElementById("canvasWrap") || canvas.parentNode || document.body;
    const cssW = Math.max(0, Math.floor(parent.clientWidth));
    const cssH = Math.max(0, Math.floor(parent.clientHeight));

    // Clamp DPR on mobile for performance; keep 1..2
    const isMobile = window.innerWidth <= BPX;
    const dprRaw = window.devicePixelRatio || 1;
    const dpr = isMobile ? Math.min(2, Math.max(1, dprRaw)) : Math.max(1, dprRaw);

    // Only touch if changed (prevents ResizeObserver loops)
    const targetW = Math.max(1, Math.floor(cssW * dpr));
    const targetH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.style.width  = cssW + "px";
      canvas.style.height = cssH + "px";
      canvas.width  = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Ensure 1 CSS pixel = 1 unit in your draw code
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    // Let your renderer respond (if it exposes hooks)
    if (S.draw && typeof S.draw.resize === "function") { try{ S.draw.resize(); }catch(e){} }
    if (S.draw && typeof S.draw.all === "function")    { try{ S.draw.all();    }catch(e){} }
  }

  function layoutAndFit(){
    lockMobileLayout();
    sizeCanvas();
  }

  ready(layoutAndFit);

  // Listen to all the ways iOS changes viewport height
  window.addEventListener("resize", layoutAndFit);
  window.addEventListener("orientationchange", ()=>setTimeout(layoutAndFit, 120));
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", layoutAndFit);
    window.visualViewport.addEventListener("scroll", layoutAndFit);
  }
})();
