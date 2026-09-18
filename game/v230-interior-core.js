(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)));
  const ROOMS={
    studio:{id:'studio',type:'recording',width:8.4,depth:7.2,height:3.8,accent:0xff466d},
    home:{id:'home',type:'apartment',width:7.6,depth:6.8,height:3.4,accent:0xffc84a},
    shops:{id:'shops',type:'boutique',width:8.8,depth:7.0,height:3.6,accent:0x48d7ff},
    media:{id:'media',type:'club',width:9.6,depth:8.4,height:4.2,accent:0xc56cff},
    business:{id:'business',type:'office',width:8.8,depth:7.4,height:3.7,accent:0xc7ff00},
    park:{id:'park',type:'lounge',width:7.8,depth:6.6,height:3.5,accent:0x4cff88}
  };
  function normalize(input={}){
    return {
      id:String(input.id||'studio'),
      type:String(input.type||'room'),
      width:clamp(Number.isFinite(Number(input.width))?Number(input.width):8,5,10),
      depth:clamp(Number.isFinite(Number(input.depth))?Number(input.depth):7,5,10),
      height:clamp(Number.isFinite(Number(input.height))?Number(input.height):3.6,2.8,5),
      accent:Number.isFinite(Number(input.accent))?Math.max(0,Math.min(0xffffff,Math.floor(Number(input.accent)))):0xc7ff00
    };
  }
  function room(id='studio'){return normalize(ROOMS[id]||ROOMS.studio)}
  function canWalk(point,anchor,roomInput){
    const r=normalize(roomInput||ROOMS.studio),p=point||{x:0,z:0},a=anchor||{x:0,z:0};
    const mx=Math.max(1.2,r.width/2-.7),mz=Math.max(1.2,r.depth/2-.7);
    return Math.abs((Number(p.x)||0)-(Number(a.x)||0))<=mx&&Math.abs((Number(p.z)||0)-(Number(a.z)||0))<=mz;
  }
  const api={room,normalize,canWalk,rooms:Object.keys(ROOMS)};
  globalThis.TGGV230Core=api;
  if(typeof window!=='undefined')window.TGGV230Core=api;
})();