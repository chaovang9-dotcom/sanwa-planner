(function(){
  const S=window.SANWA;
  function btn(label, tool){ const b=document.createElement('button'); b.className='tool-btn'; b.textContent=label; b.onclick=()=>{ S.state.tool=tool; for(const x of b.parentElement.querySelectorAll('.tool-btn')) x.classList.remove('active'); b.classList.add('active'); }; return b; }
  function group(title, arr){ const g=document.createElement('div'); g.className='panel'; const h=document.createElement('div'); h.innerHTML='<strong>'+title+'</strong>'; g.append(h); const row=document.createElement('div'); arr.forEach(x=>row.append(x)); g.append(row); return g; }

  const P=S.els.toolPanel; P.innerHTML='';
  P.append(
    group('Select / Measure', [btn('Select','select'), btn('Measure','measure')]),
    group('Walls & Doors', [btn('Wall','wall'), btn('Door','door')]),
    group('Fixtures', [btn('Rack','rack'), btn('Bin','bin'), btn('Fixture','fixture'), btn('Pallet','pallet'), btn('Special','special')]),
    group('Zones', [btn('Zone','zone'), btn('Work Zone','workzone')]),
    group('Text', [btn('Label','label')])
  );
  // Activate Select by default
  const first = S.els.toolPanel.querySelector('.tool-btn');
  if (first) first.classList.add('active');
})();