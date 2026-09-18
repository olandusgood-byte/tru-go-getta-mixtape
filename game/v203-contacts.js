(() => {
  const CONTACTS=[
    {id:'m',name:'M',role:'MANAGER',mission:'flyer-run',color:0x7b86ff,existing:true},
    {id:'kane',name:'KANE',role:'PRODUCER',mission:'studio-session',color:0xff466d,x:-20,z:-11},
    {id:'dj-v',name:'DJ V',role:'DJ',mission:'mixtape-promo',color:0xc56cff,x:1,z:31}
  ];
  let originalInteract=null;
  let contactCard=null;
  let focusedContactId=null;
  const objects={};

  function toWorld(s){return {x:((Number(s?.x)||50)-50)*.92,z:((Number(s?.y)||50)-50)*.92}}
  function makeLabel(text,color){
    const THREE=window.THREE;
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=96;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='rgba(4,6,12,.86)';ctx.beginPath();ctx.roundRect(6,6,372,84,20);ctx.fill();
    ctx.strokeStyle='#'+new THREE.Color(color).getHexString();ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='900 27px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,48);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
    sprite.scale.set(6.3,1.58,1);return sprite;
  }
  function makeContact(c){
    const THREE=window.THREE,scene=window.TGG3D?.scene;if(!THREE||!scene)return null;
    if(c.existing){
      const obj=window.TGG3D?.npc;
      if(obj&&!obj.getObjectByName('tgg-contact-label')){
        const label=makeLabel(c.name+' • '+c.role,c.color);label.name='tgg-contact-label';label.position.set(0,6.2,0);obj.add(label);
      }
      return obj||null;
    }
    const g=new THREE.Group();
    const skin=new THREE.MeshStandardMaterial({color:0x8c5d40,roughness:.72});
    const cloth=new THREE.MeshStandardMaterial({color:c.color,metalness:.1,roughness:.55});
    const dark=new THREE.MeshStandardMaterial({color:0x11131a,roughness:.8});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.55,1.55,5,10),cloth);body.position.y=2.35;body.castShadow=true;
    const head=new THREE.Mesh(new THREE.SphereGeometry(.48,16,12),skin);head.position.y=3.9;head.castShadow=true;
    const legs=new THREE.Group();
    [-.28,.28].forEach(x=>{const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.2,.92,4,8),dark);leg.position.set(x,1.0,0);leg.castShadow=true;legs.add(leg)});
    g.add(body,head,legs);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.09,8,28),new THREE.MeshStandardMaterial({color:c.color,emissive:c.color,emissiveIntensity:2.2}));
    ring.rotation.x=Math.PI/2;ring.position.y=.08;g.add(ring);
    const label=makeLabel(c.name+' • '+c.role,c.color);label.position.y=5.6;g.add(label);
    g.position.set(c.x,0,c.z);g.userData.contactRing=ring;scene.add(g);return g;
  }
  function bootContacts(){
    if(!window.TGG3D?.scene||!window.THREE)return false;
    CONTACTS.forEach(c=>{if(!objects[c.id])objects[c.id]=makeContact(c)});
    return true;
  }
  function closest(){
    if(!bootContacts())return null;
    const s=window.TGGGame?.getState?.();if(!s)return null;
    const p=toWorld(s);let best=null,bestDist=Infinity;
    CONTACTS.forEach(c=>{
      const o=objects[c.id];if(!o)return;
      const d=Math.hypot(p.x-o.position.x,p.z-o.position.z);
      if(d<bestDist){best={...c,object:o,distance:d};bestDist=d}
    });
    return best;
  }
  function nearest(){
    if(window.TGGContent?.current?.())return null;
    const best=closest();
    return best&&best.distance<=6.6?best:null;
  }
  function focusNearest(){
    if(window.TGGContent?.current?.()){window.__tggToast?.('ACTIVE JOB — FOLLOW THE OBJECTIVE MARKER');return false;}
    const c=closest();if(!c)return false;
    focusedContactId=c.id;
    window.__tggToast?.('JOB NAV — GO SEE '+c.name+' • '+c.role);
    return true;
  }
  function getNavTarget(){
    if(window.TGGContent?.current?.())return null;
    const c=CONTACTS.find(x=>x.id===focusedContactId);
    const o=c?objects[c.id]:null;
    if(!c||!o)return null;
    return {label:'MEET '+c.name,x:o.position.x,z:o.position.z,color:'#7b86ff'};
  }
  function missionName(id){return window.TGGContent?.content?.missions?.find(m=>m.id===id)?.name||id}
  function startContact(contact=nearest()){
    if(!contact)return false;
    const ok=window.TGGContent?.start?.(contact.mission)===true;
    if(ok){
      focusedContactId=null;
      window.__tggToast?.(contact.name+' — JOB STARTED: '+missionName(contact.mission));
      window.TGGGame?.save?.(true);
      return true;
    }
    return false;
  }
  function installCard(){
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.07 BOOST';
    const city=document.querySelector('.city');if(!city||contactCard)return;
    contactCard=document.createElement('div');contactCard.className='street-contact-card';contactCard.id='streetContactCard';
    contactCard.innerHTML='<b id="scName">CONTACT</b><span id="scRole">ROLE</span><small id="scJob">INTERACT TO TALK</small>';
    city.appendChild(contactCard);
  }
  function wrapInteract(){
    if(!window.TGG3D||originalInteract)return;
    originalInteract=window.TGG3D.interactNearest?.bind(window.TGG3D);
    window.TGG3D.interactNearest=()=>{
      const c=nearest();
      if(c)return startContact(c);
      return originalInteract?.()??false;
    };
  }
  function tick(t=0){
    if(!bootContacts()){requestAnimationFrame(tick);return}
    wrapInteract();installCard();
    const c=window.TGGGame?.getActiveScreen?.()==='game'?nearest():null;
    const button=document.getElementById('interact3dBtn');
    contactCard?.classList.toggle('active',!!c);
    if(c){
      contactCard.style.setProperty('--contact','#'+new window.THREE.Color(c.color).getHexString());
      const n=document.getElementById('scName'),r=document.getElementById('scRole'),j=document.getElementById('scJob');
      if(n)n.textContent=c.name;if(r)r.textContent=c.role;if(j)j.textContent='F / INTERACT — START '+missionName(c.mission).toUpperCase();
      if(button){button.disabled=false;button.textContent='TALK TO '+c.name;button.classList.add('contact-ready')}
    }else button?.classList.remove('contact-ready');
    Object.values(objects).forEach(o=>{if(o?.userData?.contactRing)o.userData.contactRing.rotation.z=t*.0012});
    requestAnimationFrame(tick);
  }
  function status(){const c=nearest();return {ready:!!c,contact:c?.id||null,mission:c?.mission||null,distance:c?Number(c.distance.toFixed(2)):null}}
  window.TGGStreetContacts={contacts:CONTACTS,closest,nearest,focusNearest,getNavTarget,startContact,status};
  requestAnimationFrame(tick);
})();