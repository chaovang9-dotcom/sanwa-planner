// js/menu.js — FULL REPLACEMENT (File + Edit + View + Print items)
(function(){
  const S = (window.SANWA = window.SANWA || {});

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function ensureDraw(){ if (S.draw && typeof S.draw.all === 'function') S.draw.all(); }

  // Add near the top (below ensureDraw etc.)
  function syncDiagnosticsPanel(){
    const el = document.getElementById('diagnosticsPanel');
    if (!el) return;
    el.style.display = (S.state && S.state.showDiagnostics) ? '' : 'none';
  }

  // ---------- File helpers ----------
  function exportSkuCsv(){
    const rows = [['Code','Name','Active','Category','Tags']];
    const db = (S.state && S.state.skuDB) || [];
    for (const r of db){
      rows.push([
        String(r.sku ?? ''),
        String(r.name ?? ''),
        (r.active!==false) ? 'TRUE' : 'FALSE',
        String(r.category ?? ''),
        Array.isArray(r.tags) ? r.tags.join(';') : String(r.tags ?? '')
      ]);
    }
    const csv = rows.map(r => r.map(v=>{
      const s=String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = 'sanwa_skus.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importSkusCsv(){
    if (S.io && typeof S.io.importSKUsCSV === 'function'){
      S.io.importSKUsCSV();
    } else {
      alert('Importer not found (core.js should define S.io.importSKUsCSV).');
    }
  }

  // ---------- Edit helpers ----------
  function deleteSelected(){
    if (!S.state) return;
    const sel = new Set(S.state.selection || []);
    if (!sel.size) return;
    if (S.util && S.util.pushUndo) S.util.pushUndo();
    S.state.objects = (S.state.objects || []).filter(o => !sel.has(o.id));
    S.state.selection = [];
    ensureDraw();
  }

  function duplicateSelected(){
    if (!S.state) return;
    const sel = new Set(S.state.selection || []);
    if (!sel.size) return;
    if (S.util && S.util.pushUndo) S.util.pushUndo();

    const cloned = [];
    for (const o of S.state.objects || []){
      if (!sel.has(o.id)) continue;
      const c = JSON.parse(JSON.stringify(o));
      c.id = (S.util && S.util.uuid) ? S.util.uuid() : ('id-'+Math.random().toString(36).slice(2,9));
      // offset slightly so it’s visible
      if (c.type==='wall' || c.type==='measure'){
        c.x1 += 10; c.y1 += 10; c.x2 += 10; c.y2 += 10;
      } else {
        c.x += 10; c.y += 10;
      }
      cloned.push(c);
    }
    S.state.objects.push(...cloned);
    S.state.selection = cloned.map(c=>c.id);
    ensureDraw();
  }

  // ---------- View helpers ----------
  function toggleFlag(path){
    if (!S.state) return;
    S.state[path] = !S.state[path];
    ensureDraw();
  }
  function zoomReset(){
    if (!S.state) return;
    S.state.panX = 0; S.state.panY = 0; S.state.zoom = 1;
    ensureDraw();
  }

  // ---------- UI injection helpers (for Print + Import buttons) ----------
  function ensureButton(parent, id, label, afterId){
    if (!parent) return null;
    let btn = document.getElementById(id);
    if (!btn){
      btn = document.createElement('button');
      btn.id = id;
      btn.textContent = label;
      if (afterId){
        const anchor = document.getElementById(afterId);
        if (anchor && anchor.parentElement === parent){
          anchor.insertAdjacentElement('afterend', btn);
        } else {
          parent.appendChild(btn);
        }
      } else {
        parent.appendChild(btn);
      }
    }
    return btn;
  }

  onReady(()=>{
    // ===== FILE menu wiring =====
    const fileMenu = document.getElementById('fileMenu');      // exists in index.html
    const fileNew  = document.getElementById('fileNew');
    const fileLoad = document.getElementById('fileLoad');
    const fileSave = document.getElementById('fileSave');
    const exportSkus = document.getElementById('exportSkus');

    if (fileNew)  fileNew.addEventListener('click', ()=> S.io && S.io.new && S.io.new());            // :contentReference[oaicite:0]{index=0}
    if (fileLoad) fileLoad.addEventListener('click', ()=> S.io && S.io.load && S.io.load());          // :contentReference[oaicite:1]{index=1}
    if (fileSave) fileSave.addEventListener('click', ()=> S.io && S.io.save && S.io.save());          // :contentReference[oaicite:2]{index=2}
    if (exportSkus) exportSkus.addEventListener('click', exportSkuCsv);                               // :contentReference[oaicite:3]{index=3}

    // Inject missing File actions: Print + Print Current View + Import SKUs (CSV)
    const printBtn = ensureButton(fileMenu, 'printBtn', 'Print…', 'fileSave');
    const printViewBtn = ensureButton(fileMenu, 'printViewBtn', 'Print Current View…', 'printBtn');
    const importCsvBtn = ensureButton(fileMenu, 'importSkuCsvBtn', 'Import SKUs (CSV)', 'printViewBtn');

    if (printBtn){
      printBtn.addEventListener('click', ()=>{
        if (S.print && typeof S.print.printLayout === 'function'){
          S.print.printLayout();
        } else {
          alert('Print module not found. Make sure js/print.js defines SANWA.print.');
        }
      });
    }
    if (printViewBtn){
      printViewBtn.addEventListener('click', ()=>{
        if (S.print && typeof S.print.printCurrentView === 'function'){
          S.print.printCurrentView();
        } else {
          alert('Print module not found. Make sure js/print.js defines SANWA.print.');
        }
      });
    }
    if (importCsvBtn){
      importCsvBtn.addEventListener('click', importSkusCsv);
    }

    // ===== EDIT menu wiring =====
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const duplicateBtn = document.getElementById('duplicateBtn');

    if (undoBtn) undoBtn.addEventListener('click', ()=> S.util && S.util.undo && S.util.undo());      // Undo/Redo exist in core.js
    if (redoBtn) redoBtn.addEventListener('click', ()=> S.util && S.util.redo && S.util.redo());
    if (deleteBtn) deleteBtn.addEventListener('click', deleteSelected);
    if (duplicateBtn) duplicateBtn.addEventListener('click', duplicateSelected);

    // ===== VIEW menu wiring =====
    const toggleGrid = document.getElementById('toggleGrid');
    const toggleWallDims = document.getElementById('toggleWallDims');
    const toggleCenterMarker = document.getElementById('toggleCenterMarker');
    const toggleLabels = document.getElementById('toggleLabels');
    const toggleSnap = document.getElementById('toggleSnap');
    const toggleDiagnostics = document.getElementById('toggleDiagnostics');
    const zoomResetBtn = document.getElementById('zoomResetBtn');

    if (toggleGrid) toggleGrid.addEventListener('click', ()=> toggleFlag('grid'));
    if (toggleWallDims) toggleWallDims.addEventListener('click', ()=> toggleFlag('showWallDims'));
    if (toggleCenterMarker) toggleCenterMarker.addEventListener('click', ()=> toggleFlag('showCenterMarker'));
    if (toggleLabels) toggleLabels.addEventListener('click', ()=> toggleFlag('showLabels'));
    if (toggleSnap) toggleSnap.addEventListener('click', ()=> toggleFlag('snapEnabled'));
    if (toggleDiagnostics) toggleDiagnostics.addEventListener('click', ()=>{  S.state.showDiagnostics = !S.state.showDiagnostics;  syncDiagnosticsPanel();});
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', zoomReset);
  });
  syncDiagnosticsPanel();
})();
