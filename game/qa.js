(() => {
  const report=[];
  const pass=(name,detail)=>report.push({name,status:'PASS',detail});
  const fail=(name,detail)=>report.push({name,status:'FAIL',detail});
  const check=(name,condition,detail)=>condition?pass(name,detail):fail(name,detail);
  function run(){
    report.length=0;
    check('localStorage','localStorage' in window,'browser persistence available');
    check('game-api',!!window.TGGGame,'main game API available');check('career-api',!!window.TGCCareer,'career API available');check('content-api',!!window.TGGContent,'content API available');check('expansion-api',!!window.TGGExpansion,'city expansion API available');check('progression-api',!!window.TGGProgression,'progression API available');check('bridge-api',!!window.TGGBridge,'website bridge API available');check('inventory-api',!!window.TGGInventory&&typeof window.TGGInventory.add==='function'&&typeof window.TGGInventory.has==='function'&&typeof window.TGGInventory.remove==='function','V1.3 inventory API available');check('crew-api',!!window.TGGCrew&&typeof window.TGGCrew.recruit==='function','V1.3 crew API available');check('economy-api',!!window.TGGEconomy&&typeof window.TGGEconomy.reward==='function'&&typeof window.TGGEconomy.apply==='function','V1.3 shared economy API available');check('events-api',!!window.TGGEvents&&typeof window.TGGEvents.run==='function','V1.4 city events API available');
    check('chain-api',!!window.TGGChains&&typeof window.TGGChains.start==='function','mission chain API available');check('chain-ui',!!window.TGGChainUI&&typeof window.TGGChainUI.start==='function','mission chain UI API available');check('district-api',!!window.TGGDistricts&&typeof window.TGGDistricts.canEnter==='function','district progression API available');check('district-milestones',!!window.TGGProgression?.achievements?.some?.(a=>a.id==='studio-row-unlocked')&&!!window.TGGProgression?.achievements?.some?.(a=>a.id==='mixtape-ave-unlocked'),'district unlock achievements are registered');
    const missions=window.TGGContent?.content?.missions||[];check('content-district-gating',missions.length===3&&missions.every(m=>typeof m.district==='string'&&typeof window.TGGDistricts?.canEnter==='function'),'content missions declare districts and expose district gate API');
    check('save-api',!!window.TGGSave&&typeof window.TGGSave.repair==='function','save validator available');
    ['menu','creator','game','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge','pause','hud'].forEach(id=>check(id,!!document.getElementById(id),'required screen/control host exists'));
    ['missionBtn','saveBtn','careerBtn','contentBtn','advanceContentBtn','expansionBtn','progressionBtn','inventoryBtn','crewBtn','eventsBtn','bridgeBtn','chainBtn'].forEach(id=>check(id,!!document.getElementById(id),'required action exists'));
    const integrity=window.TGGV12Integrity?.run?.();check('v12-integrity',!!integrity?.passed,'V1.2 integrity gate passes');
    const saveKeys=Object.values(window.TGGSave?.keys||{});check('save-keys',saveKeys.length===10&&new Set(saveKeys).size===10,'all ten existing V1 save keys remain unique and unchanged');
    const original=window.TGGSave?.report?.();check('save-report',!!original&&original.valid,'save compatibility report accepts valid or missing subsystem saves');
    const saved={};saveKeys.forEach(k=>{saved[k]=localStorage.getItem(k)});
    localStorage.setItem('tgg-game-v1',JSON.stringify({level:7,cash:123,xp:456,x:12,y:34,name:'KEEP ME',style:'Producer',mission:'studio-session',accepted:true}));
    localStorage.setItem('tgg-career-v1',JSON.stringify({studioLevel:3,reputation:77,recordings:4,mixtapes:2,upgrades:3,unlocks:['Bedroom Studio','Pro Studio']}));
    localStorage.setItem('tgg-progression-v1',JSON.stringify({unlocked:['first-cash','first-cash',7],updatedAt:1}));
    localStorage.setItem('tgg-chains-v1',JSON.stringify({active:7,completed:['first-move','first-move']}));
    localStorage.setItem('tgg-districts-v1',JSON.stringify({unlocked:['downtown','downtown',7]}));
    localStorage.setItem('tgg-inventory-v1',JSON.stringify({items:{mic:2,'beat-pack':'3'},updatedAt:1}));
    localStorage.setItem('tgg-crew-v1',JSON.stringify({members:['dj-v','dj-v',7]}));
    localStorage.setItem('tgg-events-v1',JSON.stringify({completed:['night-market','night-market',7],runs:{'night-market':'2'},lastReward:{id:'night-market'}}));
    const repaired=window.TGGSave.repair();
    const game=JSON.parse(localStorage.getItem('tgg-game-v1'));const career=JSON.parse(localStorage.getItem('tgg-career-v1'));const progression=JSON.parse(localStorage.getItem('tgg-progression-v1'));const chains=JSON.parse(localStorage.getItem('tgg-chains-v1'));const districts=JSON.parse(localStorage.getItem('tgg-districts-v1'));const inventory=JSON.parse(localStorage.getItem('tgg-inventory-v1'));const crew=JSON.parse(localStorage.getItem('tgg-crew-v1'));const events=JSON.parse(localStorage.getItem('tgg-events-v1'));
    check('save-repair-preserve',game.level===7&&game.cash===123&&game.xp===456&&game.x===12&&game.y===34&&game.name==='KEEP ME'&&career.studioLevel===3&&career.reputation===77&&career.recordings===4&&career.mixtapes===2&&career.upgrades===3,'valid player progress survives compatibility repair');
    check('save-repair-normalize',progression.unlocked.length===1&&progression.unlocked[0]==='first-cash'&&chains.active===null&&chains.completed.length===1&&districts.unlocked.length===1&&inventory.items.mic===2&&inventory.items['beat-pack']===3&&crew.members.length===1&&events.completed.length===1&&events.runs['night-market']===2&&events.lastReward.id==='night-market','malformed collections normalize without dropping valid fields');
    check('save-repair-report',!!repaired&&repaired.valid,'post-repair save report is valid');
    saveKeys.forEach(k=>{const v=saved[k];if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)});
    const bad=report.filter(x=>x.status==='FAIL');window.TGGQA={report,passed:bad.length===0,repair(){window.TGGSave?.repair?.();return !!document.getElementById('hud')&&!!window.TGGGame&&!!window.TGGProgression&&!!window.TGGChains&&!!window.TGGDistricts&&!!window.TGGSave&&!!window.TGGInventory&&!!window.TGGCrew&&!!window.TGGEconomy&&!!window.TGGEvents}};return window.TGGQA;
  }
  window.TGGQA={run};
})();
