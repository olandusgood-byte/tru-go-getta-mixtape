(() => {
  function boot(){
    const root=document.getElementById('navHud');
    const label=document.getElementById('navLabel');
    const distance=document.getElementById('navDistance');
    const arrow=document.getElementById('navArrow');
    if(!root||!label||!distance||!arrow)return;

    function toWorld(s){return {x:((Number(s?.x)||50)-50)*.92,z:((Number(s?.y)||50)-50)*.92};}
    function targetFor(s){
      const worldTarget=window.TGGWorldGameplay?.getNavTarget?.(s);
      if(worldTarget)return worldTarget;
      if(s?.accepted)return {label:'MISSION',x:(72-50)*.92,z:(36-50)*.92,color:'#ff466d'};
      const p=toWorld(s);
      const ds=window.TGG3D?.destinations||[];
      let best=null,bestDist=Infinity;
      ds.forEach(d=>{
        const dd=Math.hypot(p.x-d.x,p.z-d.z);
        if(dd<bestDist){bestDist=dd;best=d;}
      });
      return best?{label:best.label,x:best.x,z:best.z,color:'#c7ff00'}:null;
    }

    function update(){
      const s=window.TGGGame?.getState?.();
      const t=targetFor(s);
      if(!s||!t){root.classList.remove('active');requestAnimationFrame(update);return;}
      const p=toWorld(s);
      const dx=t.x-p.x,dz=t.z-p.z;
      const meters=Math.max(0,Math.round(Math.hypot(dx,dz)*3.2));
      const bearing=Math.atan2(dz,dx)*180/Math.PI;
      const heading=Number(s.heading)||0;
      const relative=((bearing-heading+540)%360)-180;
      label.textContent=t.label;
      distance.textContent=meters<4?'ARRIVED':meters+' m';
      arrow.style.transform='rotate('+relative+'deg)';
      root.style.setProperty('--nav-color',t.color);
      root.classList.add('active');
      requestAnimationFrame(update);
    }
    update();
    window.TGGNavigation={update};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();