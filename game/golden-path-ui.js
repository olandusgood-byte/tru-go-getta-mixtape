(() => {
  const $ = id => document.getElementById(id);
  function render(){
    const box=$('goldenPathList'), meta=$('goldenPathProgress');
    const path=window.TGGCodexPath; if(!box||!path)return;
    const p=path.progress();
    if(meta) meta.textContent=`${p.done}/${p.total} COMPLETE • ${p.percent}%`;
    box.innerHTML=path.steps.map((step,i)=>{
      const done=path.state.completed.includes(step.id);
      const active=!done && i===p.done;
      return `<div class="golden-step ${done?'done':''} ${active?'current':''}"><div class="golden-step-num">${done?'✓':i+1}</div><div class="golden-step-copy"><b>${step.name}</b><span>${step.description}</span></div><em>${done?'COMPLETE':active?'NEXT':'LOCKED'}</em></div>`;
    }).join('');
  }
  function open(){window.TGGCodexPath?.start?.();render();window.TGGGame?.show?.('goldenPathBoard');}
  $('goldenPathBtn')?.addEventListener('click',open);
  $('goldenPathBack')?.addEventListener('click',()=>window.TGGGame?.show?.('game'));
  window.TGGCodexPathUI={render,open};
  document.addEventListener('DOMContentLoaded',render);
})();
