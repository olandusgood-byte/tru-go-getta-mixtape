(() => {
  const THREE=window.THREE;
  const core=window.TGG3D;
  const story=window.TGGStoryMissions;
  if(!THREE||!core?.scene||!story)return;

  const scene=core.scene;
  const COLORS={
    manager:0xff466d,
    kane:0x7b86ff,
    director:0xc56cff,
    dj:0x48d7ff,
    objective:0xc7ff00
  };

  function toWorld(target){
    return {
      x:((Number(target?.x)||50)-50)*.92,
      z:((Number(target?.y)||50)-50)*.92
    };
  }

  function makeLabel(text,color='#c7ff00',small=false){
    const canvas=document.createElement('canvas');
    canvas.width=small?512:768;
    canvas.height=128;
    const ctx=canvas.getContext('2d');
    const draw=(value,tint=color)=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='rgba(3,5,10,.9)';
      ctx.strokeStyle=tint;
      ctx.lineWidth=5;
      ctx.beginPath();
      const w=canvas.width-16,h=canvas.height-16,r=24,x=8,y=8;
      ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
      ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff';
      ctx.font=(small?'900 31px':'900 34px')+' Arial, sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(String(value).slice(0,42),canvas.width/2,canvas.height/2);
      texture.needsUpdate=true;
    };
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});
    const sprite=new THREE.Sprite(material);
    sprite.scale.set(small?7.3:10.5,small?1.82:1.75,1);
    sprite.userData.draw=draw;
    draw(text,color);
    return sprite;
  }

  function makeContact({id,name,role,x,y,color,skin=0x9b694a}){
    const g=new THREE.Group();
    const world=toWorld({x,y});
    g.position.set(world.x,0,world.z);
    g.userData.storyContact=id;

    const bodyMat=new THREE.MeshStandardMaterial({color,roughness:.5,metalness:.18});
    const dark=new THREE.MeshStandardMaterial({color:0x0b0e14,roughness:.7,metalness:.2});
    const skinMat=new THREE.MeshStandardMaterial({color:skin,roughness:.72});
    const accent=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.9,roughness:.28,metalness:.35});

    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.64,1.42,5,10),bodyMat);
    torso.position.y=2.02;torso.castShadow=true;g.add(torso);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.52,18,14),skinMat);
    head.position.y=3.43;head.castShadow=true;g.add(head);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.54,18,8,0,Math.PI*2,0,Math.PI*.48),dark);
    hair.position.y=3.58;g.add(hair);

    [-.3,.3].forEach((dx,i)=>{
      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.98,4,8),dark);
      leg.position.set(dx,.8,0);leg.castShadow=true;g.add(leg);
      const shoe=new THREE.Mesh(new THREE.BoxGeometry(.42,.2,.68),dark);
      shoe.position.set(dx,.18,.12);g.add(shoe);
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.15,.88,4,8),bodyMat);
      arm.position.set(i? .82:-.82,2.08,0);arm.rotation.z=i?-.16:.16;arm.castShadow=true;g.add(arm);
    });

    const chain=new THREE.Mesh(new THREE.TorusGeometry(.27,.035,8,22),accent);
    chain.rotation.x=Math.PI/2;chain.position.set(0,2.35,.58);g.add(chain);

    const halo=new THREE.Mesh(
      new THREE.RingGeometry(1.28,1.5,36),
      new THREE.MeshBasicMaterial({color,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false})
    );
    halo.rotation.x=-Math.PI/2;halo.position.y=.05;g.add(halo);

    const marker=new THREE.Mesh(
      new THREE.OctahedronGeometry(.32),
      new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:3,metalness:.4,roughness:.2})
    );
    marker.position.y=4.65;g.add(marker);

    const label=makeLabel(name+' • '+role,'#'+new THREE.Color(color).getHexString(),true);
    label.position.y=5.65;g.add(label);

    const glow=new THREE.PointLight(color,1.2,8,2);
    glow.position.y=3;g.add(glow);

    scene.add(g);
    return {id,name,role,x,y,color,group:g,halo,marker,label,glow,baseY:0};
  }

  const contacts=[
    makeContact({id:'manager',name:'M',role:'MANAGER',x:72,y:36,color:COLORS.manager,skin:0x8d5b3f}),
    makeContact({id:'kane',name:'KANE',role:'PRODUCER',x:24,y:37,color:COLORS.kane,skin:0xa16f4f}),
    makeContact({id:'dj',name:'DJ V',role:'CITY DJ',x:76,y:63,color:COLORS.dj,skin:0x8f6045}),
    makeContact({id:'director',name:'DIRECTOR K',role:'MEDIA',x:50,y:89,color:COLORS.director,skin:0x7f513a})
  ];

  const beacon=new THREE.Group();
  beacon.visible=false;
  scene.add(beacon);

  const beaconRing=new THREE.Mesh(
    new THREE.RingGeometry(2.25,2.72,48),
    new THREE.MeshBasicMaterial({color:COLORS.objective,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false})
  );
  beaconRing.rotation.x=-Math.PI/2;beaconRing.position.y=.08;beacon.add(beaconRing);

  const beaconBeam=new THREE.Mesh(
    new THREE.CylinderGeometry(.72,1.4,9,20,1,true),
    new THREE.MeshBasicMaterial({color:COLORS.objective,transparent:true,opacity:.14,depthWrite:false,side:THREE.DoubleSide})
  );
  beaconBeam.position.y=4.55;beacon.add(beaconBeam);

  const beaconDiamond=new THREE.Mesh(
    new THREE.OctahedronGeometry(.52),
    new THREE.MeshStandardMaterial({color:COLORS.objective,emissive:COLORS.objective,emissiveIntensity:3.4,metalness:.5,roughness:.2})
  );
  beaconDiamond.position.y=3.15;beacon.add(beaconDiamond);

  const beaconLight=new THREE.PointLight(COLORS.objective,4.5,13,2);
  beaconLight.position.y=2.4;beacon.add(beaconLight);

  const beaconLabel=makeLabel('STORY OBJECTIVE','#c7ff00');
  beaconLabel.position.y=6.4;beacon.add(beaconLabel);

  const routeGeometry=new THREE.BufferGeometry();
  const routeLine=new THREE.Line(
    routeGeometry,
    new THREE.LineDashedMaterial({color:COLORS.objective,transparent:true,opacity:.62,dashSize:1.2,gapSize:.65})
  );
  routeLine.visible=false;
  scene.add(routeLine);

  let lastTargetId='';
  let currentTarget=null;
  let nearTarget=false;

  function targetColor(target){
    if(!target)return COLORS.objective;
    if(target.id==='manager-return')return COLORS.manager;
    if(target.id==='kane')return COLORS.kane;
    if(target.id==='dj-v')return COLORS.dj;
    if(target.id==='director')return COLORS.director;
    try{return new THREE.Color(target.color||'#c7ff00').getHex()}catch{return COLORS.objective}
  }

  function setBeaconTarget(target){
    currentTarget=target||null;
    if(!target){
      beacon.visible=false;
      routeLine.visible=false;
      return;
    }
    const w=toWorld(target);
    beacon.position.set(w.x,0,w.z);
    beacon.visible=true;
    routeLine.visible=true;
    const color=targetColor(target);
    [beaconRing.material,beaconBeam.material,beaconDiamond.material].forEach(m=>{
      m.color.setHex(color);
      if(m.emissive)m.emissive.setHex(color);
    });
    beaconLight.color.setHex(color);
    routeLine.material.color.setHex(color);
    if(target.id!==lastTargetId){
      beaconLabel.userData.draw?.(String(target.label||'STORY OBJECTIVE').replace(/^(?:CITY BUZZ|CITY TAKEOVER|APPOINTMENT) • /,''),'#'+new THREE.Color(color).getHexString());
      lastTargetId=target.id||'';
    }
  }

  function percentDistance(target){
    const s=window.TGGGame?.getState?.()||{x:50,y:50};
    return Math.hypot((Number(s.x)||50)-Number(target?.x||50),(Number(s.y)||50)-Number(target?.y||50));
  }

  function isNearTarget(target=currentTarget){
    if(!target)return false;
    return percentDistance(target)<=Number(target.radius||7);
  }

  function updateRoute(target){
    if(!target||!routeLine.visible)return;
    const s=window.TGGGame?.getState?.()||{x:50,y:50};
    const p=toWorld(s);
    const w=toWorld(target);
    routeGeometry.setFromPoints([
      new THREE.Vector3(p.x,.13,p.z),
      new THREE.Vector3(w.x,.13,w.z)
    ]);
    routeLine.computeLineDistances();
  }

  function activeContactId(){
    const st=story.status?.();
    const step=st?.current;
    if((Number(st?.chapter)||0)>=2&&st?.active&&step?.kind==='talk')return step.talk||'';
    const invite=window.TGGSocialSchedule?.activeInvite?.();
    if(!invite)return '';
    return invite.contact==='producer'?'kane':invite.contact;
  }

  function updateInteraction(){
    const st=story.status?.();
    const step=st?.current;
    const button=document.getElementById('interact3dBtn');
    const dialogue=document.getElementById('npcDialogue');
    const talk=(Number(st?.chapter)||0)>=2&&st?.active&&step?.kind==='talk';
    nearTarget=!!currentTarget&&isNearTarget(currentTarget);

    if(talk&&nearTarget){
      if(button){
        button.disabled=false;
        button.textContent='TALK TO '+(step.talk==='manager'?'M':step.talk==='kane'?'KANE':step.talk==='dj'?'DJ V':'DIRECTOR K');
        button.classList.add('nearby','story-contact-near');
      }
      if(dialogue){
        dialogue.textContent=step.talk==='manager'
          ?(st.chapter===3?'M: That city run was different. Finish strong.':'M: The city is watching. Let’s make the next move.')
          :step.talk==='kane'
            ?'Kane: You made it. Let’s cut something crazy.'
            :step.talk==='dj'
              ?'DJ V: I got the city tuned in. Give them a show.'
              :'Director K: Camera’s ready. Let’s turn the record into a visual.';
        dialogue.classList.add('show');
      }
    }else if(button){
      button.classList.remove('story-contact-near');
    }
  }

  const interact=document.getElementById('interact3dBtn');
  interact?.addEventListener('click',e=>{
    const st=story.status?.();
    if((Number(st?.chapter)||0)>=2&&st?.active&&st?.current?.kind==='talk'&&isNearTarget()){
      e.preventDefault();
      e.stopImmediatePropagation();
      story.doCurrent?.();
    }
  },true);

  const clock=new THREE.Clock();
  function animate(){
    requestAnimationFrame(animate);
    const dt=Math.min(.05,clock.getDelta());
    const t=clock.elapsedTime;
    const target=story.navigationTarget?.()||window.TGGSocialSchedule?.navigationTarget?.()||null;
    setBeaconTarget(target);
    updateRoute(target);

    const activeId=activeContactId();
    contacts.forEach((c,i)=>{
      const hot=activeId===c.id;
      c.group.position.y=c.baseY+Math.sin(t*1.8+i*.9)*.025;
      c.marker.rotation.y=t*1.6+i;
      c.marker.position.y=4.65+Math.sin(t*2.2+i)*.18;
      c.halo.rotation.z=t*.35*(i%2?1:-1);
      c.halo.material.opacity=hot?.86:.24;
      c.glow.intensity=hot?(4.5+Math.sin(t*3)*1.2):1.15;
      const scale=hot?1.08:1;
      c.group.scale.lerp(new THREE.Vector3(scale,scale,scale),Math.min(1,dt*5));
      c.label.material.opacity=hot?1:.72;
    });

    if(beacon.visible){
      const hot=isNearTarget(target);
      const pulse=1+Math.sin(t*3.4)*.1;
      beaconRing.scale.setScalar(hot?1.22:pulse);
      beaconRing.material.opacity=hot?.95:.62;
      beaconBeam.material.opacity=hot?.24:.11;
      beaconDiamond.rotation.y=t*1.7;
      beaconDiamond.position.y=3.15+Math.sin(t*2.8)*.25;
      beaconLight.intensity=hot?7:4.2+Math.sin(t*2.4);
    }
    updateInteraction();
  }
  animate();

  window.TGGStoryWorld3D={
    contacts,
    beacon,
    routeLine,
    toWorld,
    getActiveTarget:()=>currentTarget?{...currentTarget}:null,
    isNearTarget,
    getStatus:()=>({
      active:!!currentTarget,
      target:currentTarget?{...currentTarget}:null,
      near:nearTarget,
      activeContact:activeContactId(),
      contacts:contacts.map(c=>({id:c.id,name:c.name,role:c.role,x:c.x,y:c.y}))
    })
  };
})();