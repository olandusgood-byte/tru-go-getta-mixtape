(() => {
  function boot(){
    if(!window.THREE)return;
    const THREE=window.THREE;
    const runtimes=[];

    function box(scene,w,h,d,color,x,y,z,opts={}){
      const m=new THREE.Mesh(
        new THREE.BoxGeometry(w,h,d),
        new THREE.MeshStandardMaterial({
          color,
          roughness:opts.roughness ?? .7,
          metalness:opts.metalness ?? .12,
          emissive:opts.emissive ?? 0x000000,
          emissiveIntensity:opts.emissiveIntensity ?? 0
        })
      );
      m.position.set(x,y,z);m.castShadow=opts.cast!==false;m.receiveShadow=true;scene.add(m);return m;
    }

    function makeHuman(scene,x,z,color=0xc7ff00){
      const g=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color,roughness:.58});
      const skin=new THREE.MeshStandardMaterial({color:0xa97250,roughness:.72});
      const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,1.15,4,8),mat);body.position.y=1.55;g.add(body);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.4,14,10),skin);head.position.y=2.78;g.add(head);
      g.position.set(x,0,z);scene.add(g);return g;
    }

    function makeRuntime(hostId,screenId,build){
      const host=document.getElementById(hostId),screen=document.getElementById(screenId);
      if(!host||!screen)return null;
      const scene=new THREE.Scene();scene.background=new THREE.Color(0x07090e);
      const camera=new THREE.PerspectiveCamera(52,1,.1,90);
      camera.position.set(8,6,11);
      const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
      renderer.shadowMap.enabled=true;
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.16;
      host.appendChild(renderer.domElement);
      screen.classList.add('interior-3d-ready');

      scene.add(new THREE.HemisphereLight(0x91a5ff,0x090a0e,1.35));
      const key=new THREE.SpotLight(0xffffff,8,30,.55,.5,1.5);
      key.position.set(4,9,6);key.castShadow=true;scene.add(key);
      const accent=new THREE.PointLight(0xc7ff00,7,18,2);accent.position.set(-5,3,-2);scene.add(accent);

      box(scene,18,.25,14,0x11141b,0,-.12,0,{roughness:.82,metalness:.18});
      box(scene,18,7,.25,0x171b24,0,3.5,-7,{cast:false});
      box(scene,.25,7,14,0x0f1219,-9,3.5,0,{cast:false});
      const animated=build({scene,camera,renderer,box,makeHuman,accent})||[];

      let targetYaw=.18,yaw=.18;
      host.addEventListener('pointermove',e=>{
        const r=host.getBoundingClientRect();
        targetYaw=((e.clientX-r.left)/Math.max(1,r.width)-.5)*.85;
      });
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
        const dt=Math.min(.05,clock.getDelta()),t=clock.elapsedTime;
        yaw=THREE.MathUtils.lerp(yaw,targetYaw,.08);
        camera.position.set(8+Math.sin(yaw)*2.5,5.7,11+Math.cos(yaw)*1.2);
        camera.lookAt(0,1.8,0);
        accent.intensity=6.2+Math.sin(t*1.9)*1.15;
        animated.forEach(fn=>fn(t,dt));
        renderer.render(scene,camera);
      }
      new MutationObserver(()=>{if(screen.classList.contains('active'))requestAnimationFrame(resize)})
        .observe(screen,{attributes:true,attributeFilter:['class']});
      resize();animate();
      const rt={host,screen,scene,camera,renderer,resize};
      runtimes.push(rt);
      return rt;
    }

    makeRuntime('home3d','home',({scene,box,makeHuman})=>{
      box(scene,5,.9,2.1,0x513b36,-4,.48,3.7,{roughness:.88});
      box(scene,5.2,.5,3.7,0xd6d8de,4,.28,3.4,{roughness:.92});
      box(scene,3,.18,1.4,0x6d4b32,1,.8,-2.7,{roughness:.8});
      const tv=box(scene,3,1.7,.12,0x071018,3,3.8,-6.65,{emissive:0x123d5d,emissiveIntensity:1.8});
      box(scene,5.4,2.6,.1,0x29425f,-3,3.5,-6.64,{emissive:0x17365f,emissiveIntensity:.8});
      const person=makeHuman(scene,-.8,1.8,0xc7ff00);
      return [(t)=>{person.rotation.y=Math.sin(t*.45)*.18;tv.material.emissiveIntensity=1.5+Math.sin(t*1.7)*.3}];
    });

    makeRuntime('media3d','media',({scene,box,makeHuman})=>{
      box(scene,12,.3,8,0x17191e,0,.15,-.5,{roughness:.9});
      box(scene,10,4.8,.22,0x08090d,0,2.5,-5.6);
      const stage=box(scene,7,3.3,.18,0x20242e,0,2.1,-5.42,{emissive:0x26113f,emissiveIntensity:.35});
      const cam=box(scene,1.4,.8,1.1,0x11151b,1.2,2.2,1.5,{metalness:.72,roughness:.25});
      box(scene,.16,2.2,.16,0x4e5564,1.2,1.05,1.5,{metalness:.8});
      const director=makeHuman(scene,4,2.8,0x5f8cff);
      const artist=makeHuman(scene,-1.3,-1.3,0xc7ff00);
      const l1=new THREE.PointLight(0xffe5cf,7,14,2);l1.position.set(-4,5,1);scene.add(l1);
      const l2=new THREE.PointLight(0x8fa4ff,6,14,2);l2.position.set(4,5,0);scene.add(l2);
      return [(t)=>{cam.rotation.y=Math.sin(t*.6)*.28;director.rotation.y=-.7+Math.sin(t*.3)*.1;artist.position.y=Math.sin(t*2)*.03;stage.material.emissiveIntensity=.25+Math.sin(t*1.2)*.12}];
    });

    makeRuntime('shops3d','shops',({scene,box,makeHuman})=>{
      const colors=[0xc7ff00,0x48d7ff,0xff466d,0xc56cff];
      [-6,-2,2,6].forEach((x,i)=>{
        box(scene,3.3,4.4,3.1,0x171a22,x,2.2,-3.7,{roughness:.72});
        box(scene,2.5,1.3,.12,0x0a0d12,x,3.5,-2.08,{emissive:colors[i],emissiveIntensity:1.35});
      });
      const shopper=makeHuman(scene,-1.5,2.3,0xffffff);
      const shopper2=makeHuman(scene,3.5,1.2,0xffc857);
      return [(t)=>{shopper.position.x=-1.5+Math.sin(t*.45)*1.5;shopper2.rotation.y=t*.18}];
    });

    makeRuntime('park3d','park',({scene,box,makeHuman})=>{
      box(scene,13,.12,8,0x26354a,0,.02,0,{roughness:.94});
      const lineMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.35});
      const mid=new THREE.Mesh(new THREE.BoxGeometry(.08,.05,8),lineMat);mid.position.y=.1;scene.add(mid);
      const circle=new THREE.Mesh(new THREE.TorusGeometry(1.45,.055,10,40),lineMat);circle.rotation.x=Math.PI/2;circle.position.y=.12;scene.add(circle);
      [-5.6,5.6].forEach(x=>{
        box(scene,.12,2.6,.12,0x838b98,x,1.3,0,{metalness:.7,roughness:.3});
        const board=box(scene,.16,1.5,2.3,0xffffff,x,2.55,0,{roughness:.45});
        board.rotation.z=Math.PI/2;
        const rim=new THREE.Mesh(new THREE.TorusGeometry(.46,.05,8,24),new THREE.MeshStandardMaterial({color:0xff6f32,emissive:0xaa2d00,emissiveIntensity:.7}));
        rim.rotation.y=Math.PI/2;rim.position.set(x+(x<0?.5:-.5),1.95,0);scene.add(rim);
      });
      const p1=makeHuman(scene,-1,1.3,0xc7ff00),p2=makeHuman(scene,2,-1.2,0xff466d),p3=makeHuman(scene,3.2,2.1,0x48d7ff);
      return [(t)=>{p1.position.x=-1+Math.sin(t*.65)*1.2;p2.rotation.y=t*.35;p3.position.z=2.1+Math.cos(t*.55)*.7}];
    });

    window.TGGInteriors3D={isReady:()=>runtimes.length>=4,runtimes};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();