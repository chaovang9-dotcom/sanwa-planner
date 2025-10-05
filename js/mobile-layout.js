/* Mobile Layout Mode v1.2 — iOS VisualViewport aware (Safari + Home Screen)
   - Locks #canvasWrap to the *visible* viewport height
   - Uses window.visualViewport when available (iOS)
   - No ResizeObserver loops; no spacer elements
   - Works alongside js/mobile.js (gestures) and your current code
*/
(function () {
  const S = (window.SANWA = window.SANWA || {});
  const MOBILE_BP = 900; // px

  function ready(fn){
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function vpHeight() {
    // Prefer iOS VisualViewport if available
    if (window.visualViewport && typeof window.visualViewport.height === "number") {
      return window.visualViewport.height;
    }
    // Fallback to layout viewport
    return window.innerHeight;
  }

  function setVHVar(){
    const vh = vpHeight() * 0.01;
    document.documentElement.style.setProperty("--vh", `${vh}px`);
  }

  function ensureStyle(){
    let tag = document.getElementById("mobile-layout-style");
    if (!tag){
      tag = document.createElement("style");
      tag.id = "mobile-layout-style";
      document.head.appendChild(tag);
    }
    return tag;
  }

  function applyMobileCSS(){
    const st = ensureStyle();
    st.textContent = `
      :root { --vh: ${vpHeight() * 0.01}px; }

      /* Lock the page to the visible viewport; prevent page growth */
      @media (max-width:${MOBILE_BP}px){
        html, body { height: calc(var(--vh) * 100); overflow: hidden; }
        body {
          display: flex; flex-direction: column;
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
          padding-left: env(safe-area-inset-left);
          padding-right: env(safe-area-inset-right);
        }
        .topbar { flex: 0 0 auto; flex-wrap: wrap; gap: 8px; }
        #canvasWrap { flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden; }
        /* Optional: limit long sidebars from pushing layout */
        #leftSidebar, #rightSidebar { width: 100%; order: 2; max-height: 45vh; overflow:auto; }
        .panel { margin: 8px 0; }
        .topbar button, .tools button, .menu .dropdown button { min-width:44px; min-height:44px; }
      }

      #canvasWrap, canvas { touch-action: none; } /* stop page scroll while panning canvas */
    `;
  }

  function getEl(sel){ return document.querySelector(sel); }

  function lockCanvasHeight() {
    const isMobile = window.innerWidth <= MOBILE_BP;
    if (!isMobile){
      // desktop: clear any forced height
      const wrap = getEl("#canvasWrap");
      if (wrap) { wrap.style.height = ""; wrap.style.maxHeight = ""; }
      if (S.draw && typeof S.draw.resize === "function") { try{ S.draw.resize(); }catch(e){} }
      if (S.draw && typeof S.draw.all === "function")    { try{ S.draw.all();    }catch(e){} }
      return;
    }

    const topbar = getEl(".topbar");
    const wrap   = getEl("#canvasWrap") || document.body;
    if (!wrap) return;

    // Height that is actually visible (accounts for Safari toolbars)
    const visibleH = vpHeight();

    // Measure top bar (might be 0 if hidden/absent)
    const tbH = topbar ? topbar.getBoundingClientRect().height : 0;

    // Available pixels for canvas container
    const avail = Math.max(0, Math.round(visibleH - tbH));

    // Hard-pin — prevents incremental page growth
    wrap.style.height = avail + "px";
    wrap.style.maxHeight = avail + "px";
    wrap.style.overflow = "hidden";
    wrap.style.position = "relative";

    // Trigger your renderer to size canvas to its container
    if (S.draw && typeof S.draw.resize === "function") { try{ S.draw.resize(); }catch(e){} }
    if (S.draw && typeof S.draw.all === "function")    { try{ S.draw.all();    }catch(e){} }
  }

  // Optional compact topbar: keep existing menus but allow a single "Menu ▾"
  function mountHamburger(){
    if (document.getElementById("ml_hamburger")) return;
    const topbar = getEl(".topbar");
    if (!topbar) return;

    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.marginRight = "8px";

    const btn = document.createElement("button");
    btn.id = "ml_hamburger";
    btn.textContent = "Menu ▾";
    btn.style.padding = "8px 12px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid #e5e7eb";
    btn.style.background = "#f9fafb";
    btn.style.display = "none"; // shown only on mobile

    const panel = document.createElement("div");
    panel.id = "ml_menuPanel";
    panel.style.display = "none";
    panel.style.position = "absolute";
    panel.style.top = "100%";
    panel.style.left = "0";
    panel.style.zIndex = "9999";
    panel.style.background = "#fff";
    panel.style.border = "1px solid #e5e7eb";
    panel.style.borderRadius = "10px";
    panel.style.boxShadow = "0 8px 30px rgba(0,0,0,.12)";
    panel.style.padding = "8px";
    panel.style.maxWidth = "min(92vw, 460px)";

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    topbar.insertBefore(wrap, topbar.firstChild);

    function rebuildPanel(){
      panel.innerHTML = "";
      const groups = [];
      [...topbar.children].forEach(n=>{
        if (n===wrap) return;
        if (n.classList && n.classList.contains("brand")) return;
        if (n.querySelector && n.querySelector("button")) groups.push(n);
      });
      groups.forEach((g,i)=>{
        const block = document.createElement("div");
        block.style.margin = "6px 0 10px";
        block.style.borderBottom = "1px dashed #e5e7eb";
        block.style.paddingBottom = "8px";

        const title = document.createElement("div");
        title.style.fontWeight = "600";
        title.style.fontSize = "14px";
        title.style.marginBottom = "6px";
        const firstBtn = g.querySelector("button");
        title.textContent = g.getAttribute("data-label") || (firstBtn ? firstBtn.textContent.trim().split("\n")[0] : `Group ${i+1}`);

        const row = document.createElement("div");
        row.style.display = "flex"; row.style.flexWrap = "wrap"; row.style.gap = "6px";

        const btns = [...g.querySelectorAll(":scope > button, :scope .menu > button, :scope > .menu > button")];
        if (btns.length===0) btns.push(...g.querySelectorAll("button"));
        btns.forEach(b=>{
          const c = document.createElement("button");
          c.textContent = b.textContent.trim();
          c.style.padding = "8px 12px";
          c.style.borderRadius = "10px";
          c.style.border = "1px solid #e5e7eb";
          c.style.background = "#fff";
          c.addEventListener("click", ()=>{ b.click(); panel.style.display="none"; });
          row.appendChild(c);
        });

        block.appendChild(title); block.appendChild(row);
        panel.appendChild(block);
      });
    }

    btn.addEventListener("click", ()=>{
      if (panel.style.display === "none") { rebuildPanel(); panel.style.display = "block"; }
      else panel.style.display = "none";
    });

    // Show hamburger on mobile only
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    function toggleBtn(e){ btn.style.display = e.matches ? "inline-flex" : "none"; }
    toggleBtn(mq); mq.addEventListener("change", toggleBtn);
  }

  function layoutAll(){
    setVHVar();
    applyMobileCSS();
    lockCanvasHeight();
    mountHamburger();
  }

  ready(layoutAll);

  // Resize handlers
  window.addEventListener("resize", layoutAll);
  window.addEventListener("orientationchange", ()=>setTimeout(layoutAll, 120));

  // iOS: respond to the toolbar show/hide and address-bar changes
  if (window.visualViewport){
    window.visualViewport.addEventListener("resize", layoutAll);
    window.visualViewport.addEventListener("scroll", layoutAll);
  }
})();
