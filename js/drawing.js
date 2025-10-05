(function(){
  const S=window.SANWA; const $=S.$;
  const cvs=S.els.canvas, ctx=S.els.ctx, wrap=S.els.wrapper;

  let mode='idle', draft=null, marquee=null;

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function getById(id){ return S.state.objects.find(o=>o.id===id); }

  function localHit(o,x,y){
    const dx=x-o.x, dy=y-o.y, c=Math.cos(-(o.rot||0)), s=Math.sin(-(o.rot||0));
    const rx=dx*c-dy*s, ry=dx*s+dy*c;
    return (rx>=0&&ry>=0&&rx<=o.w&&ry<=o.h);
  }

  function pick(x,y){
    const arr=[...S.state.objects].reverse();
    for (const o of arr){
      const layer=S.state.layers[o.layer]||{visible:true,selectable:true};
      if(!layer.visible) continue;
      if (o.type==='wall'||o.type==='measure'){ // line proximity
        const x1=o.x1,y1=o.y1,x2=o.x2,y2=o.y2;
        const A=x-x1,B=y-y1,C=x2-x1,D=y2-y1;
        const dot=A*C+B*D, len=C*C+D*D, t=Math.max(0,Math.min(1,dot/len));
        const xx=x1+C*t, yy=y1+D*t;
        const dist=Math.hypot(x-xx,y-yy);
        if (dist<=6/S.state.zoom) return o;
      } else if (o.type==='door'){
        if (Math.hypot(x-o.x,y-o.y)<=o.w+8) return o;
      } else if (o.type==='label'){
        const bb=S.util.labelBBox(o);
        const left=o.x, top=o.y - bb.h + 4, right=left+bb.w, bottom=o.y;
        if (x>=left && x<=right && y>=top && y<=bottom) return o;
      } else {
        if (localHit(o,x,y)) return o;
      }
    }
    return null;
  }

  function world2local(o,x,y){
    const dx=x-o.x, dy=y-o.y, c=Math.cos(-(o.rot||0)), s=Math.sin(-(o.rot||0));
    return {x:dx*c-dy*s, y:dx*s+dy*c};
  }

  function whichHandle(o,rx,ry){
    const s=8/S.state.zoom;
    const pts=[ ['nw',0,0],['n',o.w/2,0],['ne',o.w,0],['w',0,o.h/2],['e',o.w,o.h/2],['sw',0,o.h],['s',o.w/2,o.h],['se',o.w,o.h] ];
    for (const [name,hx,hy] of pts){ if (Math.abs(rx-hx)<=s && Math.abs(ry-hy)<=s) return name; }
    const dx=rx-o.w/2, dy=ry+20/S.state.zoom;
    if (Math.hypot(dx,dy)<8/S.state.zoom) return 'rotate';
    return null;
  }

  function whichHandleWall(o,x,y){
    const r=8/S.state.zoom;
    const d1=Math.hypot(x-o.x1,y-o.y1), d2=Math.hypot(x-o.x2,y-o.y2);
    if (d1<=r) return 'p1';
    if (d2<=r) return 'p2';
    return null;
  }

  // MOUSE DOWN
  wrap.addEventListener('mousedown',(e)=>{
    if (e.button===1){ startPan(e); return; }
    const cpt=S.util.eventToCanvas(e), pt=S.util.canvas2world(cpt.x,cpt.y);

    if (S.state.tool==='select'){
      const hit=pick(pt.x,pt.y);
      if (hit){
        const layer=(S.state.layers[hit.layer]||{});
        if (layer.locked){ S.state.selection=[hit.id]; S.draw.all(); return; }

        if (!S.state.selection.includes(hit.id)) S.state.selection=[hit.id];

        if (hit.type==='wall' || hit.type==='measure'){
          const h=whichHandleWall(hit, pt.x, pt.y);
          if (h==='p1'){
            mode='line-end1'; draft={id:hit.id, start:pt, startObj:clone(hit)};
          } else if (h==='p2'){
            mode='line-end2'; draft={id:hit.id, start:pt, startObj:clone(hit)};
          } else {
            mode='line-move'; draft={id:hit.id, start:pt, startObj:clone(hit)};
          }
        } else {
          const o=hit, loc=world2local(o, pt.x, pt.y), h=whichHandle(o,loc.x,loc.y);
          if (h==='rotate'){
            const cx=o.x+o.w/2, cy=o.y+o.h/2;
            mode='rotating';
            draft={id:o.id,start:pt,startRot:(o.rot||0),startAng:Math.atan2(pt.y-cy,pt.x-cx)};
          } else if (h){
            mode='resizing';
            draft={id:o.id,handle:h,start:pt,startObj:clone(o)};
          } else {
            // === GROUP-DRAG: capture originals for the whole selection
            mode = 'dragging';
            const groupIds = S.state.selection.slice();
            const groupStart = {};
            for (const id of groupIds){
              const ob = getById(id);
              if (!ob) continue;
              if (ob.type === 'wall' || ob.type === 'measure'){
                groupStart[id] = { x1: ob.x1, y1: ob.y1, x2: ob.x2, y2: ob.y2 };
              } else {
                groupStart[id] = { x: ob.x, y: ob.y };
              }
            }
            draft = { id: o.id, start: pt, startObj: clone(o), group: groupIds, groupStart };
          }
        }
      } else {
        marquee={x1:pt.x,y1:pt.y,x2:pt.x,y2:pt.y};
        mode='marquee';
        S.draw.all();
      }
      return;
    }

    // DRAW MODES
    if (S.state.tool==='wall'){
      // Snap starting point if snap is ON
      let x1 = pt.x, y1 = pt.y;
      if (S.state.snapEnabled && S.state.snap>0){
        x1 = S.util.ftToPx(S.util.snapFt(S.util.pxToFt(x1)));
        y1 = S.util.ftToPx(S.util.snapFt(S.util.pxToFt(y1)));
      }
      mode='drawing'; draft={type:'wall', x1, y1, x2:x1, y2:y1};
      return;
    }
    if (S.state.tool==='door'){ mode='drawing'; draft={type:'door', x:pt.x, y:pt.y, w:0, angle:0}; return; }
    if (S.state.tool==='label'){ mode='placingLabel'; draft={type:'label', x:pt.x, y:pt.y, text:'Label', size:14}; return; }
    if (['rack','bin','fixture','pallet','special','zone','workzone'].includes(S.state.tool)){
      mode='drawing'; draft={type:S.state.tool, x:pt.x, y:pt.y, w:0, h:0}; return;
    }
  });

  // MOUSE MOVE
  wrap.addEventListener('mousemove',(e)=>{
    const cpt=S.util.eventToCanvas(e), pt=S.util.canvas2world(cpt.x,cpt.y);

    if (mode==='marquee'&&marquee){
      marquee.x2=pt.x; marquee.y2=pt.y; preview(); return;
    }

    // === GROUP DRAG (fixed) ===
    if (mode==='dragging'&&draft){
      const primary = getById(draft.id);
      if (!primary) return;

      // Locked layers don't move
      const layer = S.state.layers[primary.layer] || {};
      if (layer.locked) return;

     // Raw delta
     let dx = pt.x - draft.start.x;
     let dy = pt.y - draft.start.y;

     if (S.state.snapEnabled && S.state.snap > 0) {
       const snap = S.state.snap;
      const scale = S.state.scale;

     // Convert original position + delta to feet, snap that, then back to px
     dx = S.util.ftToPx(
       S.util.snapFt(S.util.pxToFt(draft.startObj.x + dx)) -
       S.util.pxToFt(draft.startObj.x)
     );
     dy = S.util.ftToPx(
       S.util.snapFt(S.util.pxToFt(draft.startObj.y + dy)) -
       S.util.pxToFt(draft.startObj.y)
     );
   }
      const groupIds = draft.group && draft.group.length ? draft.group : [primary.id];
      for (const id of groupIds){
        const ob = getById(id);
        if (!ob) continue;
        const L = S.state.layers[ob.layer] || {};
        if (L.locked) continue;

        const start = (draft.groupStart && draft.groupStart[id]) || {};
        if (ob.type === 'wall' || ob.type === 'measure'){
          ob.x1 = start.x1 + dx; ob.y1 = start.y1 + dy;
          ob.x2 = start.x2 + dx; ob.y2 = start.y2 + dy;
        } else {
          ob.x = start.x + dx; ob.y = start.y + dy;
        }
      }

      S.draw.all(); return;
    }

    if (mode==='resizing'&&draft){
      const o=getById(draft.id); if(!o) return; if ((S.state.layers[o.layer]||{}).locked) return;
      const s=draft.startObj; const loc=world2local(s, pt.x, pt.y);
      let nx=s.x, ny=s.y, nw=s.w, nh=s.h; const h=draft.handle;
      if (h.includes('n')){ nh=s.h - loc.y; ny=s.y + loc.y; }
      if (h.includes('s')){ nh=loc.y; }
      if (h.includes('w')){ nw=s.w - loc.x; nx=s.x + loc.x; }
      if (h.includes('e')){ nw=loc.x; }
      if (S.state.snapEnabled && S.state.snap>0){
        nx=S.util.ftToPx(S.util.snapFt(S.util.pxToFt(nx)));
        ny=S.util.ftToPx(S.util.snapFt(S.util.pxToFt(ny)));
        nw=S.util.ftToPx(S.util.snapFt(S.util.pxToFt(nw)));
        nh=S.util.ftToPx(S.util.snapFt(S.util.pxToFt(nh)));
      }
      o.x=nx; o.y=ny; o.w=Math.max(10,nw); o.h=Math.max(10,nh);
      S.draw.all(); return;
    }

    if (mode==='rotating'&&draft){
      const o=getById(draft.id); if(!o) return; if ((S.state.layers[o.layer]||{}).locked) return;
      const cx=o.x+o.w/2, cy=o.y+o.h/2;
      const ang=Math.atan2(pt.y-cy, pt.x-cx);
      let rot=draft.startRot + (ang - draft.startAng);
      if (S.state.rotateSnap){ const step=Math.PI/4; rot=Math.round(rot/step)*step; }
      o.rot=rot; S.draw.all(); return;
    }

    // === Walls: snap while editing endpoints ===
    if (mode==='line-end1'&&draft){
      const o=getById(draft.id); if (!o) return;
      if (S.state.snapEnabled && S.state.snap>0){
        const fx = S.util.snapFt(S.util.pxToFt(pt.x));
        const fy = S.util.snapFt(S.util.pxToFt(pt.y));
        o.x1 = S.util.ftToPx(fx); o.y1 = S.util.ftToPx(fy);
      } else { o.x1=pt.x; o.y1=pt.y; }
      S.draw.all(); return;
    }
    if (mode==='line-end2'&&draft){
      const o=getById(draft.id); if (!o) return;
      if (S.state.snapEnabled && S.state.snap>0){
        const fx = S.util.snapFt(S.util.pxToFt(pt.x));
        const fy = S.util.snapFt(S.util.pxToFt(pt.y));
        o.x2 = S.util.ftToPx(fx); o.y2 = S.util.ftToPx(fy);
      } else { o.x2=pt.x; o.y2=pt.y; }
      S.draw.all(); return;
    }
    if (mode==='line-move'&&draft){
      const o=getById(draft.id); if (!o) return;
      const dx=pt.x-draft.start.x, dy=pt.y-draft.start.y;
      let nx1 = draft.startObj.x1 + dx, ny1 = draft.startObj.y1 + dy;
      let nx2 = draft.startObj.x2 + dx, ny2 = draft.startObj.y2 + dy;
      // snap both endpoints while moving
      if (S.state.snapEnabled && S.state.snap>0){
        const fx1 = S.util.snapFt(S.util.pxToFt(nx1));
        const fy1 = S.util.snapFt(S.util.pxToFt(ny1));
        const fx2 = S.util.snapFt(S.util.pxToFt(nx2));
        const fy2 = S.util.snapFt(S.util.pxToFt(ny2));
        nx1 = S.util.ftToPx(fx1); ny1 = S.util.ftToPx(fy1);
        nx2 = S.util.ftToPx(fx2); ny2 = S.util.ftToPx(fy2);
      }
      o.x1=nx1; o.y1=ny1; o.x2=nx2; o.y2=ny2;
      S.draw.all(); return;
    }

    if (mode==='placingLabel'&&draft){ draft.x=pt.x; draft.y=pt.y; preview(); return; }

    if (mode==='drawing'&&draft){
      if (S.state.snapEnabled && S.state.snap>0){
        const fx=S.util.snapFt(S.util.pxToFt(pt.x)), fy=S.util.snapFt(S.util.pxToFt(pt.y));
        pt.x=S.util.ftToPx(fx); pt.y=S.util.ftToPx(fy);
      }
      if (draft.type==='wall'||draft.type==='measure'){
        draft.x2=pt.x; draft.y2=pt.y; preview(); return;
      }
      if (draft.type==='door'){
        draft.w=Math.hypot(pt.x-draft.x, pt.y-draft.y);
        draft.angle=Math.atan2(pt.y-draft.y, pt.x-draft.x);
        preview(); return;
      }
      draft.w=pt.x-draft.x; draft.h=pt.y-draft.y; preview(); return;
    }
  });

  // MOUSE UP
  window.addEventListener('mouseup',()=>{
    if (mode==='marquee'&&marquee){
      const x=min(marquee.x1,marquee.x2), y=min(marquee.y1,marquee.y2),
            w=Math.abs(marquee.x2-marquee.x1), h=Math.abs(marquee.y2-marquee.y1);
      const sel=[];
      for (const o of S.state.objects){
        const L=S.state.layers[o.layer]||{}; if(!L.visible) continue;
        if (o.type==='wall'||o.type==='measure'){
          if (lineRect(o,x,y,w,h)) sel.push(o.id);
        } else {
          if (rectRect(o,x,y,w,h)) sel.push(o.id);
        }
      }
      S.state.selection=sel; marquee=null; mode='idle'; S.draw.all(); return;
    }

    if (mode==='placingLabel'&&draft){
      if (S.state.snapEnabled && S.state.snap>0){
        const fx=S.util.snapFt(S.util.pxToFt(draft.x)), fy=S.util.snapFt(S.util.pxToFt(draft.y));
        draft.x=S.util.ftToPx(fx); draft.y=S.util.ftToPx(fy);
      }
      S.util.pushUndo();
      const o=S.api.createLabel(draft.x,draft.y,draft.text||'Label');
      o.size=draft.size||14;
      S.state.objects.push(o);
      mode='idle'; draft=null; S.draw.all(); return;
    }

    if (['dragging','resizing','rotating','line-end1','line-end2','line-move'].includes(mode)){
      S.util.pushUndo(); mode='idle'; draft=null; return;
    }

    if (mode==='drawing'&&draft){
      if (draft.type==='wall'){
        S.util.pushUndo();
        S.state.objects.push(S.api.createWall(draft.x1,draft.y1,draft.x2,draft.y2));
      } else if (draft.type==='door'){
        S.util.pushUndo();
        S.state.objects.push(S.api.createDoor(draft.x,draft.y,draft.w,draft.angle));
      } else if (draft.type==='measure'){
        S.util.pushUndo();
        S.state.objects.push(S.api.createMeasure(draft.x1||draft.x,draft.y1||draft.y,draft.x2||draft.x+1,draft.y2||draft.y+1));
      } else {
        let x=draft.x,y=draft.y,w=draft.w,h=draft.h;
        if (w<0){x+=w; w=-w}
        if (h<0){y+=h; h=-h}
        const layer=(draft.type==='zone'||draft.type==='workzone')?'Zones':'Fixtures';
        const color=(draft.type==='zone')?S.COL.zone:(draft.type==='workzone')?S.COL.workzone:null;
        S.util.pushUndo();
        S.state.objects.push(S.api.createRect(draft.type,x,y,w,h,color,layer));
      }
      mode='idle'; draft=null; S.draw.all(); return;
    }

    mode='idle'; draft=null;
  });

  // PANNING & ZOOM
  function startPan(e){
    const a=S.util.eventToCanvas(e);
    const anchor={dx:a.x - S.state.panX, dy:a.y - S.state.panY};
    const mm=(ev)=>{
      const c=S.util.eventToCanvas(ev);
      S.state.panX = c.x - anchor.dx;
      S.state.panY = c.y - anchor.dy;
      S.draw.all();
    };
    const up=()=>{
      window.removeEventListener('mousemove',mm);
      window.removeEventListener('mouseup',up);
    };
    window.addEventListener('mousemove',mm);
    window.addEventListener('mouseup',up);
  }

  wrap.addEventListener('wheel',(e)=>{
    e.preventDefault();
    const factor=e.deltaY<0?1.1:0.9;
    const c=S.util.eventToCanvas(e);
    S.state.zoom*=factor;
    S.state.panX = c.x - factor*(c.x - S.state.panX);
    S.state.panY = c.y - factor*(c.y - S.state.panY);
    S.draw.all();
  }, {passive:false});

  // PREVIEW OVERLAY
  function preview(){
    S.draw.all();
    if (marquee){
      const c=ctx;
      const x=min(marquee.x1,marquee.x2), y=min(marquee.y1,marquee.y2),
            w=Math.abs(marquee.x2-marquee.x1), h=Math.abs(marquee.y2-marquee.y1);
      c.save();
      c.strokeStyle='#60a5fa';
      c.setLineDash([6,4]);
      c.lineWidth=1/S.state.zoom;
      c.strokeRect(x,y,w,h);
      c.restore();
    }
    if(draft){
      const c=ctx; c.save();
      if (draft.type==='wall'){
        c.strokeStyle='#e5e7eb';
        c.lineWidth=2/S.state.zoom;
        c.beginPath(); c.moveTo(draft.x1,draft.y1); c.lineTo(draft.x2,draft.y2); c.stroke();
      } else if (draft.type==='door'){
        c.strokeStyle='#22d3ee'; c.lineWidth=2/S.state.zoom;
        c.translate(draft.x,draft.y); c.rotate(draft.angle||0);
        c.beginPath(); c.arc(0,0,draft.w,0,Math.PI/2); c.stroke();
        c.beginPath(); c.moveTo(0,0); c.lineTo(draft.w,0); c.stroke();
      } else if (draft.type==='measure'){
        c.strokeStyle='#fbbf24'; c.lineWidth=2/S.state.zoom;
        c.beginPath(); c.moveTo(draft.x1,draft.y1); c.lineTo(draft.x2,draft.y2); c.stroke();
      } else if (draft.type==='label'){
        c.fillStyle='#e5e7eb';
        c.font = `${(draft.size||14)/S.state.zoom}px Inter`;
        c.fillText(draft.text || 'Label', draft.x, draft.y);
      } else if (typeof draft.x === 'number'){
        c.fillStyle='rgba(255,255,255,.08)';
        c.strokeStyle='#e5e7eb';
        c.fillRect(draft.x,draft.y,draft.w,draft.h);
        c.strokeRect(draft.x,draft.y,draft.w,draft.h);
      }
      c.restore();
    }
  }

  // GEOM HELPERS
  function min(a,b){ return (a<b)?a:b; }
  function rectRect(o,x,y,w,h){
    const r1={x:o.x,y:o.y,w:o.w,h:o.h}, r2={x,y,w,h};
    return !(r2.x>r1.x+r1.w || r2.x+r2.w<r1.x || r2.y>r1.y+r1.h || r2.y+r2.h<r1.y);
  }
  function lineRect(o,x,y,w,h){
    const inside=(px,py)=>px>=x&&px<=x+w&&py>=y&&py<=y+h;
    if(inside(o.x1,o.y1)||inside(o.x2,o.y2)) return true;
    const seg=(x1,y1,x2,y2)=>segmentsIntersect(o.x1,o.y1,o.x2,o.y2,x1,y1,x2,y2);
    return seg(x,y,x+w,y)||seg(x+w,y,x+w,y+h)||seg(x+w,y+h,x,y+h)||seg(x,y+h,x,y);
  }
  function segmentsIntersect(x1,y1,x2,y2,x3,y3,x4,y4){
    function ccw(ax,ay,bx,by,cx,cy){ return (cy-ay)*(bx-ax)>(by-ay)*(cx-ax); }
    return (ccw(x1,y1,x3,y3,x4,y4)!=ccw(x2,y2,x3,y3,x4,y4)) && (ccw(x1,y1,x2,y2,x3,y3)!=ccw(x1,y1,x2,y2,x4,y4));
  }

  // DRAG & DROP SKU ASSIGN
  wrap.addEventListener('dragover', e=>{ e.preventDefault(); });
  wrap.addEventListener('drop', e=>{
    e.preventDefault();
    const cpt=S.util.eventToCanvas(e), pt=S.util.canvas2world(cpt.x,cpt.y);
    const o=(function(){
      const arr=[...S.state.objects].reverse();
      for (const obj of arr){
        if (!['rack','fixture','bin','pallet','special'].includes(obj.type)) continue;
        if (!(S.state.layers[obj.layer]||{visible:true}).visible) continue;
        if (localHit(obj,pt.x,pt.y)) return obj;
      }
      return null;
    })();
    if (!o) return;
    try{
      const data=JSON.parse(e.dataTransfer.getData('text/plain')||'{}');
      if(!data.sku) return;
      o.skus=o.skus||[]; o.skuQty=o.skuQty||{};
      if(!o.skus.includes(data.sku)) o.skus.push(data.sku);
      o.skuQty[data.sku]=o.skuQty[data.sku]||1;
      S.state.assignments[data.sku]=o.id;
      S.util.toast('Assigned SKU '+data.sku,'success');
      S.draw.all();
    }catch(err){}
  });

  // KEYBOARD
  window.addEventListener('keydown',(e)=>{
    // Undo/Redo
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
      e.preventDefault();
      if(e.shiftKey) S.util.redo();
      else S.util.undo();
      return;
    }

    // Don't hijack while typing
    const t = e.target;
    const tag = (t && t.tagName) ? t.tagName.toUpperCase() : '';
    if (tag==='INPUT' || tag==='TEXTAREA' || (t && t.isContentEditable)) return;

    // Backspace: delete only labels
    if (e.key === 'Backspace'){
      const selIds = new Set(S.state.selection);
      if (!selIds.size) return;
      const hasLabel = S.state.objects.some(o => selIds.has(o.id) && o.type==='label');
      if (!hasLabel) return;
      e.preventDefault();
      S.util.pushUndo();
      S.state.objects = S.state.objects.filter(o => !(selIds.has(o.id) && o.type==='label'));
      S.state.selection = S.state.selection.filter(id=>{
        const o = S.state.objects.find(x=>x.id===id);
        return o && o.type!=='label' ? true : !!o;
      });
      S.draw.all();
      return;
    }

    // Delete: delete any selected object(s)
    if (e.key === 'Delete'){
      const sel = new Set(S.state.selection);
      if (!sel.size) return;
      e.preventDefault();
      S.util.pushUndo();
      S.state.objects = S.state.objects.filter(o => !sel.has(o.id));
      S.state.selection = [];
      S.draw.all();
      return;
    }
  });
})();
