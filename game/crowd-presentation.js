(() => {
  const THREE=window.THREE;
  const core=window.TGG3D;
  const street=window.TGGStreetPresence;
  if(!THREE||!core?.scene||!street)return;

  const scene=core.scene;
  const ACCENTS=[0xc7ff00,0x48d7ff,0xff466d,0xc56cff,0xffc857,0x58e0a5];
  const SKINS=[0x70462f,0x86583d,0x9c6948,0xb57b56,0xc88b65,0xd49a72];

  function makeFan(i=0){
    const g=new THREE.Group();
    const shirt=new THREE.MeshStandardMaterial({color:ACCENTS[i%ACCENTS.length],roughness:.6,metalness:.06});
    const dark=new THREE.MeshStandardMaterial({color:0x10141c,roughness:.78,metalness:.12});
    const skin=new THREE.MeshStandardMaterial({color:SKINS[i%SKINS.length],roughness:.78});
    const white=new THREE.MeshStandardMaterial({color:0xe8edf5,roughness:.62});

    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.46,.98,4,7),shirt);
    body.position.y=1.65;body.castShadow=true;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.36,12,9),skin);
    head.position.y=2.75;head.castShadow=true;g.add(head);

    const arms=[];
    [-1,1].forEach((side,idx)=>{
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.62,3,6),shirt);
      arm.position.set(side*.6,1.78,0);arm.castShadow=true;g.add(arm);arms.push(arm);
      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.72,3,6),dark);
      leg.position.set(side*.2,.68,0);leg.castShadow=true;g.add(leg);
      const shoe=new THREE.Mesh(new THREE.BoxGeometry(.26,.13,.45),i%2?white:dark);
      shoe.position.set(side*.2,.17,.11);g.add(shoe);
    });

    if(i%3===0){
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(.3,.34,.18,12),dark);
      cap.position.set(0,3.05,0);g.add(cap);
      const brim=new THREE.Mesh(new THREE.BoxGeometry(.36,.04,.24),dark);
      brim.position.set(0,2.98,.27);g.add(brim);
    }else if(i%3===1){
      const beanie=new THREE.Mesh(new THREE.SphereGeometry(.375,12,7,0,Math.PI*2,0,Math.PI*.48),shirt);
      beanie.position.y=2.9;g.add(beanie);
    }

    const phoneMat=new THREE.MeshStandardMaterial({color:0x121722,emissive:0x48d7ff,emissiveIntensity:2.1,roughness:.25});
    const phone=new THREE.Mesh(new THREE.BoxGeometry(.16,.29,.035),phoneMat);
    phone.visible=i%4===0;
    phone.position.set(.63,2.18,.18);
    phone.rotation.z=-.18;
    g.add(phone);

    g.userData.parts={body,head,arms,phone};
    g.userData.mode=phone.visible?'record':i%3===2?'cheer':'watch';
    g.userData.phase=i*.73;
    g.userData.seed=i*1.91;
    return g;
  }

  const clusters=[
    {id:'studio',label:'STUDIO ROW',x:-24,z:-12,points:[[-2.7,-1.4],[2.4,-1.1]]},
    {id:'downtown',label:'DOWNTOWN CYPHER',x:0,z:0,points:[[-3,-2.4],[-2.8,2.2],[2.8,-2.1],[3,2.4]]},
    {id:'stage',label:'MIXTAPE AVE',x:24,z:12,points:[[-3.3,-2.2],[-2.7,2.1],[2.8,-2],[3.3,2.4]]},
    {id:'media',label:'MEDIA DISTRICT',x:0,z:36,points:[[-2.4,-1.6],[2.5,-1.4]]}
  ];

  const fans=[];
  let fanIndex=0;
  clusters.forEach(cluster=>{
    cluster.fans=[];
    cluster.points.forEach(([dx,dz],localIndex)=>{
      const fan=makeFan(fanIndex++);
      fan.position.set(cluster.x+dx,0,cluster.z+dz);
      fan.userData.cluster=cluster.id;
      fan.userData.home={x:fan.position.x,z:fan.position.z};

      if(cluster.id==='stage'){
        fan.userData.mode=localIndex===1?'record':localIndex===0||localIndex===2?'cheer':'watch';
      }else if(cluster.id==='downtown'){
        fan.userData.mode=localIndex===1?'record':localIndex===0||localIndex===3?'cheer':'watch';
      }else if(cluster.id==='media'){
        fan.userData.mode=localIndex===0?'record':'watch';
      }else if(cluster.id==='studio'){
        fan.userData.mode=localIndex===1?'record':'watch';
      }
      if(fan.userData.parts?.phone)fan.userData.parts.phone.visible=fan.userData.mode==='record';

      scene.add(fan);
      cluster.fans.push(fan);
      fans.push(fan);
    });
  });

  function decorateStreetPeople(){
    let accessories=0,phones=0;
    const people=street.people||[];
    people.forEach((person,i)=>{
      if(!person||person.userData.v219Decorated)return;
      person.userData.v219Decorated=true;
      if(i%4===0){
        const mat=new THREE.MeshStandardMaterial({color:0x0e121a,roughness:.72});
        const cap=new THREE.Mesh(new THREE.CylinderGeometry(.23,.27,.15,10),mat);
        cap.position.set(0,3.13,0);person.add(cap);
        const brim=new THREE.Mesh(new THREE.BoxGeometry(.31,.035,.2),mat);
        brim.position.set(0,3.06,.22);person.add(brim);
        accessories+=2;
      }else if(i%4===1){
        const accent=new THREE.MeshStandardMaterial({color:ACCENTS[i%ACCENTS.length],metalness:.42,roughness:.3});
        const left=new THREE.Mesh(new THREE.TorusGeometry(.19,.045,7,14,Math.PI),accent);
        const right=left.clone();
        left.position.set(-.31,2.9,0);right.position.set(.31,2.9,0);
        left.rotation.z=Math.PI/2;right.rotation.z=-Math.PI/2;
        person.add(left,right);accessories+=2;
      }
      if(i%6===0){
        const mat=new THREE.MeshStandardMaterial({color:0x101722,emissive:0x6c9fff,emissiveIntensity:1.5});
        const phone=new THREE.Mesh(new THREE.BoxGeometry(.14,.25,.03),mat);
        phone.position.set(.58,2.08,.18);phone.rotation.z=-.15;
        person.add(phone);person.userData.v219Phone=phone;phones++;
      }
    });
    return {accessories,phones};
  }

  const decoration=decorateStreetPeople();
  let focus='free';
  let visibleFans=0,cheering=0,recording=0,watching=0;
  let reactionLevel=0;

  function playerWorld(){
    const s=window.TGGGame?.getState?.()||{x:50,y:55};
    return {x:((Number(s.x)||50)-50)*.92,z:((Number(s.y)||50)-50)*.92,state:s};
  }

  function storyFocus(){
    const t=window.TGGStoryMissions?.navigationTarget?.();
    const label=String(t?.label||'').toUpperCase();
    if(label.includes('STUDIO'))return 'studio';
    if(label.includes('DOWNTOWN')||label.includes('CYPHER'))return 'downtown';
    if(label.includes('MIXTAPE')||label.includes('STAGE'))return 'stage';
    if(label.includes('MEDIA')||label.includes('DIRECTOR'))return 'media';
    return '';
  }

  function currentFocus(){
    const life=window.TGGWorldLife?.getState?.()||{};
    if(life.battle?.active)return 'downtown';
    if(life.show?.active)return 'stage';
    return storyFocus()||'free';
  }

  function face(group,x,z,rate=.1){
    const desired=Math.atan2(x-group.position.x,z-group.position.z);
    let delta=((desired-group.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
    group.rotation.y+=delta*rate;
  }

  function visibleLimit(){
    const d=street.getDensity?.()||'HIGH';
    return d==='LOW'?4:d==='MEDIUM'?8:fans.length;
  }

  function animateFan(fan,dt,t,pw,activeFocus,index){
    const data=fan.userData;
    const parts=data.parts;
    const active=activeFocus!=='free'&&data.cluster===activeFocus;
    const dist=Math.hypot(pw.x-fan.position.x,pw.z-fan.position.z);
    const near=dist<9;
    if(active||near)face(fan,pw.x,pw.z,active?.12:.055);

    data.phase+=dt*(active?5.8:2.4);
    const pulse=Math.sin(data.phase);
    const mode=data.mode;

    if(mode==='record'){
      recording++;
      parts.phone.visible=true;
      parts.arms[1].rotation.x=THREE.MathUtils.lerp(parts.arms[1].rotation.x,-1.15,.18);
      parts.arms[1].rotation.z=THREE.MathUtils.lerp(parts.arms[1].rotation.z,-.12,.18);
      parts.head.rotation.x=THREE.MathUtils.lerp(parts.head.rotation.x,-.08,.1);
      fan.position.y=active?Math.abs(pulse)*.018:0;
    }else if(mode==='cheer'&&active){
      cheering++;
      parts.arms[0].rotation.x=-1.1+Math.sin(t*5+data.seed)*.18;
      parts.arms[1].rotation.x=-1.1+Math.cos(t*5.4+data.seed)*.18;
      parts.arms[0].rotation.z=.24;parts.arms[1].rotation.z=-.24;
      fan.position.y=Math.abs(Math.sin(t*4.2+data.seed))*.09;
    }else{
      watching++;
      parts.arms[0].rotation.x=THREE.MathUtils.lerp(parts.arms[0].rotation.x,pulse*.1,.08);
      parts.arms[1].rotation.x=THREE.MathUtils.lerp(parts.arms[1].rotation.x,-pulse*.1,.08);
      parts.arms[0].rotation.z=THREE.MathUtils.lerp(parts.arms[0].rotation.z,0,.1);
      parts.arms[1].rotation.z=THREE.MathUtils.lerp(parts.arms[1].rotation.z,0,.1);
      fan.position.y=Math.abs(Math.sin(t*1.7+data.seed))*.012;
    }

    if(active){
      parts.body.rotation.z=Math.sin(t*2.2+data.seed)*.025;
      reactionLevel=Math.max(reactionLevel,1);
    }else{
      parts.body.rotation.z=THREE.MathUtils.lerp(parts.body.rotation.z,0,.08);
    }
  }

  function animateDecoratedPeople(t,pw){
    (street.people||[]).forEach((person,i)=>{
      if(!person?.visible)return;
      const dist=Math.hypot(pw.x-person.position.x,pw.z-person.position.z);
      if(dist<6&&person.userData.v219Phone){
        const phone=person.userData.v219Phone;
        phone.rotation.y=Math.sin(t*1.7+i)*.12;
      }
    });
  }

  window.addEventListener('tgg:worldlife:focus',event=>{
    const next=String(event?.detail?.focus||'');
    if(['downtown','stage','studio','media','free'].includes(next))focus=next;
  });

  const clock=new THREE.Clock();
  function animate(){
    requestAnimationFrame(animate);
    const dt=Math.min(.05,clock.getDelta());
    const t=clock.elapsedTime;
    const pw=playerWorld();
    focus=currentFocus();
    const limit=visibleLimit();
    visibleFans=0;cheering=0;recording=0;watching=0;reactionLevel=0;
    fans.forEach((fan,i)=>{
      fan.visible=i<limit;
      if(!fan.visible)return;
      visibleFans++;
      animateFan(fan,dt,t,pw,focus,i);
    });
    animateDecoratedPeople(t,pw);
  }
  animate();

  window.TGGCrowdPresentation={
    fans,
    clusters,
    getFocus:()=>focus,
    getStatus:()=>({
      ready:true,
      focus,
      fanPool:fans.length,
      visibleFans,
      clusterCount:clusters.length,
      cheering,
      recording,
      watching,
      reactionLevel,
      accessories:decoration.accessories,
      streetPhones:decoration.phones,
      density:street.getDensity?.()||'HIGH',
      totalPresented:(street.getStatus?.().totalStreetPopulation||0)+visibleFans
    })
  };
})();