(()=>{'use strict';
const VERSION='30.00.0',SPAN='V19.01-V30.00',KEY='tgg-v3000-america-worldgen';
const REGION_PRESETS={
Northeast:{terrain:'wooded-hills',roads:'dense-arterials',weather:'four-season',architecture:'brick-stone-town',wildlife:['deer','fox'],radio:'NORTHEAST FM'},
'Mid-Atlantic':{terrain:'rolling-coastal',roads:'dense-suburban',weather:'four-season',architecture:'rowhouse-suburb',wildlife:['deer','waterfowl'],radio:'MID-ATLANTIC FM'},
South:{terrain:'piedmont-lowland',roads:'highway-rural',weather:'humid',architecture:'southern-town',wildlife:['deer','alligator','turkey'],radio:'SOUTH FM'},
Appalachia:{terrain:'steep-mountain',roads:'winding-mountain',weather:'four-season',architecture:'mountain-town',wildlife:['deer','black-bear'],radio:'MOUNTAIN FM'},
Midwest:{terrain:'prairie-lake',roads:'grid-highway',weather:'continental',architecture:'midwest-town',wildlife:['deer','waterfowl'],radio:'HEARTLAND FM'},
Plains:{terrain:'open-prairie',roads:'long-straight',weather:'continental-windy',architecture:'small-town',wildlife:['pronghorn','deer'],radio:'PLAINS FM'},
Mountain:{terrain:'alpine-high-desert',roads:'mountain-interstate',weather:'dry-cold',architecture:'mountain-west',wildlife:['elk','deer','bear'],radio:'MOUNTAIN WEST FM'},
Southwest:{terrain:'desert-mesa',roads:'open-interstate',weather:'dry-hot',architecture:'desert-modern',wildlife:['coyote','pronghorn'],radio:'DESERT FM'},
Pacific:{terrain:'coast-mountain',roads:'coastal-freeway',weather:'marine-varied',architecture:'west-coast',wildlife:['deer','bear','waterfowl'],radio:'PACIFIC FM'}
};
const STATE_OVERRIDES={
AK:{scale:1.9,terrain:'tundra-glacier-mountain',weather:'subarctic',signature:['glacier-road','remote-airstrip','fjord']},
HI:{scale:1.3,terrain:'volcanic-tropical-island',weather:'tropical',signature:['lava-field','rainforest-road','surf-coast']},
FL:{scale:1.45,terrain:'flat-wetland-coast',weather:'tropical-humid',signature:['causeway','everglade-road','keys-route']},
CA:{scale:1.7,terrain:'coast-valley-sierra-desert',weather:'mediterranean-varied',signature:['pacific-highway','redwood-road','sierra-pass','desert-freeway']},
TX:{scale:1.8,terrain:'plains-hill-country-desert-gulf',weather:'hot-varied',signature:['mega-freeway','ranch-road','gulf-route','west-desert']},
NC:{scale:1.5,terrain:'outer-banks-piedmont-blue-ridge',weather:'humid-four-season',signature:['blue-ridge-road','piedmont-city','outer-banks-route']},
NY:{scale:1.55,signature:['mega-city','adirondack-road','finger-lakes']},
CO:{scale:1.55,signature:['rocky-pass','alpine-town','high-plains']},
AZ:{scale:1.5,signature:['canyon-road','sonoran-desert','high-country']},
LA:{scale:1.4,signature:['bayou-road','gulf-port','wetland-bridge']},
MI:{scale:1.45,signature:['great-lake-coast','northwoods','industrial-metro']},
WA:{scale:1.45,signature:['cascade-pass','puget-sound','rainforest-road']},
OR:{scale:1.45,signature:['pacific-coast','cascade-road','high-desert']},
UT:{scale:1.45,signature:['red-rock-road','salt-flat','wasatch-pass']},
MT:{scale:1.6,signature:['big-sky-highway','rocky-valley','open-range']},
WY:{scale:1.55,signature:['high-plains','geyser-country','mountain-pass']},
TN:{scale:1.4,signature:['smoky-road','music-city','river-valley']},
PA:{scale:1.4,signature:['appalachian-turnpike','industrial-city','farm-country']},
ME:{scale:1.4,signature:['rocky-coast','pine-forest','mountain-lake']},
NV:{scale:1.5,signature:['desert-freeway','neon-city','basin-range']}
};
const CORRIDORS=[
['I-5',['CA','OR','WA']],['I-10',['CA','AZ','NM','TX','LA','MS','AL','FL']],['I-40',['CA','AZ','NM','TX','OK','AR','TN','NC']],['I-70',['UT','CO','KS','MO','IL','IN','OH','WV','PA','MD']],['I-80',['CA','NV','UT','WY','NE','IA','IL','IN','OH','PA','NJ']],['I-90',['WA','ID','MT','WY','SD','MN','WI','IL','IN','OH','PA','NY','MA']],['I-95',['FL','GA','SC','NC','VA','MD','DE','PA','NJ','NY','CT','RI','MA','NH','ME']]
];
const stateData=()=>window.TGGUSAStates?.states?.()||[];
const defaults={current:'NC',generated:{},miles:0,crossings:0,landmarks:0,corridor:null,detail:'high'};
let state=(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}})();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};return state};
const profile=code=>{
 const s=stateData().find(x=>x.code===code);if(!s)return null;
 const p=REGION_PRESETS[s.region]||REGION_PRESETS.South,o=STATE_OVERRIDES[code]||{};
 return {...s,...p,...o,scale:o.scale||1.25,signature:o.signature||[s.biome.split(',')[0].trim()+' route','state capital district','regional backroad']};
};
function generate(code){
 const p=profile(code);if(!p)return null;
 const seed=[...code].reduce((a,c)=>a+c.charCodeAt(0),0);
 const world={
  code,name:p.name,capital:p.capital,region:p.region,terrain:p.terrain,weather:p.weather,architecture:p.architecture,
  radio:p.radio,wildlife:p.wildlife,scale:p.scale,signatures:p.signature,
  highwayDensity:2+(seed%5),cityDensity:2+((seed*3)%6),ruralDensity:3+((seed*5)%6),
  elevation:(p.terrain||'').includes('mountain')?0.9:(p.terrain||'').includes('flat')?0.15:0.45,
  coast:/coast|island|gulf|marine|wetland/.test((p.terrain||'')+' '+p.biome),
  snow:/cold|alpine|subarctic|four-season/.test((p.weather||'')),
  desert:/desert|dry-hot|high-desert/.test((p.terrain||'')+' '+(p.weather||'')),
  generatedAt:Date.now()
 };
 state.generated[code]=world;state.current=code;state.landmarks+=world.signatures.length;save();return world;
}
function applyWorld(code){
 const w=state.generated[code]||generate(code);if(!w)return;
 document.documentElement.dataset.tggState=code;
 document.documentElement.dataset.tggTerrain=w.terrain;
 document.documentElement.dataset.tggClimate=w.weather;
 document.documentElement.style.setProperty('--tgg-state-scale',w.scale);
 const fog=window.TGG3D?.scene?.fog;if(fog&&'density'in fog)fog.density=w.desert?.0028:w.coast?.0045:w.elevation>.7?.0032:.0038;
 const hud=document.getElementById('v3000WorldgenHud');if(hud){hud.querySelector('b').textContent=w.name.toUpperCase();hud.querySelector('[data-terrain]').textContent=w.terrain.toUpperCase();hud.querySelector('[data-road]').textContent=(w.highwayDensity+' HIGHWAY DENSITY • '+w.cityDensity+' CITY DENSITY')}
 render();
 window.dispatchEvent(new CustomEvent('tgg:worldgen-state',{detail:w}));
}
function render(){
 const w=state.generated[state.current]||profile(state.current);if(!w)return;
 const name=document.getElementById('v3000Name'),meta=document.getElementById('v3000Meta'),sig=document.getElementById('v3000Signatures'),stats=document.getElementById('v3000Stats');
 if(name)name.textContent=w.name+' WORLD PROFILE';
 if(meta)meta.textContent=(w.capital||'')+' • '+w.region+' • '+w.terrain+' • '+w.weather;
 if(sig)sig.innerHTML=(w.signatures||[]).map(x=>'<span>'+String(x).toUpperCase()+'</span>').join('');
 if(stats)stats.textContent=Object.keys(state.generated).length+'/50 STATES GENERATED • '+state.crossings+' BORDER CROSSINGS • '+Math.round(state.miles)+' TRAVEL MILES';
}
document.addEventListener('DOMContentLoaded',()=>{
 const hud=document.createElement('aside');hud.id='v3000WorldgenHud';hud.innerHTML='<small>AMERICA WORLDGEN</small><b>NORTH CAROLINA</b><span data-terrain>LOADING TERRAIN</span><span data-road>WORLD PROFILE READY</span>';document.body.appendChild(hud);
 const btn=document.createElement('button');btn.id='v3000WorldgenBtn';btn.type='button';btn.className='action-primary';btn.textContent='STATE WORLDGEN';document.querySelector('#game .action-deck .actions')?.appendChild(btn);
 const panel=document.createElement('section');panel.id='v3000WorldgenPanel';panel.hidden=true;panel.innerHTML='<div class="v3000-card"><header><div><small>V1901–V3000</small><h3>AMERICA WORLD GENERATOR</h3></div><button id="v3000Close">CLOSE</button></header><h4 id="v3000Name"></h4><p id="v3000Meta"></p><div id="v3000Signatures"></div><p id="v3000Stats"></p><div class="v3000-actions"><button id="v3000Generate">GENERATE CURRENT STATE</button><button id="v3000All">PREBUILD ALL 50 PROFILES</button><button id="v3000Roadtrip">START INTERSTATE ROAD TRIP</button></div><div id="v3000Corridors"></div></div>';document.body.appendChild(panel);
 document.getElementById('v3000Corridors').innerHTML=CORRIDORS.map(c=>'<article><b>'+c[0]+'</b><span>'+c[1].join(' → ')+'</span></article>').join('');
 btn.onclick=()=>{panel.hidden=false;applyWorld(state.current)};document.getElementById('v3000Close').onclick=()=>panel.hidden=true;
 document.getElementById('v3000Generate').onclick=()=>{applyWorld(window.TGGUSAStates?.state?.()?.current||state.current);window.__tggToast?.('STATE WORLD PROFILE GENERATED')};
 document.getElementById('v3000All').onclick=()=>{stateData().forEach(s=>generate(s.code));save();render();window.__tggToast?.('ALL 50 STATE WORLD PROFILES READY')};
 document.getElementById('v3000Roadtrip').onclick=()=>{const code=window.TGGUSAStates?.state?.()?.current||state.current;const route=CORRIDORS.find(c=>c[1].includes(code))||CORRIDORS[2];state.corridor=route[0];state.crossings++;state.miles+=350+route[1].length*85;save();window.__tggToast?.(route[0]+' ROAD TRIP ACTIVE — '+route[1].join(' → '));render()};
 window.addEventListener('tgg:state-change',e=>{if(e.detail?.code){if(state.current!==e.detail.code)state.crossings++;applyWorld(e.detail.code)}});
 if(stateData().length){stateData().forEach(s=>{if(!state.generated[s.code])generate(s.code)});applyWorld(window.TGGUSAStates?.state?.()?.current||'NC')}
 window.TGGAmericaWorldgen={version:VERSION,span:SPAN,profile,generate,applyWorld,corridors:()=>CORRIDORS.map(x=>[x[0],[...x[1]]]),state:()=>JSON.parse(JSON.stringify(state)),getStatus:()=>({version:VERSION,span:SPAN,stateProfiles:Object.keys(state.generated).length,regions:Object.keys(REGION_PRESETS).length,corridors:CORRIDORS.length,realStateIdentity:true,stateSpecificTerrain:true,stateSpecificWeather:true,stateSpecificRoads:true,stateSpecificArchitecture:true,stateSpecificWildlife:true,regionalRadio:true,interstateTravel:true,borderCrossings:true,all50Ready:stateData().length===50,ok:true})};
 document.documentElement.dataset.tggV3000='on';window.dispatchEvent(new CustomEvent('tgg:v3000-ready',{detail:window.TGGAmericaWorldgen.getStatus()}));
});
})();