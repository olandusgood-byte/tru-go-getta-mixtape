(()=>{
  const VERSION='V7.56 REAL USA WORLD';
  const KEY='tgg-v756-real-usa';
  const GEOJSON_URL='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/USLandmass/MapServer/0/query?where=STATE%3C%3D56&outFields=STATE%2CSTUSAB%2CBASENAME&returnGeometry=true&outSR=4326&f=geojson';
  const REGION={
    AL:'south',AK:'alaska',AZ:'southwest',AR:'south',CA:'west-coast',CO:'mountain',CT:'northeast',DE:'mid-atlantic',
    FL:'florida',GA:'south',HI:'hawaii',ID:'mountain',IL:'midwest',IN:'midwest',IA:'midwest',KS:'plains',
    KY:'appalachia',LA:'gulf',ME:'new-england',MD:'mid-atlantic',MA:'new-england',MI:'great-lakes',MN:'great-lakes',
    MS:'south',MO:'midwest',MT:'mountain',NE:'plains',NV:'desert',NH:'new-england',NJ:'mid-atlantic',NM:'southwest',
    NY:'northeast',NC:'carolinas',ND:'plains',OH:'midwest',OK:'plains',OR:'pacific-nw',PA:'appalachia',RI:'new-england',
    SC:'carolinas',SD:'plains',TN:'south',TX:'texas',UT:'mountain',VT:'new-england',VA:'mid-atlantic',WA:'pacific-nw',
    WV:'appalachia',WI:'great-lakes',WY:'mountain'
  };
  const PRESETS={
    'west-coast':{terrain:'coast + mountains + dry inland',weather:'marine / dry',road:'dense freeways + canyon roads'},
    'pacific-nw':{terrain:'evergreen forest + mountains + coast',weather:'rain / fog',road:'forest highways'},
    mountain:{terrain:'high mountains + valleys + forest',weather:'snow / clear',road:'mountain passes'},
    desert:{terrain:'desert + basin + neon city',weather:'dry / hot',road:'long desert interstates'},
    southwest:{terrain:'desert + mesa + mountain',weather:'dry / monsoon',road:'open highways'},
    texas:{terrain:'metro + plains + desert + gulf',weather:'heat / storms',road:'huge freeways + long routes'},
    plains:{terrain:'prairie + farmland + open sky',weather:'wind / storms',road:'long straight highways'},
    midwest:{terrain:'cities + farmland + rivers',weather:'four-season',road:'interstates + local grids'},
    'great-lakes':{terrain:'lakefront + forest + city',weather:'snow / lake effect',road:'urban + lake routes'},
    south:{terrain:'pine + farmland + rolling hills',weather:'humid / storms',road:'interstates + country roads'},
    gulf:{terrain:'bayou + wetlands + coast',weather:'humid / rain',road:'causeways + city routes'},
    florida:{terrain:'coast + wetlands + palms',weather:'tropical / storms',road:'flat highways + causeways'},
    carolinas:{terrain:'mountains + piedmont + coast',weather:'four-season / humid',road:'city loops + mountain roads'},
    appalachia:{terrain:'mountains + valleys + forest',weather:'fog / four-season',road:'curvy mountain roads'},
    'mid-atlantic':{terrain:'dense cities + coast + rolling inland',weather:'four-season',road:'beltways + interstates'},
    northeast:{terrain:'dense metro + hills + lakes',weather:'four-season / snow',road:'dense highways'},
    'new-england':{terrain:'rocky coast + forest + mountains',weather:'snow / fall / fog',road:'older town roads + interstates'},
    alaska:{terrain:'huge wilderness + mountains + tundra',weather:'snow / arctic',road:'sparse long-distance roads'},
    hawaii:{terrain:'volcanic islands + tropical coast',weather:'tropical',road:'island highways'}
  };
  let state={selected:'NC',loaded:false,source:'US Census Bureau TIGERweb',features:[],error:null};

  function save(){try{localStorage.setItem(KEY,JSON.stringify({selected:state.selected}))}catch{}}
  function loadSaved(){try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');if(x.selected)state.selected=x.selected}catch{}}
  function featureAbbr(f){return String(f?.properties?.STUSAB||'').toUpperCase()}
  function nameOf(f){return f?.properties?.BASENAME||f?.properties?.NAME||featureAbbr(f)}
  function currentFeature(){return state.features.find(f=>featureAbbr(f)===state.selected)||null}
  function preset(abbr=state.selected){return PRESETS[REGION[abbr]||'midwest']||PRESETS.midwest}

  function ensureUI(){
    if(document.getElementById('v756UsaWorld'))return;
    const actions=document.querySelector('.action-deck .actions');
    if(actions){
      const b=document.createElement('button');
      b.id='v756UsaBtn';b.className='action-primary';b.textContent='USA MAP';
      actions.appendChild(b);b.addEventListener('click',open);
    }
    const overlay=document.createElement('section');
    overlay.id='v756UsaWorld';overlay.className='v756-usa-world';
    overlay.innerHTML='<div class="v756-shell"><header><div><small>V7.56 • REAL USA WORLD</small><h2>TRAVEL THE COUNTRY</h2><p>50 real state outlines • state-to-state travel • regional terrain + weather + road identity</p></div><button id="v756Close">CLOSE</button></header><div class="v756-body"><div class="v756-map-wrap"><svg id="v756Map" viewBox="0 0 1000 620" aria-label="United States state travel map"></svg><div id="v756MapStatus">LOADING OFFICIAL STATE BOUNDARIES…</div></div><aside><small>CURRENT STATE</small><h3 id="v756StateName">NORTH CAROLINA</h3><b id="v756StateCode">NC</b><div id="v756Preset"></div><button id="v756Travel">TRAVEL HERE</button><button id="v756Home">RETURN TO CITY</button></aside></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#v756Close').onclick=close;
    overlay.querySelector('#v756Home').onclick=close;
    overlay.querySelector('#v756Travel').onclick=()=>travel(state.selected);
  }

  function project(lon,lat,abbr){
    if(abbr==='AK')return [120+(lon+170)*5.0,515-(lat-50)*5.2];
    if(abbr==='HI')return [305+(lon+160)*12,570-(lat-18)*12];
    return [(lon+127)*18.2,520-(lat-24)*17.3];
  }
  function ringPath(ring,abbr){
    return ring.map((p,i)=>{
      const q=project(Number(p[0]),Number(p[1]),abbr);
      return (i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1);
    }).join(' ')+' Z';
  }
  function geometryPath(geom,abbr){
    if(!geom)return'';
    if(geom.type==='Polygon')return geom.coordinates.map(r=>ringPath(r,abbr)).join(' ');
    if(geom.type==='MultiPolygon')return geom.coordinates.flatMap(poly=>poly.map(r=>ringPath(r,abbr))).join(' ');
    return'';
  }

  function render(){
    ensureUI();
    const svg=document.getElementById('v756Map');if(!svg)return;
    svg.innerHTML='';
    for(const f of state.features){
      const abbr=featureAbbr(f);if(!REGION[abbr])continue;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',geometryPath(f.geometry,abbr));
      path.dataset.state=abbr;
      path.classList.toggle('selected',abbr===state.selected);
      path.addEventListener('click',()=>select(abbr));
      const title=document.createElementNS('http://www.w3.org/2000/svg','title');
      title.textContent=nameOf(f);path.appendChild(title);svg.appendChild(path);
    }
    const status=document.getElementById('v756MapStatus');
    if(status)status.textContent=state.loaded?'OFFICIAL CENSUS STATE GEOMETRY LOADED':(state.error?'BOUNDARY LOAD RETRY AVAILABLE':'LOADING OFFICIAL STATE BOUNDARIES…');
    updateDetail();
  }

  function updateDetail(){
    const f=currentFeature(),p=preset(),name=f?nameOf(f):state.selected;
    const n=document.getElementById('v756StateName');
    const c=document.getElementById('v756StateCode');
    const box=document.getElementById('v756Preset');
    if(n)n.textContent=String(name).toUpperCase();
    if(c)c.textContent=state.selected;
    if(box)box.innerHTML='<span><b>TERRAIN</b>'+p.terrain+'</span><span><b>WEATHER</b>'+p.weather+'</span><span><b>ROADS</b>'+p.road+'</span>';
    document.querySelectorAll('#v756Map path').forEach(x=>x.classList.toggle('selected',x.dataset.state===state.selected));
  }

  function select(abbr){
    if(!REGION[abbr])return false;
    state.selected=abbr;save();updateDetail();return true;
  }
  function travel(abbr){
    if(!select(abbr))return false;
    const p=preset(abbr);
    document.documentElement.dataset.tggState=abbr;
    document.documentElement.dataset.tggRegion=REGION[abbr]||'midwest';
    window.dispatchEvent(new CustomEvent('tgg:state-travel',{detail:{state:abbr,region:REGION[abbr],preset:p}}));
    if(/rain|fog|storm|snow/.test(p.weather))window.TGGCityWorldMega?.setWeather?.('overcast');
    else window.TGGCityWorldMega?.setWeather?.('clear');
    window.TGGGameFeel?.objective?.('STATE TRAVEL',abbr+' • '+p.terrain);
    close();return true;
  }
  function open(){ensureUI();document.getElementById('v756UsaWorld')?.classList.add('open');updateDetail()}
  function close(){document.getElementById('v756UsaWorld')?.classList.remove('open')}

  async function load(){
    loadSaved();ensureUI();
    try{
      const r=await fetch(GEOJSON_URL,{mode:'cors',credentials:'omit'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const gj=await r.json();
      state.features=(gj.features||[]).filter(f=>REGION[featureAbbr(f)]);
      state.loaded=state.features.length===50;
      if(!state.loaded)throw new Error('Expected 50 states, got '+state.features.length);
      state.error=null;
    }catch(e){
      state.error=String(e?.message||e);state.loaded=false;
    }
    render();
    document.documentElement.dataset.tggV756=state.loaded?'on':'degraded';
    window.dispatchEvent(new CustomEvent('tgg:v756-ready',{detail:getStatus()}));
  }
  function retry(){state.error=null;return load()}
  function getStatus(){
    return {
      version:VERSION,loaded:state.loaded,stateCount:state.features.length,selected:state.selected,
      region:REGION[state.selected],preset:preset(),source:state.source,error:state.error,
      features:['official-state-boundaries','all-50-states','real-relative-placement','alaska-hawaii-insets','state-travel','regional-terrain-presets','regional-weather-presets','regional-road-presets','persistent-current-state']
    };
  }

  window.TGGRealUSA={version:VERSION,open,close,select,travel,retry,getStatus,getState:()=>state.selected,getFeatures:()=>state.features.slice()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();