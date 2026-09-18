(() => {
  function boot(){
    const host=document.getElementById('garage3d');
    const screen=document.getElementById('garage');
    if(!host||!screen||!window.THREE)return;

    const THREE=window.THREE;
    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x06080d);
    scene.fog=new THREE.FogExp2(0x06080d,.035);

    const camera=new THREE.PerspectiveCamera(48,1,.1,80);
    camera.position.set(8.5,4.8,10.5);

    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.2;
    host.appendChild(renderer.domElement);
    screen.classList.add('garage-3d-ready');

    scene.add(new THREE.HemisphereLight(0xa4b7ff,0x090a0e,1.5));
    const key=new THREE.SpotLight(0xffffff,11,35,.48,.42,1.4);
    key.position.set(3,11,6);key.castShadow=true;scene.add(key);
    const volt=new THREE.PointLight(0xc7ff00,11,22,2);volt.position.set(-5,3,-2);scene.add(volt);
    const rim=new THREE.PointLight(0x5a78ff,8,20,2);rim.position.set(5,3,-4);scene.add(rim);

    const floor=new THREE.Mesh(
      new THREE.CylinderGeometry(7.4,7.4,.35,64),
      new THREE.MeshStandardMaterial({color:0x11151d,metalness:.42,roughness:.44})
    );
    floor.position.y=-.18;floor.receiveShadow=true;scene.add(floor);

    const ring=new THREE.Mesh(
      new THREE.TorusGeometry(5.65,.055,10,80),
      new THREE.MeshStandardMaterial({color:0xc7ff00,emissive:0x87bd00,emissiveIntensity:2.6})
    );
    ring.rotation.x=Math.PI/2;ring.position.y=.03;scene.add(ring);

    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;
      const pillar=new THREE.Mesh(
        new THREE.BoxGeometry(.18,4.2,.18),
        new THREE.MeshStandardMaterial({color:0x303744,metalness:.78,roughness:.3})
      );
      pillar.position.set(Math.cos(a)*7.1,2,Math.sin(a)*7.1);
      scene.add(pillar);
    }

    function makeCar(){
      const car=new THREE.Group();
      const bodyMat=new THREE.MeshStandardMaterial({color:0xc7ff00,metalness:.78,roughness:.24});
      const darkMat=new THREE.MeshStandardMaterial({color:0x080a0d,metalness:.58,roughness:.34});
      const glass=new THREE.MeshStandardMaterial({color:0x527890,metalness:.2,roughness:.08,transparent:true,opacity:.72});
      const shell=new THREE.Mesh(new THREE.BoxGeometry(4.8,1.05,2.15),bodyMat);
      shell.position.y=1.0;shell.castShadow=true;car.add(shell);
      const nose=new THREE.Mesh(new THREE.BoxGeometry(1.5,.55,2.0),bodyMat);
      nose.position.set(2.5,.9,0);nose.castShadow=true;car.add(nose);
      const cabin=new THREE.Mesh(new THREE.BoxGeometry(2.3,.98,1.75),glass);
      cabin.position.set(-.3,1.78,0);cabin.castShadow=true;car.add(cabin);
      const spoiler=new THREE.Mesh(new THREE.BoxGeometry(.18,.12,2.0),darkMat);
      spoiler.position.set(-2.34,1.55,0);car.add(spoiler);
      const wheels=[];
      [[-1.5,.48,-1.08],[-1.5,.48,1.08],[1.55,.48,-1.08],[1.55,.48,1.08]].forEach(([x,y,z])=>{
        const w=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.38,18),darkMat);
        w.rotation.x=Math.PI/2;w.position.set(x,y,z);w.castShadow=true;car.add(w);wheels.push(w);
      });
      [-.7,.7].forEach(z=>{
        const h=new THREE.Mesh(new THREE.BoxGeometry(.08,.25,.38),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xe7fbff,emissiveIntensity:3}));
        h.position.set(3.27,1.02,z);car.add(h);
      });
      car.userData.bodyMat=bodyMat;
      car.userData.wheelMat=darkMat;
      car.userData.wheels=wheels;
      return car;
    }

    const car=makeCar();
    car.rotation.y=-.4;
    scene.add(car);

    const badgeCanvas=document.createElement('canvas');
    badgeCanvas.width=700;badgeCanvas.height=150;
    const ctx=badgeCanvas.getContext('2d');
    ctx.fillStyle='#05070b';ctx.fillRect(0,0,700,150);
    ctx.strokeStyle='#c7ff00';ctx.lineWidth=5;ctx.strokeRect(8,8,684,134);
    ctx.fillStyle='#fff';ctx.font='900 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('TGG CUSTOM GARAGE',350,75);
    const tex=new THREE.CanvasTexture(badgeCanvas);tex.colorSpace=THREE.SRGBColorSpace;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(6.6,1.42),new THREE.MeshBasicMaterial({map:tex}));
    sign.position.set(0,4.25,-6.8);scene.add(sign);

    let yaw=.3,targetYaw=.3,drag=false,lastX=0;
    host.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;host.setPointerCapture?.(e.pointerId)});
    host.addEventListener('pointermove',e=>{
      if(!drag)return;
      targetYaw+=(e.clientX-lastX)*.008;
      lastX=e.clientX;
    });
    const stop=()=>drag=false;
    host.addEventListener('pointerup',stop);
    host.addEventListener('pointercancel',stop);

    function setAppearance(next={}){
      if(next.color)car.userData.bodyMat.color.set(next.color);
      if(next.wheelColor)car.userData.wheelMat.color.set(next.wheelColor);
      return {
        color:'#'+car.userData.bodyMat.color.getHexString(),
        wheelColor:'#'+car.userData.wheelMat.color.getHexString()
      };
    }

    function resize(){
      const r=host.getBoundingClientRect();
      if(!r.width||!r.height)return;
      renderer.setSize(r.width,r.height,false);
      camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(host);

    const clock=new THREE.Clock();
    function animate(){
      requestAnimationFrame(animate);
      if(!screen.classList.contains('active'))return;
      const dt=Math.min(.05,clock.getDelta());
      yaw=THREE.MathUtils.lerp(yaw,targetYaw,.08);
      car.rotation.y+=dt*.14;
      camera.position.x=Math.sin(yaw)*11;
      camera.position.z=Math.cos(yaw)*11;
      camera.position.y=4.8;
      camera.lookAt(0,1.1,0);
      car.userData.wheels.forEach(w=>w.rotation.z-=dt*.45);
      volt.intensity=9+Math.sin(performance.now()*.002)*1.8;
      renderer.render(scene,camera);
    }

    const saved=window.TGGGarage?.getState?.();
    if(saved)setAppearance({color:saved.color,wheelColor:saved.wheelColor});
    const mo=new MutationObserver(()=>{if(screen.classList.contains('active'))requestAnimationFrame(resize)});
    mo.observe(screen,{attributes:true,attributeFilter:['class']});
    resize();animate();

    window.TGGGarage3D={scene,camera,renderer,car,setAppearance,isReady:()=>true,resize};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();