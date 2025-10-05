/* Mobile Layout Mode v1.1 — locks canvas height on mobile
   - No ResizeObserver feedback loops
   - Computes exact viewport height minus topbar + safe areas
   - No extra spacer div (removes the previous sizer approach)
   - Works alongside js/mobile.js gestures
*/
(function () {
  const S = (window.SANWA = window.SANWA || {});
  const BPX = 900; // mobile breakpoint

  function ready(fn){
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function setVHVar(){
    // iOS URL bar safe viewport
    const vh = window.innerHeight * 0.01;
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

  function applyCSS(isMobile){
    const st = ensureStyle();
    st.textContent = `
      :root { --vh: ${window.innerHeight * 0.01}px; }

      /* Prevent page from growing as canvas changes height */
      @media (max-width:${BPX}px){
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
        #leftSidebar, #rightSidebar { width: 100%; order: 2; max-height: 45vh; overflow:auto; }
        .panel { margin: 8px 0; }
        /* make controls tappable */
        .topbar button, .tools button, .menu .dropdown button { min-width:44px; min-height:44px; }
      }

      /* Canvas must not trigger page scroll while panning/zooming */
      #canvasWrap, canvas { touch-action: none; }
    `;
  }

  function lockCanvasHeight(){
    const topbar = document.querySelector(".topbar");
    const wrap   = document.getElementById("canvasWrap") || document.body;
    if (!wrap) return;

    const isMobile = window.innerWidth <= BPX;
    applyCSS(isMobile);

    if (!isMobile){
      // Let desktop behave normally
      wrap.style.height = "";
      if (S.draw && typeof S.draw.resize === "function") { try{ S.draw.resize(); }catch(e){} }
      if (S.draw && typeof S.draw.all === "function")    { try{ S.draw.all();    }catch(e){} }
      return;
    }

    // Compute available height: viewport minus topbar minus safe areas (CSS handles padding)
    const topH = topbar ? topbar.getBoundingClientRect().height : 0;
    const avail = Math.max(0, window.innerHeight - topH);

    // Hard-pin the wrapper height; prevents incremental page growth
    wrap.style.height = avail + "px";
    wrap.style.maxHeight = avail + "px";

    // If your render code sizes the canvas from wrapper, trigger a resize + redraw
    if (S.draw && typeof S.draw.resize === "function") { try{ S.draw.resize(); }catch(e){} }
    if (S.draw && typeof S.draw.all === "function")    { try{ S.draw.all();    }catch(e){} }
  }

  // OPTIONAL: simple collapsed menu on mobile (keeps UI compact)
  function mountHamburger(){
    if (document.getElementById("ml_hamburger")) return;
    const topbar = document.querySelector(".topbar");
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
    btn.style.display = "none"; // shown only on mobile below

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

    // Show on mobile only
    const mq = window.matchMedia(`(max-width:${BPX}px)`);
    function toggleBtn(e){ btn.style.display = e.matches ? "inline-flex" : "none"; }
    toggleBtn(mq); mq.addEventListener("change", toggleBtn);
  }

  function layoutAll(){
    setVHVar();
    lockCanvasHeight();
    mountHamburger();
  }

  ready(layoutAll);
  window.addEventListener("resize", layoutAll);
  window.addEventListener("orientationchange", ()=>setTimeout(layoutAll, 120));
})();
