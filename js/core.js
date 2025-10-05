(function(){
  const S = window.SANWA = {
    state: {
      snap: 0.5,
      scale: 20,
      zoom: 1,
      panX: 0, panY: 0,
      grid: true,
      tool: 'select',

      objects: [],
      selection: [],
      undo: [], redo: [],
      maxUndo: 100,

      layers: {
        Walls:{visible:true,locked:false, selectable:true},
        Fixtures:{visible:true,locked:false, selectable:true},
        Zones:{visible:true,locked:false, selectable:true},
        Annotations:{visible:true,locked:false, selectable:true}
      },

      rotateSnap: true,
      showWallDims: true,
      showCenterMarker: true,
      showLabels: true,
      snapEnabled: true,
      showDiagnostics: true,

      // SKU system
      skuDB: [],             // [{sku, name, active, category, tags:[]}]
      assignments: {},       // sku -> objectId (optional helper)
      validation: {unplaced:[],duplicates:[],overfill:[]},

      ui: {
        hideOffSkus: false,
        skuDockCollapsed: false,      // NEW: collapse the dock
        skuDockShowAll: false         // NEW: show all vs 10 items
      },

      // Print options
      print: {
        legendCompact: false,         // NEW: smaller legend styling
        legendInclude: {}             // NEW: { [label]: true } -> include; empty means include all
      },

      printMode: false
    },
    els: {}, util:{}, draw:{}, io:{}, sku:{}, validate:{}, build:{}
  };

  // === Local Storage Keys ===
  const LS_AUTOSAVE_KEY = 'sanwa_autosave_v1';
  const LS_CSV_MAP      = 'sanwa_csv_map_v1';

  const DEFAULT_SKU_KEYS  = ['sku','SKU','Sku','upc','UPC','Upc','id','ID','Id','code','Code','Item Code','ITEM CODE','Item','ITEM'];
  const DEFAULT_NAME_KEYS = ['name','Name','description','Description','title','Title','item name','Item Name','ITEM NAME','desc','Desc','DESCRIPTION'];
  const DEFAULT_CAT_KEYS  = ['category','Category','dept','Dept','department','Department'];
  const DEFAULT_TAG_KEYS  = ['tags','Tags','labels','Labels','keywords','Keywords'];

  const INCLUDE_TYPES_FOR_LEGEND = new Set(['rack','fixture','special','bin']);

  const $ = (sel,root=document)=>root.querySelector(sel);
  S.$ = $;

  // Elements
  S.els.canvas = $('#gridCanvas');
  S.els.ctx    = S.els.canvas ? S.els.canvas.getContext('2d') : null;
  S.els.wrapper= $('#canvasWrapper');
  S.els.toolPanel = $('#toolPanel');
  S.els.layersPanel = $('#layersPanel');
  S.els.contextPanel= $('#contextPanel');
  S.els.validationPanel = $('#validationPanel');
  S.els.toast = $('#toastContainer');
  S.els.scale = $('#scaleSlider');
  S.els.snap  = $('#snapSelect');
  S.els.ruler = $('#ruler');
  S.els.skuDock = $('#skuDock');

  // Fit canvas to wrapper
  (function(){
    if (!S.els.wrapper || !S.els.canvas || !S.els.ctx) return;
    function resizeCanvasToWrapper(){
      const wrap = S.els.wrapper;
      const cvs  = S.els.canvas;
      const ctx  = S.els.ctx;

      const dpr  = Math.max(1, window.devicePixelRatio || 1);
      const rect = wrap.getBoundingClientRect();
      const wCss = Math.max(1, Math.floor(rect.width));
      const hCss = Math.max(1, Math.floor(rect.height));
      const wBuf = Math.floor(wCss * dpr);
      const hBuf = Math.floor(hCss * dpr);

      if (cvs.style.width !== wCss + 'px')  cvs.style.width  = wCss + 'px';
      if (cvs.style.height !== hCss + 'px') cvs.style.height = hCss + 'px';
      if (cvs.width !== wBuf)  cvs.width  = wBuf;
      if (cvs.height !== hBuf) cvs.height = hBuf;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (S.draw && S.draw.all) S.draw.all();
    }
    window.addEventListener('resize', resizeCanvasToWrapper, { passive: true });
    if (window.ResizeObserver){
      const ro = new ResizeObserver(()=>resizeCanvasToWrapper());
      ro.observe(S.els.wrapper);
    }
    requestAnimationFrame(resizeCanvasToWrapper);
  })();

  // Colors
  S.COL = {
    grid:'#2563eb44', wall:'#9ca3af', door:'#22d3ee',
    rack:'#2563eb', bin:'#fbbf24', pallet:'#a78b5f', fixture:'#16a34a',
    zone:'#2563EB', workzone:'#F59E0B',
    label:'#e5e7eb', select:'#60a5fa'
  };

  // Utils
  S.util.ftToPx = ft => ft * S.state.scale;
  S.util.pxToFt = px => px / S.state.scale;
  S.util.snapFt = v => S.state.snap > 0 ? Math.round(v / S.state.snap) * S.state.snap : v;
  S.util.uuid   = ()=>'id-'+Math.random().toString(36).slice(2,9);

  S.util.hexToRGBA = (hex, a = 0.18) => {
    const h = (hex || '#888').replace('#','');
    let r=136, g=136, b=136;
    if (h.length === 3){
      r = parseInt(h[0]+h[0],16);
      g = parseInt(h[1]+h[1],16);
      b = parseInt(h[2]+h[2],16);
    } else if (h.length >= 6){
      r = parseInt(h.slice(0,2),16);
      g = parseInt(h.slice(2,4),16);
      b = parseInt(h.slice(4,6),16);
    }
    return `rgba(${r},${g},${b},${a})`;
  };

  S.util.labelBBox = (o) => {
    const ctx = S.els.ctx;
    ctx.save();
    ctx.font = `${(o.size || 14) / S.state.zoom}px Inter`;
    const w = ctx.measureText(o.text || 'Label').width * S.state.zoom;
    const h = (o.size || 14);
    ctx.restore();
    return { w, h };
  };

  S.util.toast=(msg,type='info')=>{
    const d=document.createElement('div');
    d.className='toast '+type;
    d.textContent=msg;
    S.els.toast && S.els.toast.appendChild(d);
    setTimeout(()=>d.remove(),3000);
  };

  S.util.canvasScale=()=>{
    const r=S.els.canvas.getBoundingClientRect();
    return {sx:S.els.canvas.width/r.width, sy:S.els.canvas.height/r.height, left:r.left, top:r.top};
  };
  S.util.eventToCanvas=(e)=>{
    const m=S.util.canvasScale();
    return {x:(e.clientX-m.left)*m.sx, y:(e.clientY-m.top)*m.sy};
  };
  S.util.world2canvas=(wx,wy)=>({x:wx*S.state.zoom + S.state.panX, y:wy*S.state.zoom + S.state.panY});
  S.util.canvas2world=(cx,cy)=>({x:(cx - S.state.panX)/S.state.zoom, y:(cy - S.state.panY)/S.state.zoom});

  // ---------- AUTOSAVE + RESTORE ----------
  let autosaveTimer=null;
  function scheduleAutosave(){
    clearTimeout(autosaveTimer);
    autosaveTimer=setTimeout(()=>{
      try{
        const snap=JSON.stringify({
          when: Date.now(),
          state: {
            objects:S.state.objects,
            assignments:S.state.assignments,
            skuDB:S.state.skuDB,
            ui:S.state.ui,
            print:S.state.print,
            panX:S.state.panX, panY:S.state.panY, zoom:S.state.zoom,
            scale:S.state.scale, snap:S.state.snap
          }
        });
        localStorage.setItem(LS_AUTOSAVE_KEY, snap);
      }catch(e){}
    }, 800);
  }
  function offerRestore(){
    try{
      const raw=localStorage.getItem(LS_AUTOSAVE_KEY); if(!raw) return;
      const j=JSON.parse(raw); if(!j||!j.state) return;
      const bar=document.createElement('div');
      Object.assign(bar.style,{position:'fixed',left:'12px',bottom:'12px',background:'#0b3d1a',color:'#fff',
        padding:'10px 12px', borderRadius:'10px', zIndex:9999, display:'flex', gap:'8px', alignItems:'center', font:'13px/1.2 system-ui'});
      bar.innerHTML=`<div><strong>Restore session?</strong> Saved ${new Date(j.when).toLocaleString()}.</div>`;
      const yes=document.createElement('button'); yes.textContent='Restore';
      const no=document.createElement('button'); no.textContent='Dismiss';
      styleBtn(yes); styleBtn(no,true);
      bar.append(yes,no); document.body.appendChild(bar);
      yes.onclick=()=>{
        const s=j.state;
        S.state.objects=s.objects||[];
        S.state.assignments=s.assignments||{};
        S.state.skuDB=(s.skuDB||[]).map(x=>({ ...x, active:x.active!==false, tags:x.tags||[], category:x.category||'' }));
        S.state.ui=s.ui||{hideOffSkus:false, skuDockCollapsed:false, skuDockShowAll:false};
        S.state.print=s.print||{legendCompact:false, legendInclude:{}};
        S.state.panX=s.panX||0; S.state.panY=s.panY||0; S.state.zoom=s.zoom||1;
        if(s.scale!=null) S.state.scale=s.scale;
        if(s.snap!=null) S.state.snap=s.snap;
        S.draw.all(); buildSkuDock(); buildSkuManager(); buildLegendPanel();
        S.util.toast('Session restored','success');
        bar.remove();
      };
      no.onclick=()=>bar.remove();
    }catch(e){}
  }

  // Undo/Redo
  S.util.pushUndo=()=>{
    const snap=JSON.stringify({
      objects:S.state.objects,
      assignments:S.state.assignments,
      skuDB:S.state.skuDB,
      ui:S.state.ui,
      print:S.state.print
    });
    S.state.undo.push(snap);
    if(S.state.undo.length>S.state.maxUndo) S.state.undo.shift();
    S.state.redo.length=0;
    scheduleAutosave();
  };
  S.util.undo=()=>{
    if(!S.state.undo.length) return;
    const cur=JSON.stringify({objects:S.state.objects,assignments:S.state.assignments,skuDB:S.state.skuDB,ui:S.state.ui,print:S.state.print});
    S.state.redo.push(cur);
    const prev=JSON.parse(S.state.undo.pop());
    S.state.objects=prev.objects||[];
    S.state.assignments=prev.assignments||{};
    S.state.skuDB=(prev.skuDB||[]).map(s=>({
      sku:s.sku||s.SKU||s.Code||'',
      name:s.name||s.Name||s.Description||'',
      active: s.active!==false,
      category:s.category||'',
      tags:s.tags||[]
    }));
    S.state.ui = prev.ui || { hideOffSkus:false, skuDockCollapsed:false, skuDockShowAll:false };
    S.state.print = prev.print || { legendCompact:false, legendInclude:{} };
    S.state.selection=[];
    S.draw.all();
    buildSkuDock(); buildSkuManager(); buildLegendPanel();
    scheduleAutosave();
  };
  S.util.redo=()=>{
    if(!S.state.redo.length) return;
    const cur=JSON.stringify({objects:S.state.objects,assignments:S.state.assignments,skuDB:S.state.skuDB,ui:S.state.ui,print:S.state.print});
    S.state.undo.push(cur);
    const nxt=JSON.parse(S.state.redo.pop());
    S.state.objects=nxt.objects||[];
    S.state.assignments=nxt.assignments||{};
    S.state.skuDB=(nxt.skuDB||[]).map(s=>({
      sku:s.sku||s.SKU||s.Code||'',
      name:s.name||s.Name||s.Description||'',
      active: s.active!==false,
      category:s.category||'',
      tags:s.tags||[]
    }));
    S.state.ui = nxt.ui || { hideOffSkus:false, skuDockCollapsed:false, skuDockShowAll:false };
    S.state.print = nxt.print || { legendCompact:false, legendInclude:{} };
    S.state.selection=[];
    S.draw.all();
    buildSkuDock(); buildSkuManager(); buildLegendPanel();
    scheduleAutosave();
  };

  // IO
  S.io.save=()=>{
    const data=JSON.stringify({
      objects:S.state.objects,
      assignments:S.state.assignments,
      skuDB:S.state.skuDB,
      ui:S.state.ui,
      print:S.state.print
    },null,2);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    a.download='sanwa_floorplan.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  S.io.load=()=>{
    const inp=document.createElement('input');
    inp.type='file'; inp.accept='.json,application/json';
    inp.onchange=()=>{
      const f=inp.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{
        try{
          const j=JSON.parse(r.result);
          S.state.objects=(j.objects||[])
            .map(o=>o.type==='halfpallet'?{...o,type:'pallet'}:o)
            .map(o=>{
              if (['rack','bin','fixture','pallet','special','zone','workzone'].includes(o.type)
                  && o.labelSize == null) o.labelSize = 14;
              o.skuQty = o.skuQty || {};
              return o;
            });
          S.state.assignments=j.assignments||{};
          S.state.skuDB=(j.skuDB||[]).map(s=>({
            sku:s.sku||s.SKU||s.Code||'',
            name:s.name||s.Name||s.Description||'',
            active: s.active!==false,
            category:s.category||'',
            tags:s.tags||[]
          }));
          S.state.ui = j.ui || { hideOffSkus:false, skuDockCollapsed:false, skuDockShowAll:false };
          S.state.print = j.print || { legendCompact:false, legendInclude:{} };
          S.draw.all();
          buildSkuDock(); buildSkuManager(); buildLegendPanel();
          S.util.toast('Layout loaded','success');
          scheduleAutosave();
        }catch(e){
          console.error(e);
          S.util.toast('Invalid JSON','error');
        }
      };
      r.readAsText(f);
    };
    inp.click();
  };
  S.io.new=()=>{
    if(!confirm('Start a new plan? Unsaved changes will be lost.')) return;
    S.util.pushUndo();
    S.state.objects=[];
    S.state.selection=[];
    S.state.assignments={};
    S.state.skuDB=[];
    S.state.ui = { hideOffSkus:false, skuDockCollapsed:false, skuDockShowAll:false };
    S.state.print = { legendCompact:false, legendInclude:{} };
    S.state.panX=0; S.state.panY=0; S.state.zoom=1;
    S.draw.all();
    buildSkuDock(); buildSkuManager(); buildLegendPanel();
    S.util.toast('New plan','success');
    scheduleAutosave();
  };

  // ---------- CSV Import (sticky mapping) ----------
  function parseCSV(text){
    const rows=[]; let row=[]; let cell=''; let i=0; let inQ=false;
    while(i<text.length){
      const ch=text[i];
      if (inQ){
        if (ch === '"'){
          if (text[i+1] === '"'){ cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += ch; i++; continue;
      } else {
        if (ch === '"'){ inQ = true; i++; continue; }
        if (ch === ','){ row.push(cell); cell=''; i++; continue; }
        if (ch === '\n' || ch === '\r'){
          if (ch === '\r' && text[i+1] === '\n') i++;
          row.push(cell); rows.push(row); cell=''; row=[]; i++; continue;
        }
        cell += ch; i++; continue;
      }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function rowsToHeaderAndObjects(rows){
    if (!rows || !rows.length) return { header:[], list:[] };
    const header = rows[0].map(h => (h || '').trim());
    const list = [];
    for (let r=1; r<rows.length; r++){
      const row = rows[r];
      if (!row || row.every(v => (v||'').trim()==='')) continue;
      const obj = {};
      for (let c=0; c<header.length; c++){
        obj[header[c]] = (row[c] ?? '').trim();
      }
      list.push(obj);
    }
    return { header, list };
  }
  function saveStickyCsvMap(mapObj){
    try{ localStorage.setItem(LS_CSV_MAP, JSON.stringify(mapObj)); }catch(e){}
  }
  function loadStickyCsvMap(){
    try{ return JSON.parse(localStorage.getItem(LS_CSV_MAP) || 'null'); }catch(e){ return null; }
  }
  function pickHeaderKey(headerList, candidates){
    const lower = headerList.map(h=>String(h||'').toLowerCase());
    for(const k of candidates){
      const idx = lower.indexOf(String(k).toLowerCase());
      if (idx>=0) return headerList[idx];
    }
    return '';
  }
  function extractSkuRecord(rec, headerList){
    const sticky = loadStickyCsvMap();
    let skuKey  = sticky?.skuKey  || pickHeaderKey(headerList, DEFAULT_SKU_KEYS);
    let nameKey = sticky?.nameKey || pickHeaderKey(headerList, DEFAULT_NAME_KEYS);
    let catKey  = sticky?.catKey  || pickHeaderKey(headerList, DEFAULT_CAT_KEYS);
    let tagKey  = sticky?.tagKey  || pickHeaderKey(headerList, DEFAULT_TAG_KEYS);

    const grab = (k)=> k && rec[k]!=null ? String(rec[k]).trim() : '';

    let sku  = grab(skuKey);
    let name = grab(nameKey);
    let category = grab(catKey);
    let tagsRaw  = grab(tagKey);

    if (!sku){
      for (const [k,v] of Object.entries(rec)){
        if (DEFAULT_SKU_KEYS.map(x=>x.toLowerCase()).includes(String(k).toLowerCase()) && v){ sku = String(v).trim(); break; }
      }
    }
    if (!name){
      for (const [k,v] of Object.entries(rec)){
        if (DEFAULT_NAME_KEYS.map(x=>x.toLowerCase()).includes(String(k).toLowerCase()) && v){ name = String(v).trim(); break; }
      }
    }
    const tags = tagsRaw
      ? tagsRaw.split(/[;,]/).map(t=>t.trim()).filter(Boolean)
      : [];

    return { sku, name, category, tags };
  }
  function styleBtn(btn, ghost=false){
    Object.assign(btn.style,{
      padding:'8px 10px',
      borderRadius:'8px',
      cursor:'pointer',
      border:ghost?'1px solid #d1d5db':'0',
      background:ghost?'transparent':'#0ea5e9',
      color: ghost ? '#e5e7eb' : '#001018',
      font:'13px/1.2 system-ui'
    });
  }
  function askCsvMapping(header, onDone){
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {position:'fixed',inset:'0',background:'rgba(0,0,0,.5)',display:'grid',placeItems:'center',zIndex:'9999'});
    const card = document.createElement('div');
    Object.assign(card.style, {background:'#0b1220', color:'#e5e7eb', padding:'16px', borderRadius:'12px', width:'min(520px, 92vw)', boxShadow:'0 12px 30px rgba(0,0,0,.45)', font:'14px/1.3 system-ui'});
    card.innerHTML = `<div style="font-weight:700; font-size:16px; margin-bottom:8px;">Map CSV Headers</div>
    <div style="font-size:12px; opacity:.8; margin-bottom:12px;">Choose which columns map to Code, Name, Category, and Tags. Your choices will be remembered.</div>`;
    const row = (label)=>{
      const r = document.createElement('div'); r.className='row';
      r.style.display='flex'; r.style.gap='8px'; r.style.margin='6px 0'; r.style.alignItems='center';
      const l = document.createElement('label'); l.textContent=label; l.style.width='120px';
      const s = document.createElement('select'); s.style.flex='1'; s.style.padding='6px'; s.style.borderRadius='8px'; s.style.border='1px solid #283044'; s.style.background='#0f172a'; s.style.color='#e5e7eb';
      header.forEach(h=>{ const o=document.createElement('option'); o.value=h; o.textContent=h||'(blank)'; s.appendChild(o); });
      r.append(l,s); return {r, s};
    };
    const rSku=row('Code (SKU)'), rName=row('Name/Desc'), rCat=row('Category'), rTag=row('Tags');
    card.append(rSku.r, rName.r, rCat.r, rTag.r);
    const actions = document.createElement('div');
    actions.style.display='flex'; actions.style.justifyContent='space-between'; actions.style.marginTop='12px';
    const remember = document.createElement('label');
    remember.innerHTML = `<input id="rememberMapChk" type="checkbox" checked/> Remember`; remember.style.fontSize='12px';
    const btns = document.createElement('div'); btns.style.display='flex'; btns.style.gap='8px';
    const ok=document.createElement('button'); ok.textContent='OK'; styleBtn(ok);
    const cancel=document.createElement('button'); cancel.textContent='Cancel'; styleBtn(cancel,true);
    btns.append(cancel, ok); actions.append(remember, btns); card.append(actions);
    wrap.append(card); document.body.appendChild(wrap);

    const pick = (sel, candidates)=>{ const i = header.findIndex(h=>candidates.map(x=>x.toLowerCase()).includes(String(h).toLowerCase())); if(i>=0) sel.selectedIndex=i; };
    pick(rSku.s, DEFAULT_SKU_KEYS);
    pick(rName.s, DEFAULT_NAME_KEYS);
    pick(rCat.s, DEFAULT_CAT_KEYS);
    pick(rTag.s, DEFAULT_TAG_KEYS);

    cancel.onclick=()=>wrap.remove();
    ok.onclick=()=>{
      const map = { skuKey:rSku.s.value, nameKey:rName.s.value, catKey:rCat.s.value, tagKey:rTag.s.value };
      if (document.getElementById('rememberMapChk').checked) saveStickyCsvMap(map);
      wrap.remove(); onDone(map);
    };
  }

  S.io.importSKUsCSV = ()=>{
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv';
    inp.onchange = ()=>{
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = ()=>{
        try{
          const text = String(r.result || '');
          const rows = parseCSV(text);
          const { header, list } = rowsToHeaderAndObjects(rows);
          if (!header.length){ S.util.toast('CSV has no header','error'); return; }

          const sticky = loadStickyCsvMap();
          if (!sticky) askCsvMapping(header, ()=>{/* mapped for next time */});

          const existing = new Map((S.state.skuDB||[]).map(s=>[String(s.sku||'').toLowerCase(), s]));
          let added = 0, updated=0;
          for (const rec of list){
            const { sku, name, category, tags } = extractSkuRecord(rec, header);
            if (!sku) continue;
            const key = sku.toLowerCase();
            if (existing.has(key)){
              const ref = existing.get(key);
              if (name && !ref.name){ ref.name = name; updated++; }
              if (category) ref.category = category;
              if (tags && tags.length){
                const set = new Set([...(ref.tags||[]), ...tags]);
                ref.tags = Array.from(set);
              }
              ref.active = true;
            } else {
              S.state.skuDB.push({ sku, name, active:true, category:category||'', tags:tags||[] });
              existing.set(key, true);
              added++;
            }
          }
          buildSkuDock(); buildSkuManager(); buildLegendPanel();
          S.util.toast(`Imported ${added} new, ${updated} updated`, 'success');
          S.draw.all();
          scheduleAutosave();
        }catch(err){
          console.error(err);
          S.util.toast('CSV import failed', 'error');
        }
      };
      r.readAsText(f);
    };
    inp.click();
  };

  // Constructors
  S.api = {
    createRect(kind,x,y,w,h,color,layer){
      return {
        id:S.util.uuid(), type:kind, x,y,w,h, rot:0,
        layer, color, label:'', labelSize:14,
        skus:[], skuQty:{}
      };
    },
    createWall(x1,y1,x2,y2){ return { id:S.util.uuid(), type:'wall', layer:'Walls', x1,y1,x2,y2 }; },
    createDoor(x,y,w,angle){ return { id:S.util.uuid(), type:'door', layer:'Walls', x,y,w, angle:angle||0 }; },
    createLabel(x,y,text){ return { id:S.util.uuid(), type:'label', layer:'Annotations', x,y, text, size:14 }; },
    createMeasure(x1,y1,x2,y2){ return { id:S.util.uuid(), type:'measure', layer:'Annotations', x1,y1,x2,y2 }; }
  };

  // Drawing helpers
  function drawWall(ctx,o){
    ctx.save();
    ctx.strokeStyle=S.COL.wall; ctx.lineWidth=3/S.state.zoom;
    ctx.beginPath(); ctx.moveTo(o.x1,o.y1); ctx.lineTo(o.x2,o.y2); ctx.stroke();
    if (S.state.showWallDims){
      const len=(S.util.pxToFt(Math.hypot(o.x2-o.x1,o.y2-o.y1))).toFixed(2)+'ft';
      ctx.fillStyle = S.state.printMode ? '#111' : '#fff';
      ctx.font=`${12/S.state.zoom}px Inter`;
      ctx.fillText(len,(o.x1+o.x2)/2+5,(o.y1+o.y2)/2-5);
    }
    ctx.restore();
  }

  function drawDoor(ctx,o){
    ctx.save();
    ctx.strokeStyle=S.COL.door; ctx.lineWidth=2/S.state.zoom;
    ctx.translate(o.x,o.y); ctx.rotate(o.angle||0);
    ctx.beginPath(); ctx.arc(0,0,o.w,0,Math.PI/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(o.w,0); ctx.stroke();
    ctx.restore();
  }

  function drawLabel(ctx,o){
    if(!S.state.showLabels) return;
    if(!((S.state.layers['Annotations']||{}).visible)) return;
    ctx.save();
    ctx.fillStyle = (S.state.printMode ? '#111' : S.COL.label);
    ctx.font=`${o.size/S.state.zoom}px Inter`;
    ctx.fillText(o.text,o.x,o.y);
    ctx.restore();
  }

  function drawMeasure(ctx,o){
    ctx.save();
    ctx.strokeStyle='#fbbf24'; ctx.lineWidth=2/S.state.zoom;
    ctx.beginPath(); ctx.moveTo(o.x1,o.y1); ctx.lineTo(o.x2,o.y2); ctx.stroke();
    ctx.restore();
  }

  function drawRect(ctx,o){
    ctx.save();
    ctx.translate(o.x,o.y);
    ctx.rotate(o.rot||0);

    if (o.type==='pallet'){
      ctx.fillStyle=S.util.hexToRGBA(o.color||S.COL.pallet, 0.12); ctx.fillRect(0,0,o.w,o.h);
      ctx.strokeStyle=(o.color||S.COL.pallet); ctx.lineWidth=2/S.state.zoom; ctx.strokeRect(0,0,o.w,o.h);
      const plankCount=Math.max(3, Math.round((o.w)/(S.state.scale*0.4)));
      const gap=o.w/plankCount;
      ctx.strokeStyle='#d6b980'; ctx.lineWidth=3/S.state.zoom;
      for(let i=1;i<plankCount;i++){
        const x=i*gap; ctx.beginPath(); ctx.moveTo(x,2); ctx.lineTo(x,o.h-2); ctx.stroke();
      }
    }
    else if (o.type==='bin'){
      ctx.fillStyle=S.util.hexToRGBA(o.color||S.COL.bin, 0.22); ctx.fillRect(0,0,o.w,o.h);
      ctx.strokeStyle=(o.color||S.COL.bin); ctx.lineWidth=4/S.state.zoom; ctx.strokeRect(0,0,o.w,o.h);
    }
    else if (o.type==='fixture' || o.type==='rack' || o.type==='special'){
      ctx.fillStyle=S.util.hexToRGBA(o.color||S.COL.fixture, 0.20); ctx.fillRect(0,0,o.w,o.h);
      ctx.strokeStyle=(o.color||S.COL.fixture); ctx.lineWidth=3/S.state.zoom; ctx.strokeRect(0,0,o.w,o.h);
      const front=o.front||'N'; ctx.strokeStyle='#ffffffaa'; ctx.lineWidth=2/S.state.zoom;
      if (front==='N'){ ctx.beginPath(); ctx.moveTo(0,-8/S.state.zoom); ctx.lineTo(o.w,-8/S.state.zoom); ctx.stroke(); }
      if (front==='S'){ ctx.beginPath(); ctx.moveTo(0,o.h+8/S.state.zoom); ctx.lineTo(o.w,o.h+8/S.state.zoom); ctx.stroke(); }
      if (front==='W'){ ctx.beginPath(); ctx.moveTo(-8/S.state.zoom,0); ctx.lineTo(-8/S.state.zoom,o.h); ctx.stroke(); }
      if (front==='E'){ ctx.beginPath(); ctx.moveTo(o.w+8/S.state.zoom,0); ctx.lineTo(o.w+8/S.state.zoom,o.h); ctx.stroke(); }
    }
    else if (o.type==='zone' || o.type==='workzone'){
      const base=(o.type==='zone')? S.COL.zone : S.COL.workzone;
      ctx.fillStyle=S.util.hexToRGBA(o.color||base, 0.18); ctx.fillRect(0,0,o.w,o.h);
      ctx.strokeStyle=(o.color||base); ctx.lineWidth=2/S.state.zoom; ctx.strokeRect(0,0,o.w,o.h);
    }
    else {
      ctx.fillStyle=S.util.hexToRGBA(o.color||'#777', 0.2); ctx.fillRect(0,0,o.w,o.h);
      ctx.strokeStyle=(o.color||'#777'); ctx.lineWidth=2/S.state.zoom; ctx.strokeRect(0,0,o.w,o.h);
    }

    // Visible SKUs = respect "Hide Off"
    const visibleSkus = (o.skus||[]).filter(code=>{
      const rec=(S.state.skuDB||[]).find(r=>(r.sku||'').toLowerCase()===String(code).toLowerCase());
      return !S.state.ui.hideOffSkus || (rec ? rec.active!==false : true);
    });

    // Badge: count visible SKUs
    if (o.skus && o.skus.length){
      const anyVisible = visibleSkus.length>0;
      ctx.save();
      ctx.rotate(-(o.rot||0));
      ctx.fillStyle= anyVisible ? '#111827cc' : '#11182766';
      ctx.fillRect(o.w-30/S.state.zoom,2/S.state.zoom,28/S.state.zoom,16/S.state.zoom);
      ctx.fillStyle='#fff';
      ctx.font=`${10/S.state.zoom}px Inter`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(visibleSkus.length), o.w-16/S.state.zoom, 10/S.state.zoom);
      ctx.restore();
    }

    // Object label
    if (o.label && S.state.showLabels){
      ctx.save();
      ctx.rotate(-(o.rot||0));
      ctx.fillStyle = (S.state.printMode ? '#111' : '#fff');
      ctx.font = `${(o.labelSize || 14)/S.state.zoom}px Inter`;
      ctx.fillText(o.label, 6/S.state.zoom, 4/S.state.zoom);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawSelection(ctx,o){
    ctx.save();
    if (o.type==='wall' || o.type==='measure'){
      const r=6/S.state.zoom;
      ctx.strokeStyle=S.COL.select; ctx.lineWidth=2/S.state.zoom;
      ctx.beginPath(); ctx.moveTo(o.x1,o.y1); ctx.lineTo(o.x2,o.y2); ctx.stroke();

      ctx.fillStyle='#fff'; ctx.strokeStyle='#000';
      ctx.beginPath(); ctx.arc(o.x1,o.y1,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(o.x2,o.y2,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.restore();
      return;
    }
    if (o.type==='label'){
      const bb=S.util.labelBBox(o);
      ctx.strokeStyle=S.COL.select; ctx.lineWidth=2/S.state.zoom;
      ctx.strokeRect(o.x, o.y - bb.h + 4, bb.w, bb.h);
      ctx.restore();
      return;
    }
    ctx.translate(o.x,o.y); ctx.rotate(o.rot||0);
    ctx.strokeStyle=S.COL.select; ctx.lineWidth=2/S.state.zoom; ctx.strokeRect(0,0,o.w,o.h);
    const s=6/S.state.zoom, pts=[ [0,0],[o.w/2,0],[o.w,0],[0,o.h/2],[o.w,o.h/2],[0,o.h],[o.w/2,o.h],[o.w,o.h] ];
    ctx.fillStyle='#fff';
    for(const [hx,hy] of pts){
      ctx.fillRect(hx-s/2,hy-s/2,s,s);
      ctx.strokeStyle='#000'; ctx.strokeRect(hx-s/2,hy-s/2,s,s);
    }
    ctx.beginPath(); ctx.arc(o.w/2,-20/S.state.zoom,5/S.state.zoom,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Scene
  S.draw.resize=()=>{
    if(!S.els.wrapper || !S.els.canvas) return;
    const w=S.els.wrapper.clientWidth, h=S.els.wrapper.clientHeight;
    S.els.canvas.width=w; S.els.canvas.height=h;
  };

  S.draw.grid=()=>{
    if(!S.els.ctx) return;
    const {ctx}=S.els; const {zoom,panX,panY,scale,grid}=S.state;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,S.els.canvas.width,S.els.canvas.height);
    ctx.setTransform(zoom,0,0,zoom,panX,panY);

    if (grid){
      ctx.strokeStyle=S.COL.grid; ctx.lineWidth=1/zoom;
      const step=scale;
      const W=S.els.canvas.width, H=S.els.canvas.height;
      for(let x=-5000;x<W*2;x+=step){ ctx.beginPath(); ctx.moveTo(x,-5000); ctx.lineTo(x,H*2); ctx.stroke(); }
      for(let y=-5000;y<H*2;y+=step){ ctx.beginPath(); ctx.moveTo(-5000,y); ctx.lineTo(W*2,y); ctx.stroke(); }
    }

    S.els.ruler && (S.els.ruler.textContent =
      Math.floor(S.els.canvas.width/scale/zoom)+' x '+
      Math.floor(S.els.canvas.height/scale/zoom)+' ft');
  };

  S.draw.origin = ()=>{
    if(!S.state.showCenterMarker || !S.els.ctx) return;
    const c=S.els.ctx; const p=S.util.world2canvas(0,0);
    c.save(); c.setTransform(1,0,0,1,0,0); c.translate(p.x,p.y);
    c.strokeStyle='#60a5fa'; c.lineWidth=1.5;
    c.beginPath(); c.moveTo(-12,0); c.lineTo(12,0); c.stroke();
    c.beginPath(); c.moveTo(0,-12); c.lineTo(0,12); c.stroke();
    c.beginPath(); c.arc(0,0,6,0,Math.PI*2); c.stroke();
    c.restore();
  };

  S.draw.scene=()=>{
    S.draw.grid();
    if(!S.els.ctx) return;
    const {ctx}=S.els; const layers=S.state.layers;
    for (const o of S.state.objects){
      if(!(layers[o.layer]||{visible:true}).visible) continue;
      switch(o.type){
        case 'wall':    drawWall(ctx,o); break;
        case 'door':    drawDoor(ctx,o); break;
        case 'label':   drawLabel(ctx,o); break;
        case 'measure': drawMeasure(ctx,o); break;
        default:        drawRect(ctx,o);
      }
      if (S.state.selection.includes(o.id)) drawSelection(ctx,o);
    }
  };

  S.draw.all=()=>{ S.draw.scene(); S.draw.origin(); buildLayers(); buildContext(); buildValidation(); };

  // Panels
  function row(html){
    const d=document.createElement('div'); d.className='row'; d.innerHTML=html; return d;
  }
  function inputRow(label,value,cb){
    const w=document.createElement('div'); w.className='row';
    const l=document.createElement('label'); l.textContent=label;
    const i=document.createElement('input'); i.value=value;
    i.addEventListener('input',()=>{cb(i.value); S.draw.scene(); scheduleAutosave();});
    w.append(l,i); return w;
  }
  function inputRangeRow(label, value, min, max, step, oninput){
    const w=document.createElement('div'); w.className='row';
    const l=document.createElement('label'); l.textContent=label;
    const i=document.createElement('input'); i.type='range';
    i.min=min; i.max=max; i.step=step; i.value=value; i.style.width='100%';
    i.addEventListener('input', ()=>{ oninput(Number(i.value)); S.draw.scene(); scheduleAutosave(); });
    w.append(l,i); return w;
  }
  function inputColor(label,value,cb){
    const w=document.createElement('div'); w.className='row';
    const l=document.createElement('label'); l.textContent=label;
    const i=document.createElement('input'); i.type='color'; i.value=value||'#16a34a';
    i.oninput=()=>{ cb(i.value); S.draw.scene(); scheduleAutosave(); };
    w.append(l,i); return w;
  }

  function buildLayers(){
    const p=S.els.layersPanel; if(!p) return;
    p.innerHTML='<h4>Layers</h4>';
    for (const [name,cfg] of Object.entries(S.state.layers)){
      const row=document.createElement('div'); row.className='row';
      const vis=document.createElement('input'); vis.type='checkbox'; vis.checked=cfg.visible; vis.onchange=()=>{cfg.visible=vis.checked; S.draw.all(); scheduleAutosave();};
      const lock=document.createElement('input'); lock.type='checkbox'; lock.checked=cfg.locked; lock.onchange=()=>{cfg.locked=lock.checked;};
      row.append('👁 ',vis,' 🔒 ',lock, ' ', name); p.appendChild(row);
    }
  }

  // --------- PROPERTIES: Items table ----------
  function buildSkuTable(o,p){
    const wrap=document.createElement('div'); wrap.innerHTML='<strong>Items</strong>';
    const tbl=document.createElement('table');
    const head=document.createElement('tr');
    head.innerHTML='<th style="text-align:left">Item</th><th style="text-align:right">Actions</th>';
    tbl.appendChild(head);

    o.skus=o.skus||[];
    o.skuQty=o.skuQty||{};

    for (const sku of o.skus){
      const tr=document.createElement('tr');

      const rec=(S.state.skuDB||[]).find(s=>(s.sku||'').toLowerCase()===String(sku).toLowerCase());
      const inactive = rec ? (rec.active===false) : false;
      const name = rec && rec.name ? rec.name : '';

      const td1=document.createElement('td');
      td1.style.textAlign='left';
      const nameEl=document.createElement('div');
      nameEl.style.fontWeight='600';
      nameEl.textContent = name || '(No name)';
      const codeEl=document.createElement('div');
      codeEl.style.fontSize='11px';
      codeEl.style.opacity = '.8';
      codeEl.textContent = `Code: ${sku}`;

      if (inactive){
        nameEl.style.opacity = '.6';
        codeEl.style.opacity = '.6';
        const tag=document.createElement('span');
        tag.textContent=' (off)';
        tag.style.fontSize='11px';
        tag.style.opacity='.7';
        nameEl.appendChild(tag);
      }

      td1.append(nameEl, codeEl);

      const td2=document.createElement('td'); 
      td2.style.textAlign='right';
      const actions=document.createElement('div');
      actions.className='row';
      actions.style.justifyContent='flex-end';

      if (rec && inactive){
        const onBtn=document.createElement('button');
        onBtn.textContent='Turn On';
        onBtn.onclick=()=>{ rec.active = true; buildSkuDock(); buildContext(); buildLegendPanel(); S.util.toast(`SKU ${rec.sku} is ON`,'success'); scheduleAutosave(); };
        actions.appendChild(onBtn);
      }

      const del=document.createElement('button'); 
      del.textContent='Remove';
      del.title='Remove from this object';
      del.onclick=()=>{ 
        o.skus=o.skus.filter(s=>s!==sku); 
        delete o.skuQty[sku]; 
        S.draw.all(); 
        buildContext(); buildLegendPanel();
        scheduleAutosave();
      };
      actions.appendChild(del);
      td2.appendChild(actions);

      tr.append(td1,td2);
      tbl.appendChild(tr);
    }

    const add=document.createElement('div'); 
    add.className='row';
    const ai=document.createElement('input'); 
    ai.placeholder='Add by Code… (e.g., IN000007)';
    const ab=document.createElement('button'); 
    ab.textContent='Add';
    ab.onclick=()=>{
      const v=(ai.value||'').trim(); 
      if(!v) return;
      if(!o.skus.includes(v)) o.skus.push(v);
      o.skuQty[v]=1;
      ai.value=''; 
      S.draw.all();
      buildContext(); buildLegendPanel();
      scheduleAutosave();
    };
    add.append(ai,ab);

    wrap.append(tbl,add);
    p.appendChild(wrap);
  }

  function buildContext(){
    const p=S.els.contextPanel; if(!p){return;}
    p.innerHTML='<h4>Properties</h4>';

    if (S.state.selection.length===1){
      const o=S.state.objects.find(x=>x.id===S.state.selection[0]); if(!o) return;

      const typeRow=document.createElement('div'); typeRow.style.opacity='.8'; typeRow.textContent='Type: '+o.type; p.append(typeRow);

      if (o.type==='wall'){
        const lenFt = S.util.pxToFt(Math.hypot(o.x2-o.x1,o.y2-o.y1)).toFixed(2);
        p.append(
          inputRow('Length (ft)', lenFt, v=>{
            const Lft = Number(v);
            if (!isFinite(Lft) || Lft<=0) return;
            const Lpx = S.util.ftToPx(Lft);
            const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
            o.x2 = o.x1 + Math.cos(ang) * Lpx;
            o.y2 = o.y1 + Math.sin(ang) * Lpx;

            if (S.state.snapEnabled && S.state.snap>0){
              const fx1 = S.util.snapFt(S.util.pxToFt(o.x1));
              const fy1 = S.util.snapFt(S.util.pxToFt(o.y1));
              const fx2 = S.util.snapFt(S.util.pxToFt(o.x2));
              const fy2 = S.util.snapFt(S.util.pxToFt(o.y2));
              o.x1 = S.util.ftToPx(fx1); o.y1 = S.util.ftToPx(fy1);
              o.x2 = S.util.ftToPx(fx2); o.y2 = S.util.ftToPx(fy2);
            }
            S.draw.scene();
            scheduleAutosave();
          })
        );
      }

      else if (['rack','bin','fixture','pallet','special','zone','workzone'].includes(o.type)){
        if (o.labelSize == null) o.labelSize = 14;
        p.append(
          inputRow('Label', o.label||'', v=>o.label=v),
          inputRow('Width (ft)', S.util.pxToFt(o.w).toFixed(2), v=>o.w=S.util.ftToPx(Number(v)||0)),
          inputRow('Depth (ft)', S.util.pxToFt(o.h).toFixed(2), v=>o.h=S.util.ftToPx(Number(v)||0)),
          inputRangeRow('Label Size', o.labelSize||14, 6, 48, 1, v=>o.labelSize = v),
          inputColor('Color', o.color||'', v=>o.color=v)
        );
        p.append(
          inputRow('Rotation (deg)', ((o.rot||0)*180/Math.PI).toFixed(1),
            v=>{ o.rot = (Number(v)||0) * Math.PI/180; S.draw.scene(); scheduleAutosave(); })
        );
        if (['rack','fixture','special'].includes(o.type)){
          const fs=document.createElement('div'); fs.className='row'; fs.innerHTML='<label>Front</label>';
          const sel=document.createElement('select');
          ['N','E','S','W'].forEach(d=>{
            const op=document.createElement('option'); op.value=d; op.textContent=d;
            if((o.front||'N')===d) op.selected=true;
            sel.appendChild(op);
          });
          sel.onchange=()=>{o.front=sel.value; S.draw.scene(); scheduleAutosave();};
          fs.append(sel); p.append(fs);
        }
        buildSkuTable(o,p);
      }

      else if (o.type==='label'){
        p.append(
          inputRow('Text', o.text||'Label', v=>{o.text=v; scheduleAutosave();}),
          inputRow('Size', o.size||14, v=>{o.size=Number(v)||14; scheduleAutosave();})
        );
      }

      else if (o.type==='door'){
        p.append(
          inputRow('Width (ft)', S.util.pxToFt(o.w).toFixed(2), v=>{o.w=S.util.ftToPx(Number(v)||0); scheduleAutosave();}),
          inputRow('Angle (deg)', ((o.angle||0)*180/Math.PI).toFixed(1), v=>{o.angle=(Number(v)||0)*Math.PI/180; scheduleAutosave();})
        );
      }
    }
    else if (S.state.selection.length>1){
      p.append(row(S.state.selection.length+' objects selected'));
    }
    else {
      p.append(row('No selection'));
    }
  }

  // ===== Legend Data =====
  function buildLegendData(){
    const hideOff = !!S.state.ui.hideOffSkus;
    const includeMap = S.state.print.legendInclude || {};
    const selectionActive = Object.keys(includeMap).length > 0;

    const rowsByLabel = new Map(); // label -> { label, items:[{name, code}], type }
    for (const o of (S.state.objects||[])){
      if (!INCLUDE_TYPES_FOR_LEGEND.has(o.type)) continue;
      const label = (o.label||'').trim() || '(Unlabeled)';

      // Respect selection: if map is non-empty, include only checked labels
      if (selectionActive && !includeMap[label]) continue;

      const g = rowsByLabel.get(label) || { label, items: [], type:o.type };
      const skus = (o.skus||[]);
      for (const code of skus){
        const rec = (S.state.skuDB||[]).find(r => (r.sku||'').toLowerCase() === String(code).toLowerCase());
        if (hideOff && rec && rec.active===false) continue;
        const name = (rec && rec.name) ? rec.name : '';
        g.items.push({ name: name || '(No name)', code: String(code||'') });
      }
      rowsByLabel.set(label, g);
    }

    // sort A→Z by label; items by name/code
    const list = Array.from(rowsByLabel.values()).sort((a,b)=> a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:'base'}));
    for (const g of list){
      g.items.sort((a,b)=>{
        const an=(a.name||'').trim(), bn=(b.name||'').trim();
        if (an && bn){ return an.localeCompare(bn,undefined,{numeric:true,sensitivity:'base'}); }
        return a.code.localeCompare(b.code,undefined,{numeric:true,sensitivity:'base'});
      });
    }
    return list;
  }

  // ===== Legend Panel (with checkboxes + compact toggle) =====
  function ensureLegendPanelShell(){
    let panel = document.getElementById('legendPanel');
    if (!panel){
      panel = document.createElement('div');
      panel.id = 'legendPanel';
      panel.className = 'panel';
      (S.els.toolPanel || document.body).appendChild(panel);
    }
    return panel;
  }

  function buildLegendPanel(){
    const panel = ensureLegendPanelShell();
    panel.innerHTML = `
      <h4 style="display:flex;align-items:center;justify-content:space-between;">
        <span>Legend (Object | Item | Code)</span>
        <label style="font-weight:500;font-size:12px;display:flex;align-items:center;gap:6px;">
          <input id="legendCompactChk" type="checkbox"${S.state.print.legendCompact?' checked':''}/>
          Compact
        </label>
      </h4>
      <div id="legendControls" class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <button id="legendSelectAll">All</button>
        <button id="legendSelectNone">None</button>
        <span style="opacity:.7;font-size:12px">Toggle which labels print.</span>
      </div>
      <div id="legendList" style="display:flex;flex-direction:column;gap:10px;"></div>
    `;

    const data = buildLegendDataForPanel(); // includes ALL labels (ignores selection filter)
    const listEl = panel.querySelector('#legendList');

    // Render groups with checkbox (selection map can be empty = include all)
    listEl.innerHTML = '';
    data.forEach(g=>{
      const wrap = document.createElement('div');
      wrap.className='legend-group';
      wrap.style.border='1px solid #334155';
      wrap.style.borderRadius='10px';
      wrap.style.padding='6px 8px';

      const head = document.createElement('div');
      head.style.display='flex';
      head.style.alignItems='center';
      head.style.gap='8px';
      head.style.margin='0 0 6px 0';

      const cb = document.createElement('input');
      cb.type='checkbox';
      const selectedMap = S.state.print.legendInclude || {};
      const selectionActive = Object.keys(selectedMap).length>0;
      cb.checked = selectionActive ? !!selectedMap[g.label] : true;
      cb.onchange = ()=>{
        const map = S.state.print.legendInclude || {};
        if (cb.checked){
          map[g.label] = true;
        } else {
          delete map[g.label];
        }
        // If everything is checked, you can clear the map to mean "all"
        // But keeping explicit map is OK too.
        S.state.print.legendInclude = map;
        renderLegendForPrint(); // keep print view data in sync
        scheduleAutosave();
      };

      const title = document.createElement('div');
      title.className='legend-title';
      title.innerHTML = `<strong>${escapeHtml(g.label)}</strong> <span style="opacity:.7;font-size:12px;margin-left:6px">${g.type}</span>`;

      head.append(cb, title);
      wrap.append(head);

      // Rows preview inside panel
      if (!g.items.length){
        const none=document.createElement('div'); none.style.opacity='.7'; none.textContent='(No active items)';
        wrap.append(none);
      } else {
        g.items.slice(0,5).forEach(it=>{
          const r = document.createElement('div');
          r.className='legend-row';
          r.style.display='grid';
          r.style.gridTemplateColumns='1.2fr 2fr 1.1fr';
          r.style.gap='6px';
          r.style.fontSize='12px';
          r.innerHTML = `<div class="c-obj">${escapeHtml(g.label)}</div><div class="c-item">${escapeHtml(it.name)}</div><div class="c-code">${escapeHtml(it.code)}</div>`;
          wrap.append(r);
        });
        if (g.items.length>5){
          const more = document.createElement('div');
          more.style.opacity='.7'; more.style.fontSize='12px';
          more.textContent = `+${g.items.length-5} more… (see print)`;
          wrap.append(more);
        }
      }

      listEl.append(wrap);
    });

    // Controls
    panel.querySelector('#legendSelectAll').onclick = ()=>{
      const all = collectAllLabels();
      const map = {}; all.forEach(l=>map[l]=true);
      S.state.print.legendInclude = map;
      buildLegendPanel(); // re-render checkboxes
      renderLegendForPrint();
      scheduleAutosave();
    };
    panel.querySelector('#legendSelectNone').onclick = ()=>{
      S.state.print.legendInclude = {};
      buildLegendPanel();
      renderLegendForPrint();
      scheduleAutosave();
    };
    panel.querySelector('#legendCompactChk').onchange = (e)=>{
      S.state.print.legendCompact = !!e.target.checked;
      renderLegendForPrint();
      scheduleAutosave();
    };
  }

  // Helper: collect labels for All/None
  function collectAllLabels(){
    const set = new Set();
    for (const o of (S.state.objects||[])){
      if (!INCLUDE_TYPES_FOR_LEGEND.has(o.type)) continue;
      const label = (o.label||'').trim() || '(Unlabeled)';
      set.add(label);
    }
    return Array.from(set).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
  }

  // Build legend data for panel (always all labels so you can check/uncheck)
  function buildLegendDataForPanel(){
    const hideOff = !!S.state.ui.hideOffSkus;
    const map = new Map();
    for (const o of (S.state.objects||[])){
      if (!INCLUDE_TYPES_FOR_LEGEND.has(o.type)) continue;
      const label = (o.label||'').trim() || '(Unlabeled)';
      const g = map.get(label) || { label, items: [], type:o.type };
      const skus = (o.skus||[]);
      for (const code of skus){
        const rec = (S.state.skuDB||[]).find(r => (r.sku||'').toLowerCase() === String(code).toLowerCase());
        if (hideOff && rec && rec.active===false) continue;
        const name = (rec && rec.name) ? rec.name : '';
        g.items.push({ name: name || '(No name)', code: String(code||'') });
      }
      map.set(label, g);
    }
    const list = Array.from(map.values()).sort((a,b)=> a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:'base'}));
    for (const g of list){
      g.items.sort((a,b)=>{
        const an=(a.name||'').trim(), bn=(b.name||'').trim();
        if (an && bn){ return an.localeCompare(bn,undefined,{numeric:true,sensitivity:'base'}); }
        return a.code.localeCompare(b.code,undefined,{numeric:true,sensitivity:'base'});
      });
    }
    return list;
  }

  // ===== Print Legend (DOM for print window is created in print.js; here we only prepare data if needed) =====
  // (renderLegendForPrint is referenced by print.js too; safe to keep it)
  function ensurePrintLegendShell(){
    let holder = document.getElementById('printLegend');
    if (!holder){
      holder = document.createElement('div');
      holder.id = 'printLegend';
      document.body.appendChild(holder);
    }
    return holder;
  }
  function renderLegendForPrint(){
    // This function exists for parity with previous flow; actual print DOM is built in print.js.
    // No-op here but left in case other modules call it.
    ensurePrintLegendShell();
  }

  // Validation (adds label checks for legend keys)
  function buildValidation(){
    const p=S.els.validationPanel; if(!p) return;
    p.innerHTML='<h4>Validation</h4>';
    const v=S.state.validation;

    // compute missing/dupe labels over included types
    const seen = new Map(); // label -> ids
    const missing = [];
    const dupes = new Map(); // label -> [ids]

    for (const o of (S.state.objects||[])){
      if (!INCLUDE_TYPES_FOR_LEGEND.has(o.type)) continue;
      const label = (o.label||'').trim();
      if (!label){
        missing.push(o.id);
      } else {
        const arr = seen.get(label) || [];
        arr.push(o.id);
        seen.set(label, arr);
      }
    }
    for (const [label, ids] of seen.entries()){
      if (ids.length>1) dupes.set(label, ids);
    }

    const mk=(t,a)=>{ const d=document.createElement('div'); d.innerHTML=`<strong>${t}</strong>${a}`; return d; };
    p.append(mk('Missing Rack Labels: ', ` ${missing.length}`));
    if (missing.length){
      const ul=document.createElement('ul'); ul.style.margin='4px 0 8px 16px';
      for (const id of missing){
        const li=document.createElement('li'); li.textContent = id;
        li.style.cursor='pointer';
        li.onclick=()=>{ S.state.selection=[id]; S.draw.all(); };
        ul.appendChild(li);
      }
      p.appendChild(ul);
    }

    p.append(mk('Duplicate Labels: ', ` ${dupes.size}`));
    if (dupes.size){
      const ul=document.createElement('ul'); ul.style.margin='4px 0 8px 16px';
      for (const [label, ids] of dupes.entries()){
        const li=document.createElement('li');
        li.textContent = `${label} (${ids.length})`;
        li.style.cursor='pointer';
        li.onclick=()=>{ S.state.selection=[...ids]; S.draw.all(); };
        ul.appendChild(li);
      }
      p.appendChild(ul);
    }

    const mk2=(t,a)=>{ const d=document.createElement('div'); d.innerHTML=`<strong>${t} (${a.length})</strong>`; return d; };
    p.append(mk2('Unplaced SKUs', v.unplaced), mk2('Duplicate SKUs', v.duplicates), mk2('Overfilled Fixtures', v.overfill));
  }

  // ==== SKU Dock (right) — filters + Hide Off + COLLAPSE + 10-row preview ====
  function buildSkuDock(){
    const d=S.els.skuDock; if (!d) return;
    d.innerHTML='';

    // Header with collapse chevron
    const header=document.createElement('div');
    header.style.display='flex'; header.style.alignItems='center'; header.style.justifyContent='space-between';
    const hLeft=document.createElement('div');
    hLeft.innerHTML='<h4 style="margin:0">SKU Dock</h4>';
    const hRight=document.createElement('button'); hRight.textContent = S.state.ui.skuDockCollapsed ? '▸' : '▾';
    hRight.title = S.state.ui.skuDockCollapsed ? 'Expand' : 'Collapse';
    hRight.onclick=()=>{
      S.state.ui.skuDockCollapsed = !S.state.ui.skuDockCollapsed;
      buildSkuDock(); scheduleAutosave();
    };
    header.append(hLeft, hRight);
    d.append(header);

    if (S.state.ui.skuDockCollapsed){
      const hint=document.createElement('div'); hint.style.opacity='.7'; hint.style.fontSize='12px'; hint.textContent='(collapsed)';
      d.append(hint);
      return;
    }

    const filters=document.createElement('div'); filters.className='row';
    filters.style.flexWrap='wrap'; filters.style.gap='6px'; filters.style.margin='8px 0';

    const q=document.createElement('input'); q.placeholder='Search name or code...'; q.style.flex='1'; q.style.minWidth='160px';
    const cat=document.createElement('select'); cat.innerHTML='<option value="">All Categories</option>';
    const tag=document.createElement('input'); tag.placeholder='Filter tags (comma)...'; tag.style.minWidth='160px';
    const andOr=document.createElement('select'); andOr.innerHTML='<option value="OR">Tags OR</option><option value="AND">Tags AND</option>';
    const hideWrap=document.createElement('label'); hideWrap.style.display='flex'; hideWrap.style.alignItems='center'; hideWrap.style.gap='6px';
    const hide=document.createElement('input'); hide.type='checkbox'; hide.checked=!!S.state.ui.hideOffSkus; hideWrap.append(hide, document.createTextNode('Hide Off'));

    const cats = Array.from(new Set((S.state.skuDB||[]).map(s=>s.category||'').filter(Boolean))).sort();
    cats.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; cat.appendChild(o); });

    filters.append(q, cat, tag, andOr, hideWrap);
    d.append(filters);

    const topBar=document.createElement('div'); topBar.style.display='flex'; topBar.style.justifyContent='space-between'; topBar.style.marginBottom='6px';
    const count=document.createElement('div'); count.style.opacity='.75'; count.style.fontSize='12px';
    const previewBtn=document.createElement('button'); previewBtn.textContent = S.state.ui.skuDockShowAll ? 'Show 10' : 'Show all';
    previewBtn.onclick=()=>{
      S.state.ui.skuDockShowAll = !S.state.ui.skuDockShowAll;
      renderList();
      scheduleAutosave();
    };
    topBar.append(count, previewBtn);
    d.append(topBar);

    const listWrap=document.createElement('div');
    listWrap.style.maxHeight='calc(100vh - 320px)';
    listWrap.style.overflow='auto';
    const list=document.createElement('div');
    list.id='skuList';
    list.style.display='flex';
    list.style.flexDirection='column';
    list.style.gap='6px';
    listWrap.append(list);
    d.append(listWrap);

    function renderList(){
      const qv=(q.value||'').toLowerCase();
      const catv=cat.value||'';
      const tagv=(tag.value||'').split(/[;,]/).map(t=>t.trim().toLowerCase()).filter(Boolean);
      const mode=andOr.value||'OR';

      let items=(S.state.skuDB||[]).filter(s=> S.state.ui.hideOffSkus ? s.active!==false : true);

      if (qv){
        items = items.filter(s=>{
          const name = (s.name||'').toLowerCase();
          const code = (s.sku||'').toLowerCase();
          return name.includes(qv) || code.includes(qv);
        });
      }
      if (catv){
        items = items.filter(s=>(s.category||'')===catv);
      }
      if (tagv.length){
        items = items.filter(s=>{
          const have = new Set((s.tags||[]).map(t=>String(t).toLowerCase()));
          return mode==='AND' ? tagv.every(t=>have.has(t)) : tagv.some(t=>have.has(t));
        });
      }

      count.textContent = `Total: ${(S.state.skuDB||[]).length} • Showing: ${items.length}`;
      list.innerHTML='';

      const limited = S.state.ui.skuDockShowAll ? items : items.slice(0,10);

      for (const it of limited){
        const active = it.active!==false;
        const row=document.createElement('div'); row.className='row';
        row.style.justifyContent='space-between';
        row.style.border='1px solid #334155'; row.style.borderRadius='10px';
        row.style.padding='6px 8px';
        row.style.opacity = active ? '1' : '.55';

        row.draggable=active;
        row.addEventListener('dragstart',(e)=>{
          if (!active){ e.preventDefault(); return; }
          e.dataTransfer.setData('text/plain', JSON.stringify({sku:it.sku||''}));
        });

        const left=document.createElement('div');
        const tags = (it.tags||[]).map(t=>`<span style="border:1px solid #283044;border-radius:999px;padding:1px 6px;font-size:11px;margin-right:4px;">${t}</span>`).join(' ');
        left.innerHTML = `
          <div style="font-weight:600">${(it.name||'').trim() || '(No name)'} — ${it.sku||''}</div>
          <div style="font-size:11px;opacity:.8">${it.category? it.category : 'Uncategorized'}${tags ? ' · '+tags : ''}</div>
        `;

        const right=document.createElement('div'); right.className='row';

        const toggle=document.createElement('button');
        toggle.textContent = active ? 'Turn Off' : 'Turn On';
        toggle.onclick=()=>{ it.active = !active; renderList(); buildSkuManager(); buildLegendPanel(); S.util.toast(`SKU ${it.sku} is ${it.active?'ON':'OFF'}`,'success'); scheduleAutosave(); };

        const remove=document.createElement('button'); remove.textContent='Remove';
        remove.onclick=()=>{
          if (!confirm(`Remove ${it.sku} from dock? (Placements on objects remain)`)) return;
          S.state.skuDB = (S.state.skuDB||[]).filter(x=> (x.sku||'') !== (it.sku||''));
          renderList(); buildSkuManager(); buildLegendPanel(); S.util.toast('Item removed','success'); scheduleAutosave();
        };

        right.append(toggle, remove);
        row.append(left, right);
        list.append(row);
      }
    }

    hide.onchange=()=>{ S.state.ui.hideOffSkus = hide.checked; renderList(); buildLegendPanel(); scheduleAutosave(); };
    [q,cat,tag,andOr].forEach(x=>{
      x.addEventListener('input', renderList);
      x.addEventListener('change', renderList);
    });
    renderList();
  }

  // ==== SKU Manager (left tools) ====
  function buildSkuManager(){
    const tp = S.els.toolPanel;
    if (!tp) return;

    let panel = document.getElementById('skuManagerPanel');
    if (!panel){
      panel = document.createElement('div');
      panel.id = 'skuManagerPanel';
      panel.className = 'panel';
      tp.append(panel);
    }
    panel.innerHTML = `
      <h4>SKU Manager</h4>
      <div class="row" style="gap:8px; align-items:flex-end; flex-wrap:wrap">
        <div style="display:flex; flex-direction:column; gap:6px; flex:1 1 160px;">
          <label>Code (SKU)</label>
          <input id="skuAdd_sku" placeholder="e.g. IN000007" />
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; flex:2 1 220px;">
          <label>Name (Description)</label>
          <input id="skuAdd_name" placeholder="e.g. Bean Long" />
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; flex:1 1 160px;">
          <label>Category</label>
          <input id="skuAdd_cat" placeholder="e.g. Leafy Greens" />
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; flex:2 1 240px;">
          <label>Tags (comma/semicolon)</label>
          <input id="skuAdd_tags" placeholder="e.g. organic; local; florida" />
        </div>
        <button id="skuAdd_btn">Add</button>
      </div>

      <hr/>

      <div style="display:flex; flex-direction:column; gap:6px;">
        <label>Bulk Add (one per line; "Code, Name" or just "Code")</label>
        <textarea id="skuBulk_txt" rows="5" placeholder="IN000001, Widget A&#10;IN000002, Widget B&#10;IN000003"></textarea>
        <div class="row" style="justify-content:space-between;">
          <button id="skuBulk_add">Add Lines</button>
          <button id="skuBulk_clear" title="Clear all SKUs from dock">Clear All</button>
        </div>
      </div>

      <hr/>

      <div class="row" style="justify-content:space-between;">
        <div style="opacity:.8">Current SKUs: <strong id="skuCount">0</strong></div>
        <div class="row" style="gap:6px;">
          <button id="skuImport_csv" title="Import a CSV of SKUs">Import CSV</button>
          <button id="skuSave_json" title="Saves layout + SKU list">Save Layout (JSON)</button>
        </div>
      </div>
    `;

    const el = id => panel.querySelector('#'+id);
    const updateCount = ()=>{ const n=(S.state.skuDB||[]).length; el('skuCount').textContent = n; };

    S.state.skuDB = S.state.skuDB || [];

    el('skuAdd_btn').onclick = ()=>{
      const sku = (el('skuAdd_sku').value || '').trim();
      const name = (el('skuAdd_name').value || '').trim();
      const cat  = (el('skuAdd_cat').value  || '').trim();
      const tags = (el('skuAdd_tags').value || '').split(/[;,]/).map(t=>t.trim()).filter(Boolean);
      if (!sku){ S.util.toast('Enter a Code (SKU)','error'); return; }
      const exists = S.state.skuDB.some(x=> (x.sku||'').toLowerCase() === sku.toLowerCase());
      if (!exists){
        S.state.skuDB.push({ sku, name, active:true, category:cat, tags });
        buildSkuDock(); buildLegendPanel();
        S.util.toast(`Added ${sku}`,'success');
        scheduleAutosave();
      } else {
        S.util.toast('SKU already exists; set to ON','info');
        const ref = S.state.skuDB.find(x=>(x.sku||'').toLowerCase()===sku.toLowerCase());
        ref.active = true;
        if (name && !ref.name) ref.name = name;
        if (cat) ref.category = cat;
        if (tags.length){
          const set = new Set([...(ref.tags||[]), ...tags]);
          ref.tags = Array.from(set);
        }
        buildSkuDock(); buildLegendPanel();
        scheduleAutosave();
      }
      el('skuAdd_sku').value=''; el('skuAdd_name').value=''; el('skuAdd_cat').value=''; el('skuAdd_tags').value='';
      updateCount();
    };

    el('skuBulk_add').onclick = ()=>{
      const txt = (el('skuBulk_txt').value||'').split(/\r?\n/);
      let added = 0;
      const have = new Set((S.state.skuDB||[]).map(x=>(x.sku||'').toLowerCase()));
      for (const line of txt){
        const raw = line.trim();
        if (!raw) continue;
        let sku='', name='';
        const m = raw.split(',');
        sku = (m[0]||'').trim();
        name = (m.slice(1).join(',')||'').trim();
        if (!sku) continue;
        const key = sku.toLowerCase();
        if (!have.has(key)){
          S.state.skuDB.push({sku,name,active:true, category:'', tags:[]});
          have.add(key);
          added++;
        }
      }
      buildSkuDock(); buildLegendPanel();
      updateCount();
      S.util.toast(`Added ${added} item(s)`,'success');
      scheduleAutosave();
    };

    el('skuBulk_clear').onclick = ()=>{
      if (!confirm('Clear all SKUs from the dock? (Placements on objects remain)')) return;
      S.state.skuDB = [];
      buildSkuDock(); buildLegendPanel();
      updateCount();
      S.util.toast('SKU list cleared','success');
      scheduleAutosave();
    };

    el('skuImport_csv').onclick = ()=> S.io.importSKUsCSV();
    el('skuSave_json').onclick = ()=> S.io.save();

    updateCount();
  }

  // ====== INIT ======
  S.draw.resize();
  window.addEventListener('resize', ()=>{S.draw.resize(); S.draw.all();});
  buildSkuDock();
  buildSkuManager();
  buildLegendPanel();
  offerRestore();

  // Diagnostics
  S.els.diag = document.getElementById('diagnosticsPanel');
  function logDiag(msg){
    if (!S.els.diag) return;
    const d=document.createElement('div'); d.style.fontSize='12px'; d.style.margin='4px 0'; d.textContent=msg; S.els.diag.appendChild(d);
  }
  window.addEventListener('error', (e)=>{
    const m = (e && e.message) ? e.message : 'Unknown script error';
    logDiag('Error: '+m);
    const t=document.createElement('div');
    t.style.position='fixed'; t.style.left='12px'; t.style.bottom='12px';
    t.style.background='#7f1d1d'; t.style.color='#fff';
    t.style.padding='8px 10px'; t.style.borderRadius='10px';
    t.style.zIndex='9999'; t.textContent='JS Error: '+m;
    document.body.appendChild(t); setTimeout(()=>t.remove(), 6000);
  });

  function diagnostics(){
    if (!S.els.diag) return;
    S.els.diag.innerHTML = '<h4>Diagnostics</h4>';
    try {
      logDiag('Canvas: '+(S.els.canvas ? 'ok' : 'missing'));
      logDiag('Tools panel: '+(S.els.toolPanel ? 'ok' : 'missing'));
      logDiag('SKU Dock: '+(S.els.skuDock ? 'ok' : 'missing'));
      S.draw.all();
      logDiag('Draw pipeline: ok');
    } catch (err) {
      logDiag('Draw pipeline error: '+err.message);
    }
  }
  diagnostics();

  // Escaper
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }

  // Expose (optional)
  S.build.legendPanel = buildLegendPanel;

  window.SANWA = S;
})();
