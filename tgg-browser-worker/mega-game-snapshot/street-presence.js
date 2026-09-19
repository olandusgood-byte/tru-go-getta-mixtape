(() => {
  const THREE=window.THREE;
  const core=window.TGG3D;
  if(!THREE||!core?.scene||!core?.player)return;

  const scene=core.scene;
  const COLORS=[0xf25f5c,0x6c8cff,0xffc857,0x8e6cff,0x42d392,0xff8fcf,0x5ed4ff,0xf29f67];
  const SKINS=[0x6e432f,0x84553c,0x9d6a49,0xb57a55,0xc78a65,0xd59a72];
  const DARK=0x10141d;

  function makeCitizen(i=0){
    const g=new THREE.Group();
    const shirt=new THREE.MeshStandardMaterial({color:COLORS[i%COLORS.length],roughness:.68,metalness:.05});
    const skin=new THREE.MeshStandardMaterial({color:SKINS[i%SKINS.length],roughness:.82});
    const pants=new THREE.MeshStandardMaterial({color:DARK+(i%3)*0x050505,roughness:.85});
    const shoeMat=new THREE.MeshStandardMaterial({color:i%2?0xf2f2f2:0x090b10,roughness:.74});

    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,1.05,4,7),shirt);
    body.position.y=1.72;body.castShadow=true;g.add(body);

    const head=new THREE.Mesh(new THREE.SphereGeometry(.38,12,10),skin);
    head.position.y=2.88;head.castShadow=true;g.add(head);

    const hair=new THREE.Mesh(new THREE.SphereGeometry(.395,12,7,0,Math.PI*2,0,Math.PI*.48),pants);
    hair.position.y=3.01;g.add(hair);

    const parts={body,head,arms:[],legs:[]};
    [-1,1].forEach((side,idx)=>{
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.115,.68,3,6),shirt);
      arm.position.set(side*.63,1.84,0);arm.rotation.z=side*.08;arm.castShadow=true;g.add(arm);parts.arms.push(arm);

      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.14,.75,3,6),pants);
      leg.position.set(side*.22,.72,0);leg.castShadow=true;g.add(leg);parts.legs.push(leg);

      const shoe=new THREE.Mesh(new THREE.BoxGeometry(.28,.14,.48),shoeMat);
      shoe.position.set(side*.22,.18,.1);shoe.castShadow=true;g.add(shoe);
    });
    g.userData.parts=parts;
    return g;
  }

  const routeDefs=[
    [[-31,-7],[-18,-7],[-18,-18],[-31,-18]],
    [[-15,-31],[-7,-31],[-7,-18],[-15,-18]],
    [[7,-31],[18,-31],[18,-18],[7,-18]],
    [[31,-18],[31,-7],[18,-7],[18,-18]],
    [[31,7],[31,18],[18,18],[18,7]],
    [[18,31],[7,31],[7,18],[18,18]],
    [[-7,31],[-18,31],[-18,18],[-7,18]],
    [[-31,18],[-31,7],[-18,7],[-18,18]],
    [[-4,-31],[-4,-9],[4,-9],[4,-31]],
    [[-4,31],[-4,9],[4,9],[4,31]],
    [[-31,-4],[-9,-4],[-9,4],[-31,4]],
    [[31,-4],[9,-4],[9,4],[31,4]],
    [[-18,-10],[-10,-10],[-10,-18],[-18,-18]],
    [[10,10],[18,10],[18,18],[10,18]]
  ];

  const citizens=routeDefs.map((route,i)=>{
    const person=makeCitizen(i);
    person.scale.setScalar(.76+(i%4)*.025);
    person.position.set(route[0][0],0,route[0][1]);
    person.userData.route=route;
    person.userData.routeIndex=1;
    person.userData.speed=.55+(i%5)*.055;
    person.userData.phase=i*.74;
    person.userData.pauseUntil=0;
    person.userData.reactUntil=0;
    person.userData.seed=i*1.37;
    person.userData.kind=i%5===0?'social':i%4===0?'fan':'street';
    scene.add(person);
    return person;
  });

  function simpleProp(color=0xc7ff00){
    const g=new THREE.Group();
    const metal=new THREE.MeshStandardMaterial({color:0x232a36,metalness:.65,roughness:.35});
    const glow=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.4,roughness:.3});
    const base=new THREE.Mesh(new THREE.BoxGeometry(1.65,.75,.9),metal);base.position.y=.4;g.add(base);
    const top=new THREE.Mesh(new THREE.BoxGeometry(1.3,.13,.72),glow);top.position.y=.88;g.add(top);
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,1.5,8),metal);mast.position.set(0,1.6,0);g.add(mast);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.15,10,8),glow);lamp.position.y=2.35;g.add(lamp);
    return g;
  }

  const activityNodes=[
    {id:'studio-line',label:'Studio Row',x:-23,z:-10,color:0xff466d},
    {id:'downtown-cypher',label:'Downtown',x:8,z:8,color:0xc7ff00},
    {id:'mixtape-crowd',label:'Mixtape Ave',x:24,z:13,color:0x48d7ff},
    {id:'media-crew',label:'Media District',x:2,z:34,color:0xc56cff}
  ].map((d,i)=>{
    const prop=simpleProp(d.color);
    prop.position.set(d.x,0,d.z);
    prop.rotation.y=(i%2?Math.PI/2:0);
    scene.add(prop);
    return {...d,prop};
  });

  const socialPairs=[
    [[-22,-10],[-20.5,-10]],
    [[10,10],[11.5,10]],
    [[23,14],[24.5,14]],
    [[1,33],[2.5,33]]
  ];
  const socialPeople=[];
  socialPairs.forEach((pair,j)=>{
    pair.forEach((pos,k)=>{
      const p=makeCitizen(20+j*2+k);
      p.scale.setScalar(.78);
      p.position.set(pos[0],0,pos[1]);
      p.rotation.y=k?Math.PI:-.15;
      p.userData.staticSocial=true;
      p.userData.phase=j+k*.5;
      scene.add(p);
      socialPeople.push(p);
    });
  });

  const allPeople=[...citizens,...socialPeople];
  let density='HIGH';
  let reactions=0;
  let nearbyPeople=0;
  let activeDistrict='DOWNTOWN';

  function playerWorld(){
    const state=window.TGGGame?.getState?.()||{x:50,y:55};
    return {
      x:((Number(state.x)||50)-50)*.92,
      z:((Number(state.y)||50)-50)*.92,
      state
    };
  }

  function storyTargetWorld(){
    const t=window.TGGStoryMissions?.navigationTarget?.();
    if(!t)return null;
    return {
      ...t,
      wx:((Number(t.x)||50)-50)*.92,
      wz:((Number(t.y)||50)-50)*.92
    };
  }

  function nearestDistrict(x,z){
    const defs=[
      ['STUDIO ROW',-24,-12],
      ['DOWNTOWN',0,0],
      ['MIXTAPE AVE',24,12],
      ['MEDIA DISTRICT',0,36]
    ];
    let best=defs[0],dist=Infinity;
    defs.forEach(d=>{const next=Math.hypot(x-d[1],z-d[2]);if(next<dist){dist=next;best=d}});
    return best[0];
  }

  function qualityDensity(){
    const q=window.TGGVerticalSlice?.getState?.().quality;
    return q==='PERF'?'LOW':q==='BALANCED'?'MEDIUM':'HIGH';
  }

  function setDensity(next='HIGH'){
    density=['LOW','MEDIUM','HIGH'].includes(next)?next:'HIGH';
    const visibleCount=density==='LOW'?6:density==='MEDIUM'?10:citizens.length;
    citizens.forEach((p,i)=>p.visible=i<visibleCount);
    socialPeople.forEach((p,i)=>p.visible=density!=='LOW'||i<4);
    activityNodes.forEach(x=>x.prop.visible=density!=='LOW');
    return density;
  }

  function faceTowards(group,x,z,amount=.12){
    const desired=Math.atan2(x-group.position.x,z-group.position.z);
    let delta=((desired-group.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
    group.rotation.y+=delta*amount;
  }

  function animateCitizen(person,dt,t,pw,target){
    const data=person.userData;
    const parts=data.parts;
    const dxp=pw.x-person.position.x,dzp=pw.z-person.position.z;
    const playerDist=Math.hypot(dxp,dzp);
    const targetDist=target?Math.hypot(target.wx-person.position.x,target.wz-person.position.z):999;
    const attention=playerDist<7.5;
    const missionAttention=targetDist<9.5;
    const now=performance.now();

    if(data.staticSocial){
      const talk=Math.sin(t*1.7+data.phase);
      person.rotation.y+=Math.sin(t*.65+data.phase)*.0009;
      parts.head.rotation.y=talk*.22;
      parts.arms[0].rotation.x=.08+Math.max(0,talk)*.25;
      parts.arms[1].rotation.x=.08+Math.max(0,-talk)*.22;
      if(attention)faceTowards(person,pw.x,pw.z,.035);
      return;
    }

    if(attention&&playerDist<2.6){
      data.reactUntil=Math.max(data.reactUntil,now+900);
    }
    const reacting=now<data.reactUntil;

    if(reacting){
      reactions++;
      const inv=1/Math.max(.001,playerDist);
      person.position.x-=dxp*inv*dt*.85;
      person.position.z-=dzp*inv*dt*.85;
      faceTowards(person,pw.x,pw.z,.08);
      parts.arms[0].rotation.x=THREE.MathUtils.lerp(parts.arms[0].rotation.x,-.38,.18);
      parts.arms[1].rotation.x=THREE.MathUtils.lerp(parts.arms[1].rotation.x,-.38,.18);
      return;
    }

    if(now<data.pauseUntil){
      person.position.y=Math.sin(t*1.4+data.seed)*.012;
      if(attention)faceTowards(person,pw.x,pw.z,.04);
      parts.head.rotation.y=attention?Math.sin(t*.8+data.seed)*.09:Math.sin(t*.45+data.seed)*.16;
      return;
    }

    const route=data.route;
    const idx=data.routeIndex||0;
    const dest=route[idx];
    const dx=dest[0]-person.position.x,dz=dest[1]-person.position.z;
    const dist=Math.hypot(dx,dz);
    if(dist<.38){
      data.routeIndex=(idx+1)%route.length;
      if((idx+person.userData.seed)%3<1.25)data.pauseUntil=now+650+(data.routeIndex%3)*300;
      return;
    }

    const step=Math.min(dist,data.speed*dt);
    person.position.x+=dx/dist*step;
    person.position.z+=dz/dist*step;
    faceTowards(person,dest[0],dest[1],.18);
    data.phase+=dt*(6.5+data.speed*2);
    const swing=Math.sin(data.phase)*.52;
    parts.arms[0].rotation.x=THREE.MathUtils.lerp(parts.arms[0].rotation.x,swing,.3);
    parts.arms[1].rotation.x=THREE.MathUtils.lerp(parts.arms[1].rotation.x,-swing,.3);
    parts.legs[0].rotation.x=THREE.MathUtils.lerp(parts.legs[0].rotation.x,-swing*.8,.3);
    parts.legs[1].rotation.x=THREE.MathUtils.lerp(parts.legs[1].rotation.x,swing*.8,.3);
    person.position.y=Math.abs(Math.sin(data.phase))*0.025;

    if(attention){
      parts.head.rotation.y=THREE.MathUtils.lerp(parts.head.rotation.y,Math.max(-.5,Math.min(.5,Math.atan2(dxp,dzp)-person.rotation.y)),.08);
    }else{
      parts.head.rotation.y=THREE.MathUtils.lerp(parts.head.rotation.y,0,.08);
    }

    if(missionAttention&&data.kind==='fan'){
      parts.arms[0].rotation.z=.45+Math.sin(t*5+data.seed)*.18;
    }else{
      parts.arms[0].rotation.z=THREE.MathUtils.lerp(parts.arms[0].rotation.z,0,.12);
    }
  }

  function animateContacts(pw,t){
    const storyWorld=window.TGGStoryWorld3D;
    const status=storyWorld?.getStatus?.();
    const active=status?.activeContact||'';
    const contacts=storyWorld?.contacts||[];
    contacts.forEach((c,i)=>{
      if(!c?.group)return;
      const dist=Math.hypot(pw.x-c.group.position.x,pw.z-c.group.position.z);
      if(c.id===active||dist<7){
        faceTowards(c.group,pw.x,pw.z,c.id===active?.12:.055);
      }
      if(c.id===active){
        c.group.rotation.z=Math.sin(t*2.2+i)*.01;
      }else{
        c.group.rotation.z=THREE.MathUtils.lerp(c.group.rotation.z,0,.08);
      }
    });
  }

  function animateActivityNodes(t,target){
    activityNodes.forEach((node,i)=>{
      const nearTarget=target&&Math.hypot(node.x-target.wx,node.z-target.wz)<11;
      node.prop.scale.setScalar(nearTarget?1.07+Math.sin(t*3+i)*.025:1);
      const lamp=node.prop.children[node.prop.children.length-1];
      if(lamp?.material)lamp.material.emissiveIntensity=nearTarget?4.2:2.4+Math.sin(t*1.3+i)*.3;
    });
  }

  const clock=new THREE.Clock();
  function animate(){
    requestAnimationFrame(animate);
    const dt=Math.min(.05,clock.getDelta());
    const t=clock.elapsedTime;
    const pw=playerWorld();
    const target=storyTargetWorld();

    const wantedDensity=qualityDensity();
    if(wantedDensity!==density)setDensity(wantedDensity);

    reactions=0;
    nearbyPeople=0;
    allPeople.forEach(person=>{
      if(!person.visible)return;
      if(Math.hypot(pw.x-person.position.x,pw.z-person.position.z)<10)nearbyPeople++;
      animateCitizen(person,dt,t,pw,target);
    });
    animateContacts(pw,t);
    animateActivityNodes(t,target);
    activeDistrict=nearestDistrict(pw.x,pw.z);
  }

  setDensity('HIGH');
  animate();

  window.TGGStreetPresence={
    people:allPeople,
    citizens,
    socialPeople,
    activityNodes,
    setDensity,
    getDensity:()=>density,
    getStatus:()=>({
      ready:true,
      density,
      citizens:citizens.filter(x=>x.visible).length,
      socialPeople:socialPeople.filter(x=>x.visible).length,
      totalVisible:allPeople.filter(x=>x.visible).length,
      nearbyPeople,
      reactions,
      activeDistrict,
      activityNodes:activityNodes.length,
      originalPedestrians:Array.isArray(core.pedestrians)?core.pedestrians.length:0,
      totalStreetPopulation:(Array.isArray(core.pedestrians)?core.pedestrians.length:0)+allPeople.filter(x=>x.visible).length
    })
  };
})();