(() => {
  function boot(){
    const root=document.getElementById('navHud');
    const label=document.getElementById('navLabel');
    const distance=document.getElementById('navDistance');
    const arrow=document.getElementById('navArrow');
    if(!root||!label||!distance||!arrow)return;

    function toWorld(s){return {x:((Number(s?.x)||50)-50)*.92,z:((Number(s?.y)||50)-50)*.92};}
    function targetFor(s){
      const story=window.TGGStoryMissions?.navigationTarget?.();
      if(story){
        const p=toWorld(story);
        return {
          label:story.label||'STORY OBJECTIVE',
          x:p.x,z:p.z,
          color:story.color||'#c7ff00',
          radius:Number(story.radius)||7,
          story:true,
          arrived:!!story.arrived
        };
      }
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

    function getTarget(){
      const s=window.TGGGame?.getState?.();
      const t=targetFor(s);
      if(!s||!t)return null;
      const p=toWorld(s);
      const dx=t.x-p.x,dz=t.z-p.z;
      const worldDistance=Math.hypot(dx,dz);
      return {...t,dx,dz,worldDistance,meters:Math.max(0,Math.round(worldDistance*3.2))};
    }

    function update(){
      const s=window.TGGGame?.getState?.();
      const t=getTarget();
      if(!s||!t){root.classList.remove('active');requestAnimationFrame(update);return;}
      const bearing=Math.atan2(t.dz,t.dx)*180/Math.PI;
      const heading=Number(s.heading)||0;
      const relative=((bearing-heading+540)%360)-180;
      label.textContent=t.label;
      distance.textContent=(t.arrived||t.meters<4)?'ARRIVED':t.meters+' m';
      arrow.style.transform='rotate('+relative+'deg)';
      root.style.setProperty('--nav-color',t.color);
      root.classList.toggle('story-active',!!t.story);
      root.classList.add('active');
      requestAnimationFrame(update);
    }
    update();
    window.TGGNavigation={update,getTarget,targetFor,toWorld};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();