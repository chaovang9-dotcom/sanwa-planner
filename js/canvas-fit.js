/* canvas-fit.js — iOS/Safari fix for Sanwa Planner
   Keeps the grid aligned to the visible screen area (no vertical overflow)
   Works for Safari + Home Screen PWA without breaking desktop mode
*/
(function() {
  const canvas = document.querySelector("canvas");
  if (!canvas) return;

  function fitCanvas() {
    // Get the visible viewport (handles iOS URL bar shrinking)
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

    // Set physical + CSS size
    canvas.width  = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width  = vw + "px";
    canvas.style.height = vh + "px";

    // Reset transform scale for grid draw
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Optional: trigger redraw if available
    if (window.SANWA?.draw?.all) window.SANWA.draw.all();
  }

  // Initial fit and updates
  fitCanvas();
  window.addEventListener("resize", fitCanvas);
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", fitCanvas);
    visualViewport.addEventListener("scroll", fitCanvas);
  }
})();
