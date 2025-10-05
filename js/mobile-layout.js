/* Mobile Layout Mode v1 — drop-in (no core edits required)
   - Collapses topbar into a hamburger on small screens
   - Ensures canvas fills the remaining viewport height
   - Enlarges tap targets
   - Respects iPhone safe areas
   - Works alongside js/mobile.js (gestures) and your current files
*/
(function () {
  const S = (window.SANWA = window.SANWA || {});

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // ----- config -----
  const MOBILE_BREAKPOINT = 900; // px
  const MIN_TAP = 44;            // px
  const STATE = { isMobile: false, mounted: false };

  // Create a style tag we fully control (no need to edit styles.css)
  function ensureStyleTag() {
    let tag = document.getElementById("mobile-layout-style");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "mobile-layout-style";
      document.head.appendChild(tag);
    }
    return tag;
  }

  function setCSS(isMobile) {
    const st = ensureStyleTag();
    // CSS rules inserted dynamically so you don’t have to maintain a second CSS file
    st.textContent = `
      :root { --vh: ${window.innerHeight * 0.01}px; }
      html, body { height: calc(var(--vh) * 100); }

      body {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
      }

      #canvasWrap, canvas { touch-action: none; }

      /* Tap targets */
      .topbar button, .tools button, .menu .dropdown button {
        min-width: ${MIN_TAP}px; min-height: ${MIN_TAP}px;
      }

      /* Hamburger visibility */
      #ml_hamburger { display: ${isMobile ? "inline-flex" : "none"}; }

      /* Topbar reflow on mobile */
      @media (max-width: ${MOBILE_BREAKPOINT}px) {
        .topbar { flex-wrap: wrap; gap: 8px; }
        #leftSidebar, #rightSidebar { width: 100%; order: 2; }
        #canvasWrap { order: 1; }
        .panel { margin: 8px 0; }
      }

      /* Dropdown panel */
      #ml_menuPanel {
        display: none;
        position: absolute;
        z-index: 9999;
        top: 100%;
        left: 0;
        background: #ffffff;
        color: #111827;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,.12);
        padding: 8px;
        max-width: min(92vw, 460px);
      }
      #ml_menuPanel.show { display: block; }
      #ml_menuPanel .ml-group {
        margin: 6px 0 10px;
        border-bottom: 1px dashed #e5e7eb;
        padding-bottom: 8px;
      }
      #ml_menuPanel .ml-group:last-child { border-bottom: 0; }
      #ml_menuPanel .ml-title {
        font-weight: 600; font-size: 14px; margin-bottom: 6px;
      }
      #ml_menuPanel .ml-row {
        display: flex; flex-wrap: wrap; gap: 6px;
      }

      /* Ensure the canvas actually gets the remaining height */
      #ml_canvasSizer {
        display: block;
        width: 100%;
        height: 0px; /* set dynamically */
      }
    `;
  }

  // Build hamburger + panel.
  function mountMobileTopbar(topbar) {
    if (STATE.mounted) return;

    // Create a container for our hamburger
    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.marginRight = "8px";

    // Hamburger button
    const burger = document.createElement("button");
    burger.id = "ml_hamburger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Menu");
    burger.style.padding = "8px 12px";
    burger.style.borderRadius = "10px";
    burger.style.border = "1px solid #e5e7eb";
    burger.style.background = "#f9fafb";
    burger.style.fontWeight = "600";
    burger.style.display = "none"; // toggled via CSS
    burger.textContent = "Menu ▾";

    // Panel that will hold cloned groups
    const panel = document.createElement("div");
    panel.id = "ml_menuPanel";

    // Insert into topbar
    wrap.appendChild(burger);
    wrap.appendChild(panel);
    topbar.insertBefore(wrap, topbar.firstChild);

    // Collect existing topbar groups (buttons/menus) except our own wrap/brand
    const groups = [];
    [...topbar.children].forEach((node) => {
      if (node === wrap) return;
      if (node.classList && node.classList.contains("brand")) return;
      // Gather visible groups with buttons
      if (node.querySelector && node.querySelector("button")) groups.push(node);
    });

    // Clone each group into a tidy panel
    panel.innerHTML = "";
    groups.forEach((g, i) => {
      const grp = document.createElement("div");
      grp.className = "ml-group";
      const title = document.createElement("div");
      title.className = "ml-title";
      // Try to infer a label from the first button text or a data-label
      const firstBtn = g.querySelector("button");
      title.textContent =
        g.getAttribute("data-label") ||
        (firstBtn ? (firstBtn.textContent.split("\n")[0] || "Group") : `Group ${i+1}`);

      const row = document.createElement("div");
      row.className = "ml-row";

      // Clone each button (shallow) and wire a click that dispatches to original
      const btns = [...g.querySelectorAll(":scope > button, :scope .menu > button, :scope > .menu > button")];
      if (btns.length === 0) {
        // fallback: any buttons inside
        btns.push(...g.querySelectorAll("button"));
      }
      btns.forEach((b) => {
        const clone = document.createElement("button");
        clone.type = "button";
        clone.textContent = b.textContent.trim();
        clone.style.padding = "8px 12px";
        clone.style.borderRadius = "10px";
        clone.style.border = "1px solid #e5e7eb";
        clone.style.background = "#ffffff";
        clone.addEventListener("click", () => {
          // Trigger the original button’s click
          b.click();
          panel.classList.remove("show");
        });
        row.appendChild(clone);
      });

      grp.appendChild(title);
      grp.appendChild(row);
      panel.appendChild(grp);
    });

    // Toggle panel
    burger.addEventListener("click", () => {
      panel.classList.toggle("show");
    });

    // Close when tapping outside
    document.addEventListener("click", (e) => {
      if (!panel.classList.contains("show")) return;
      if (e.target === burger || panel.contains(e.target)) return;
      panel.classList.remove("show");
    });

    STATE.mounted = true;
  }

  // Create a hidden spacer that we control to size the canvas area
  function ensureCanvasSizer() {
    let sizer = document.getElementById("ml_canvasSizer");
    if (!sizer) {
      sizer = document.createElement("div");
      sizer.id = "ml_canvasSizer";
      const wrap = document.getElementById("canvasWrap") || document.body;
      wrap.insertBefore(sizer, wrap.firstChild);
    }
    return sizer;
  }

  function layout() {
    const topbar = document.querySelector(".topbar");
    const wrap = document.getElementById("canvasWrap") || document.body;
    const canvas = (S.els && S.els.canvas) || document.querySelector("canvas");

    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    STATE.isMobile = isMobile;

    setCSS(isMobile);

    if (isMobile && topbar) mountMobileTopbar(topbar);

    // Compute available height for canvas
    const rectTopbar = topbar ? topbar.getBoundingClientRect() : { height: 0 };
    const safeTop = getSafeInset("top");
    const safeBot = getSafeInset("bottom");
    const avail = window.innerHeight - rectTopbar.height - safeTop - safeBot;

    // Set the sizer height; canvas code can read parent height if needed
    const sizer = ensureCanvasSizer();
    sizer.style.height = Math.max(0, avail) + "px";

    // Also directly size the canvas container if present
    if (wrap && wrap !== document.body) {
      wrap.style.height = Math.max(0, avail) + "px";
      wrap.style.position = "relative";
    }

    // If your draw code uses canvas width/height, you can trigger a resize:
    if (S.draw && typeof S.draw.resize === "function") {
      try { S.draw.resize(); } catch (e) {}
    }
    if (S.draw && typeof S.draw.all === "function") {
      try { S.draw.all(); } catch (e) {}
    }
  }

  // Read iOS safe-area inset via CSS env()
  function getSafeInset(which) {
    // Fallback approximations if env() isn’t available in JS
    // We already padded body via CSS; this helps compute the available space.
    // Just return 0 here; CSS handles visual padding.
    return 0;
  }

  function setVHVar() {
    // Keep --vh accurate on orientation changes / URL bar show-hide
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--vh", `${vh}px`);
  }

  ready(() => {
    setVHVar();
    layout();
  });

  window.addEventListener("resize", () => {
    setVHVar();
    layout();
  });
  window.addEventListener("orientationchange", () => {
    setTimeout(() => { setVHVar(); layout(); }, 90);
  });

})();
