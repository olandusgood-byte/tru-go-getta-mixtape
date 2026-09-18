(() => {
  const host=document.getElementById('studio3d');
  const screen=document.getElementById('studio');
  if(!host||!screen||!window.THREE)return;

  const THREE=window.THREE;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x07080d);

  const camera=new THREE.PerspectiveCamera(54,1,.1,80);
  camera.position.set(9,7,13);
  camera.lookAt(0,2,0);

  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
  renderer.shadowMap.enabled=true;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  host.appendChild(renderer.domElement);
  screen.classList.add('studio-3d-ready');

  scene.add(new THREE.HemisphereLight(0x8da2ff,0x08080c,1.35));
  const key=new THREE.SpotLight(0xffffff,8,30,.5,.5,1.5);
  key.position.set(4,10,7);key.castShadow=true;scene.add(key);
  const volt=new THREE.PointLight(0xc7ff00,8,18,2);volt.position.set(-5,4,-2);scene.add(volt);
  const red=new THREE.PointLight(0xff315f,6,15,2);red.position.set(5,3,-4);scene.add(red);

  const floor=new THREE.Mesh(new THREE.BoxGeometry(18,.3,14),new THREE.MeshStandardMaterial({color:0x12141b,roughness:.82,metalness:.16}));
  floor.position.y=-.2;floor.receiveShadow=true;scene.add(floor);
  const backWall=new THREE.Mesh(new THREE.BoxGeometry(18,8,.3),new THREE.MeshStandardMaterial({color:0x171a23,roughness:.75}));
  backWall.position.set(0,4,-7);scene.add(backWall);
  const leftWall=new THREE.Mesh(new THREE.BoxGeometry(.3,8,14),new THREE.MeshStandardMaterial({color:0x10131a,roughness:.75}));
  leftWall.position.set(-9,4,0);scene.add(leftWall);

  const panelMat=new THREE.MeshStandardMaterial({color:0x252936,roughness:.72});
  for(let x=-7;x<=7;x+=2.35){
    const panel=new THREE.Mesh(new THREE.BoxGeometry(1.75,3.1,.18),panelMat);
    panel.position.set(x,4,-6.78);scene.add(panel);
  }

  const boothFrame=new THREE.Group();
  const frameMat=new THREE.MeshStandardMaterial({color:0x313747,metalness:.65,roughness:.35});
  const glassMat=new THREE.MeshPhysicalMaterial({color:0x7798a8,transparent:true,opacity:.22,roughness:.08,metalness:.1,transmission:.25});
  const glass=new THREE.Mesh(new THREE.BoxGeometry(6.8,4.6,.12),glassMat);glass.position.set(-3.9,3.1,-2.25);boothFrame.add(glass);
  [-7.35,-.45].forEach(x=>{const post=new THREE.Mesh(new THREE.BoxGeometry(.16,5.6,.18),frameMat);post.position.set(x,3.1,-2.2);boothFrame.add(post)});
  const top=new THREE.Mesh(new THREE.BoxGeometry(7.1,.16,.18),frameMat);top.position.set(-3.9,5.86,-2.2);boothFrame.add(top);
  scene.add(boothFrame);

  const micStand=new THREE.Group();
  const standMat=new THREE.MeshStandardMaterial({color:0x1d2027,metalness:.8,roughness:.25});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,3.3,10),standMat);pole.position.y=1.65;micStand.add(pole);
  const mic=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.45,6,10),new THREE.MeshStandardMaterial({color:0x4b5260,metalness:.9,roughness:.18}));
  mic.rotation.z=Math.PI/2;mic.position.set(.38,3.1,0);micStand.add(mic);
  const pop=new THREE.Mesh(new THREE.TorusGeometry(.38,.035,10,24),standMat);pop.position.set(.72,3.05,0);pop.rotation.y=Math.PI/2;micStand.add(pop);
  micStand.position.set(-4,0,-.4);scene.add(micStand);

  const consoleGroup=new THREE.Group();
  const desk=new THREE.Mesh(new THREE.BoxGeometry(6.6,.55,2.5),new THREE.MeshStandardMaterial({color:0x161921,metalness:.35,roughness:.55}));
  desk.rotation.z=-.02;consoleGroup.add(desk);
  const screenMat=new THREE.MeshStandardMaterial({color:0x071018,emissive:0x1aa9d8,emissiveIntensity:1.7});
  for(let i=0;i<2;i++){
    const mon=new THREE.Mesh(new THREE.BoxGeometry(2.1,1.25,.12),screenMat);
    mon.position.set(-1.25+i*2.5,1.2,-.65);mon.rotation.x=-.12;consoleGroup.add(mon);
  }
  const buttonMat=new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0x7bb900,emissiveIntensity:1.4});
  for(let row=0;row<3;row++){
    for(let col=0;col<9;col++){
      const b=new THREE.Mesh(new THREE.BoxGeometry(.28,.08,.16),buttonMat);
      b.position.set(-2.2+col*.55,.32,.1+row*.38);consoleGroup.add(b);
    }
  }
  consoleGroup.position.set(3.7,1.1,1.1);consoleGroup.rotation.y=-.18;scene.add(consoleGroup);

  function speaker(x,z){
    const g=new THREE.Group();
    const box=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.2,1),new THREE.MeshStandardMaterial({color:0x0d0f14,roughness:.5}));
    g.add(box);
    [ .45,-.45].forEach(y=>{
      const cone=new THREE.Mesh(new THREE.CylinderGeometry(.34,.18,.12,20),new THREE.MeshStandardMaterial({color:0x343a46,metalness:.3,roughness:.45}));
      cone.rotation.x=Math.PI/2;cone.position.set(0,y,.56);g.add(cone);
    });
    g.position.set(x,2,z);scene.add(g);
  }
  speaker(1.1,-2.9);speaker(6.1,-2.9);

  const couch=new THREE.Mesh(new THREE.BoxGeometry(4,.85,1.65),new THREE.MeshStandardMaterial({color:0x3a2432,roughness:.88}));
  couch.position.set(3,.65,5.1);scene.add(couch);

  const signCanvas=document.createElement('canvas');signCanvas.width=768;signCanvas.height=180;
  const ctx=signCanvas.getContext('2d');ctx.fillStyle='#05070b';ctx.fillRect(0,0,768,180);
  ctx.strokeStyle='#c7ff00';ctx.lineWidth=5;ctx.strokeRect(8,8,752,164);
  ctx.fillStyle='#ffffff';ctx.font='900 54px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('TRU GO GETTA STUDIOS',384,90);
  const signTex=new THREE.CanvasTexture(signCanvas);signTex.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(6.6,1.55),new THREE.MeshBasicMaterial({map:signTex}));
  sign.position.set(3.6,5.45,-6.55);scene.add(sign);

  let targetYaw=.2;
  host.addEventListener('pointermove',e=>{
    const r=host.getBoundingClientRect();
    targetYaw=((e.clientX-r.left)/Math.max(1,r.width)-.5)*.8;
  });

  function resize(){
    const r=host.getBoundingClientRect();
    if(!r.width||!r.height)return;
    renderer.setSize(r.width,r.height,false);
    camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);

  function animate(t=0){
    requestAnimationFrame(animate);
    if(screen.classList.contains('active')){
      const tt=t*.001;
      camera.position.x=9+Math.sin(targetYaw)*2.2;
      camera.position.z=13+Math.cos(targetYaw)*1.1;
      camera.lookAt(0,2,0);
      volt.intensity=7+Math.sin(tt*1.8)*1.2;
      red.intensity=5+Math.cos(tt*1.4)*.8;
      renderer.render(scene,camera);
    }
  }
  const observer=new MutationObserver(()=>{if(screen.classList.contains('active'))requestAnimationFrame(resize)});
  observer.observe(screen,{attributes:true,attributeFilter:['class']});
  resize();animate();

  window.TGGStudio3D={scene,camera,renderer,isReady:()=>true,resize};
})();