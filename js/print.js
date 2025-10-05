// js/print.js
// Prints page 1 (layout image) + page 2 (Legend).
// Legend flows TOP -> BOTTOM then moves to the next column.
// Respects: Hide Off (S.state.ui.hideOffSkus), per-object selections (S.state.print.legendInclude),
// and compact mode (S.state.print.legendCompact).
// Ensures object labels are BLACK when printing by re-rendering offscreen with S.state.printMode = true.
// Exposes SANWA.print.printLayout() and SANWA.print.printCurrentView() for menu.js.

(function(){
  const S = (window.SANWA = window.SANWA || {});
  S.print = S.print || {};

  // ---------- Utils ----------
  function escapeHtml(s){
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // Re-render the scene to an offscreen canvas with printMode=true (labels black).
  // Options:
  //   forceClean: hide helpers (grid, markers), force labels visible
  //   keepVisibility: keep current visibility toggles (grid/markers etc.)
  function renderToOffscreen(scale, {forceClean=false, keepVisibility=true} = {}){
    if (!S.els || !S.els.canvas || !S.draw || !S.draw.scene) return null;

    const src = S.els.canvas;
    const s = Math.max(1, Number(scale)||2);

    // create offscreen canvas
    const off = document.createElement('canvas');
    off.width  = src.width  * s;
    off.height = src.height * s;
    const g = off.getContext('2d');

    // remember state
    const prev = {
      canvas: S.els.canvas,
      ctx: S.els.ctx,
      zoom: S.state.zoom,
      panX: S.state.panX,
      panY: S.state.panY,
      grid: S.state.grid,
      showCenterMarker: S.state.showCenterMarker,
      showDiagnostics: S.state.showDiagnostics,
      showLabels: S.state.showLabels,
      printMode: !!S.state.printMode
    };

    // white paper bg
    g.save();
    g.fillStyle = '#fff';
    g.fillRect(0,0,off.width,off.height);
    g.restore();

    // swap to offscreen + scale the view
    S.els.canvas = off;
    S.els.ctx    = g;
    S.state.zoom = prev.zoom * s;
    S.state.panX = prev.panX * s;
    S.state.panY = prev.panY * s;

    // ensure dark labels in print
    S.state.printMode = true;

    if (forceClean){
      // a "clean" render: hide helpers, ensure labels visible
      S.state.grid             = false;
      S.state.showCenterMarker = false;
      S.state.showDiagnostics  = false;
      S.state.showLabels       = true;
    } else if (!keepVisibility){
      // fallback branch (rarely used)
      S.state.grid             = prev.grid;
      S.state.showCenterMarker = prev.showCenterMarker;
      S.state.showDiagnostics  = prev.showDiagnostics;
      S.state.showLabels       = prev.showLabels;
    }
    // else keep current visibility as-is

    try{
      S.draw.scene();
    } finally {
      // restore all state
      S.state.zoom            = prev.zoom;
      S.state.panX            = prev.panX;
      S.state.panY            = prev.panY;
      S.state.grid            = prev.grid;
      S.state.showCenterMarker= prev.showCenterMarker;
      S.state.showDiagnostics = prev.showDiagnostics;
      S.state.showLabels      = prev.showLabels;
      S.state.printMode       = prev.printMode;
      S.els.canvas            = prev.canvas;
      S.els.ctx               = prev.ctx;
      if (S.draw.all) S.draw.all();
    }

    return off.toDataURL('image/png');
  }

  // Convenience wrappers
  function exportCanvasPNG(scale){            // full clean render (no grid/markers; labels black)
    return renderToOffscreen(scale, {forceClean:true});
  }
  function exportCurrentViewPNG(scale){       // re-render current visibility (but labels black)
    return renderToOffscreen(scale, {forceClean:false, keepVisibility:true});
  }

  // ---------- Legend data ----------
  function collectLegendRows(){
    const allowed = new Set(['rack','fixture','special','bin']);
    const hideOff = !!(S.state && S.state.ui && S.state.ui.hideOffSkus);

    // Per-object selection map: if empty => include all
    const includeMap = (S.state && S.state.print && S.state.print.legendInclude) || {};
    const hasExplicitSelection = includeMap && Object.keys(includeMap).length > 0;

    // SKU index
    const bySku = new Map((S.state.skuDB||[]).map(r=>[
      String(r.sku||'').trim().toLowerCase(),
      { name:(r.name||'').trim(), active:r.active!==false }
    ]));

    const rows = [];
    for (const o of (S.state.objects||[])){
      if (!allowed.has(o.type)) continue;

      const label = (o.label||'').trim() || '(Unlabeled)';
      if (hasExplicitSelection && !includeMap[label]) continue; // only selected labels

      const typeLabel = o.type.charAt(0).toUpperCase() + o.type.slice(1);
      const skus = o.skus || [];

      if (!skus.length){
        rows.push({ objectType:typeLabel, objectLabel:label, item:'', code:'' });
        continue;
      }
      for (const codeRaw of skus){
        const code = String(codeRaw||'');
        const rec  = bySku.get(code.toLowerCase()) || {name:'', active:true};
        if (hideOff && rec.active===false) continue;
        rows.push({ objectType:typeLabel, objectLabel:label, item:rec.name||'', code });
      }
    }

    // Sort by object label, then item, then code
    rows.sort((a,b)=>{
      const ak = (a.objectLabel||'').toLowerCase()+'|'+(a.item||'').toLowerCase()+'|'+(a.code||'').toLowerCase();
      const bk = (b.objectLabel||'').toLowerCase()+'|'+(b.item||'').toLowerCase()+'|'+(b.code||'').toLowerCase();
      return ak.localeCompare(bk);
    });
    return rows;
  }

  // ---------- Legend HTML (vertical-first multi-columns) ----------
  function buildLegendHTML(){
    const rows = collectLegendRows();
    const compact = !!(S.state && S.state.print && S.state.print.legendCompact);

    const itemsHTML = rows.length===0
      ? `<div class="leg-row empty">No legend items selected or available.</div>`
      : rows.map(r=>`
        <div class="leg-row">
          <div class="c-obj">
            ${escapeHtml(r.objectLabel)}
            <div class="c-type">${escapeHtml(r.objectType)}</div>
          </div>
          <div class="c-item">${escapeHtml(r.item)}</div>
          <div class="c-code">${escapeHtml(r.code)}</div>
        </div>
      `).join('');

    const headerHTML = `
      <div class="leg-header">
        <div class="h-obj">Object</div>
        <div class="h-item">Item</div>
        <div class="h-code">Code</div>
      </div>`;

    return `
      <div class="page legend-page ${compact ? 'compact' : ''}">
        <h2 class="pl-h">Key / Legend</h2>
        <div class="legend-columns">
          ${headerHTML}
          <div class="leg-rows">
            ${itemsHTML}
          </div>
        </div>
      </div>`;
  }

  // ---------- Print window ----------
  function openPrintWindow(layoutDataUrl){
    const w = window.open('', '_blank');
    if(!w){ alert('Please enable pop-ups to print.'); return; }

    const legendHTML = buildLegendHTML();

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Layout Print</title>
  <style>
    :root{
      --page-pad: 12mm;
      --border: #ddd;
      --text: #000;
      --muted: #666;
      --col-gap: 10mm;

      /* Normal legend sizes */
      --legend-font: 12px;
      --legend-header-font: 16px;
      --legend-sub-font: 11px;
      --legend-pad-v: 2mm;
      --legend-pad-h: 2mm;
      --legend-cols: 3;
    }
    html,body{margin:0;padding:0;background:#fff;color:var(--text);font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
    .page{padding:var(--page-pad); box-sizing:border-box;}
    img{width:100%; height:auto; display:block; page-break-inside:avoid; border:0;}
    .noprint{ padding:10px; text-align:center; }
    .btn{ padding:8px 12px; border:1px solid #ccc; background:#fafafa; cursor:pointer; border-radius:8px; }

    @page{ size:auto; margin:12mm; }
    @media print{ .noprint{ display:none; } }

    /* Legend page */
    .legend-page{ page-break-before: always; }
    .pl-h{ margin:0 0 8mm 0; font:700 var(--legend-header-font)/1.2 system-ui,-apple-system,Segoe UI,Roboto; }

    /* Multi-column flow: TOP -> BOTTOM, then NEXT COLUMN */
    .legend-columns{
      column-count: var(--legend-cols);
      column-gap: var(--col-gap);
      column-fill: auto; /* fill vertical then overflow to next column */
    }

    /* One-time header above the multi-column rows */
    .leg-header{
      display:grid;
      grid-template-columns: 30% 50% 20%;
      gap: 4mm;
      padding: 0 0 3mm 0;
      border-bottom: 2px solid #000;
      margin-bottom: 3mm;
      font:700 var(--legend-font)/1.2 system-ui;
      break-after: avoid;
    }

    /* Rows are blocks so they can flow vertically into columns */
    .leg-row{
      break-inside: avoid;
      display:grid;
      grid-template-columns: 30% 50% 20%;
      gap: 4mm;
      padding: var(--legend-pad-v) var(--legend-pad-h);
      border-bottom: 1px solid var(--border);
      font: var(--legend-font)/1.2 system-ui;
    }
    .leg-row.empty{ border:0; color:var(--muted); padding-left:0; }
    .c-type{ font: var(--legend-sub-font)/1.2 system-ui; color: var(--muted); margin-top: 1mm; }

    /* Compact mode: smaller font/padding + 4 columns */
    .legend-page.compact{
      --legend-font: 10px;
      --legend-header-font: 14px;
      --legend-sub-font: 9px;
      --legend-pad-v: 1.25mm;
      --legend-pad-h: 1.5mm;
      --legend-cols: 4;
    }
  </style>
</head>
<body>
  <div class="page">
    <img src="${layoutDataUrl}" alt="Layout"/>
  </div>

  ${legendHTML}

  <div class="noprint">
    <button class="btn" onclick="window.print()">Print</button>
  </div>

  <script>
    window.addEventListener('load', function(){
      setTimeout(function(){ try{ window.print(); }catch(e){} }, 300);
    });
  </script>
</body>
</html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ---------- Public API (menu.js expects these names) ----------
  S.print.printLayout = function(){
    const url = exportCanvasPNG(2);   // clean render, labels black
    if (url) openPrintWindow(url);
  };
  S.print.printCurrentView = function(){
    const url = exportCurrentViewPNG(2); // current visibility, labels black
    if (url) openPrintWindow(url);
  };
})();
