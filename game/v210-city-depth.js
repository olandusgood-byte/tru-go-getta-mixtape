(() => {
  const objects=[];
  const trafficLights=[];
  const billboards=[];
  let ready=false;

  function material(color,opts={}){
    const THREE=window.THREE;
    return new THREE.MeshStandardMaterial({color,roughness:opts.roughness??.55,metalness:opts.metalness??.18,emissive:opts.emissive??0x000000,emissiveIntensity:opts.emissiveIntensity??0});
  }

  function addCrosswalk(cx,cz,axis='x'){
    const THREE=window.THREE,scene=window.TGG3D?.scene;if(!THREE||!scene)return;
    for(let i=-3;i<=3;i++){
      const stripe=new THREE.Mesh(
        new THREE.BoxGeometry(axis==='x'?1.8:5.7,.025,axis==='x'?5.7:1.8),
        new THREE.MeshStandardMaterial({color:0xe9edf4,roughness:.8,metalness:.05,transparent:true,opacity:.72})
      );
      if(axis==='x')stripe.position.set(cx+i*2.35,.075,cz);
      else stripe.position.set(cx,.075,cz+i*2.35);
      stripe.receiveShadow=true;scene.add(stripe);objects.push(stripe);
    }
  }

  function makeTrafficLight(x,z,rotation=0,phase=0){
    const THREE=window.THREE,scene=window.TGG3D?.scene;if(!THREE||!scene)return null;
    const g=new THREE.Group();
    const pole= new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,4.7,10),material(0x343a46,{metalness:.75,roughness:.32}));
    pole.position.y=2.35;g.add(pole);
    const arm=new THREE.Mesh(new THREE.BoxGeometry(2.35,.1,.1),pole.material);
    arm.position.set(.92,4.45,0);g.add(arm);
    const housing=new THREE.Mesh(new THREE.BoxGeometry(.58,1.45,.46),material(0x10141b,{metalness:.55,roughness:.4}));
    housing.position.set(2.0,3.95,0);g.add(housing);
    const red=new THREE.Mesh(new THREE.SphereGeometry(.13,12,8),material(0x451010,{emissive:0xff2222,emissiveIntensity:.2}));
    const yellow=new THREE.Mesh(new THREE.SphereGeometry(.13,12,8),material(0x4a3b0e,{emissive:0xffd43b,emissiveIntensity:.15}));
    const green=new THREE.Mesh(new THREE.SphereGeometry(.13,12,8),material(0x123f20,{emissive:0x35ff72,emissiveIntensity:.2}));
    red.position.set(2.0,4.38,.24);yellow.position.set(2.0,3.96,.24);green.position.set(2.0,3.54,.24);
    g.add(red,yellow,green);
    g.position.set(x,0,z);g.rotation.y=rotation;scene.add(g);
    g.userData.signal={red,yellow,green,phase};trafficLights.push(g);objects.push(g);return g;
  }

  function makeBillboard(text,sub,x,z,rotation,color){
    const THREE=window.THREE,scene=window.TGG3D?.scene;if(!THREE||!scene)return null;
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=320;
    const ctx=canvas.getContext('2d');
    const hex='#'+new THREE.Color(color).getHexString();
    const grad=ctx.createLinearGradient(0,0,768,320);grad.addColorStop(0,'#090c13');grad.addColorStop(1,'#141a2a');
    ctx.fillStyle=grad;ctx.fillRect(0,0,768,320);
    ctx.strokeStyle=hex;ctx.lineWidth=10;ctx.strokeRect(10,10,748,300);
    ctx.fillStyle=hex;ctx.font='900 66px Arial';ctx.textAlign='center';ctx.fillText(text,384,145);
    ctx.fillStyle='#ffffff';ctx.font='800 27px Arial';ctx.fillText(sub,384,205);
    ctx.fillStyle='#9ca7bd';ctx.font='700 19px Arial';ctx.fillText('TRU GO GETTA WORLD',384,250);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:new THREE.Color(color),emissiveIntensity:.45,roughness:.4,metalness:.12});
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(8.8,3.65),mat);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(9.2,4.05,.16),material(0x202636,{metalness:.7,roughness:.3}));
    frame.position.z=-.11;
    const g=new THREE.Group();g.add(frame,panel);
    [-3.6,3.6].forEach(px=>{const post=new THREE.Mesh(new THREE.BoxGeometry(.16,4.3,.16),frame.material);post.position.set(px,-3.95,-.1);g.add(post)});
    g.position.set(x,7.2,z);g.rotation.y=rotation;scene.add(g);objects.push(g);billboards.push(g);return g;
  }

  function addStreetSigns(){
    const THREE=window.THREE,scene=window.TGG3D?.scene;if(!THREE||!scene)return;
    const defs=[
      ['STUDIO ROW',-24,-4,0xff466d],
      ['MIXTAPE AVE',4,24,0xc56cff],
      ['DOWNTOWN',24,4,0xffcf4a],
      ['TGG PARK',4,-24,0x4cff88]
    ];
    defs.forEach(([label,x,z,color])=>{
      const canvas=document.createElement('canvas');canvas.width=420;canvas.height=100;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#0a0d14';ctx.fillRect(0,0,420,100);
      ctx.strokeStyle='#'+new THREE.Color(color).getHexString();ctx.lineWidth=5;ctx.strokeRect(4,4,412,92);
      ctx.fillStyle='#fff';ctx.font='900 34px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,210,50);
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
      sprite.scale.set(7.6,1.8,1);sprite.position.set(x,5.8,z);scene.add(sprite);objects.push(sprite);
    });
  }

  function boot(){
    if(ready)return true;
    const THREE=window.THREE,scene=window.TGG3D?.scene;if(!THREE||!scene)return false;
    [[0,0],[-24,0],[24,0],[0,-24],[0,24]].forEach(([x,z])=>{addCrosswalk(x,z-5.2,'x');addCrosswalk(x-5.2,z,'z')});
    [[-4,-4,0,0],[4,4,Math.PI,0],[-4,4,0,1],[4,-4,Math.PI,1],
     [-28,-4,0,0],[-20,4,Math.PI,1],[20,-4,0,1],[28,4,Math.PI,0],
     [-4,-28,Math.PI/2,1],[4,-20,-Math.PI/2,0],[-4,20,Math.PI/2,0],[4,28,-Math.PI/2,1]]
      .forEach(v=>makeTrafficLight(...v));
    makeBillboard('TGG RADIO','LIVE FROM THE CITY',-40,2,Math.PI/2,0xc7ff00);
    makeBillboard('STUDIO ROW','RECORD • MIX • RELEASE',-15,-40,0,0xff466d);
    makeBillboard('MIXTAPE AVE','MOVE THE CITY',19,40,Math.PI,0xc56cff);
    addStreetSigns();
    ready=true;return true;
  }

  function signalForAxis(axis,t=performance.now()){
    const cycle=(t/1000)%12;
    const local=axis==='z'?(cycle+6)%12:cycle;
    return local<5?'green':local<6?'yellow':'red';
  }

  function animate(t=0){
    if(!boot()){requestAnimationFrame(animate);return}
    const cycle=(t/1000)%12;
    trafficLights.forEach(light=>{
      const s=light.userData.signal;
      const local=(cycle+s.phase*6)%12;
      const green=local<5;
      const yellow=local>=5&&local<6;
      const red=!green&&!yellow;
      s.red.material.emissiveIntensity=red?5.8:.18;
      s.yellow.material.emissiveIntensity=yellow?5.2:.12;
      s.green.material.emissiveIntensity=green?5.8:.18;
    });
    billboards.forEach((b,i)=>{b.children[1].material.emissiveIntensity=.38+Math.sin(t*.0018+i)*.12});
    const badge=document.querySelector('.v201-badge');if(badge)badge.textContent='V2.15 CHARACTER + MISSION DEPTH 100';
    requestAnimationFrame(animate);
  }

  function status(){return {ready,trafficLights:trafficLights.length,billboards:billboards.length,objects:objects.length}}
  window.TGGCityDepth={status,boot,signalForAxis,trafficLights,billboards};
  requestAnimationFrame(animate);
})();