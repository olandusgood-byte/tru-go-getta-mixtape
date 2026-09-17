(() => {
  const checks=[]; const test=(name,pass,detail='')=>checks.push({name,pass:!!pass,detail});
  function run(){
    checks.length=0;
    test('game api',!!window.TGGGame);test('career api',!!window.TGGCareer);test('content api',!!window.TGGContent);test('expansion api',!!window.TGGExpansion);test('progression api',!!window.TGGProgression);test('bridge api',!!window.TGGBridge);test('chain api',!!window.TGGChains);test('district api',!!window.TGGDistricts);test('save api',!!window.TGGSave);test('inventory api',!!window.TGGInventory);test('crew api',!!window.TGGCrew);test('events api',!!window.TGGEvents);test('economy api',!!window.TGGEconomy&&typeof window.TGGEconomy.apply==='function');test('avatar api',!!window.TGGAvatar&&typeof window.TGGAvatar.get==='function'&&typeof window.TGGAvatar.save==='function');
    ['menu','creator','avatar','game','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge','pause','hud'].forEach(id=>test('dom:'+id,!!document.getElementById(id)));
    ['newGame','continueGame','startGame','avatarStart','characterBtn','avatarDone','avatarBack','rotateLeft','rotateRight','missionBtn','careerBtn','contentBtn','advanceContentBtn','expansionBtn','progressionBtn','inventoryBtn','crewBtn','eventsBtn','bridgeBtn','chainBtn','saveBtn','pauseBtn','resumeBtn','menuBtn','recordBtn','mixtapeBtn','upgradeBtn'].forEach(id=>test('control:'+id,!!document.getElementById(id)));
    test('local storage',typeof localStorage!=='undefined');const av=window.TGGAvatar?.get?.()||{};test('avatar state',typeof av.skin==='string'&&typeof av.hair==='string'&&typeof av.top==='string'&&typeof av.accent==='string');test('avatar save integration',window.TGGSave?.keys?.avatar==='tgg-avatar-v1');
    const p=window.TGGGame?.getState?.();test('player state',!!p&&typeof p.level==='number'&&typeof p.cash==='number'&&typeof p.xp==='number');
    const c=window.TGGCareer?.career;test('career state',!!c&&typeof c.studioLevel==='number'&&typeof c.reputation==='number');
    const content=window.TGGContent?.content;test('content missions',Array.isArray(content?.missions)&&content.missions.length>=3);test('content progression',typeof window.TGGContent?.advance==='function'&&typeof window.TGGContent?.start==='function');
    test('expansion activities',Array.isArray(window.TGGExpansion?.activities)&&window.TGGExpansion.activities.length>=3);
    test('progression catalog',Array.isArray(window.TGGProgression?.achievements)&&window.TGGProgression.achievements.length>=7);test('progression state',Array.isArray(window.TGGProgression?.state?.unlocked));test('progression sync',typeof window.TGGProgression?.sync==='function');
    test('chain catalog',Array.isArray(window.TGGChains?.chains)&&window.TGGChains.chains.length>=2);test('chain ui',typeof window.TGGChainUI?.start==='function');
    test('district catalog',Array.isArray(window.TGGDistricts?.districts)&&window.TGGDistricts.districts.length>=3);test('district access',typeof window.TGGDistricts?.canEnter==='function');
    test('save validator',typeof window.TGGSave?.report==='function'&&typeof window.TGGSave?.repair==='function');
    test('inventory catalog',Array.isArray(window.TGGInventory?.catalog)&&window.TGGInventory.catalog.length>=4);test('inventory persistence',typeof window.TGGInventory?.save==='function'&&typeof window.TGGInventory?.load==='function');
    test('crew catalog',Array.isArray(window.TGGCrew?.catalog)&&window.TGGCrew.catalog.length>=3);test('crew persistence',typeof window.TGGCrew?.save==='function'&&typeof window.TGGCrew?.load==='function');test('crew bonus',typeof window.TGGCrew?.bonus==='function');
    test('events catalog',Array.isArray(window.TGGEvents?.events)&&window.TGGEvents.events.length>=3);test('events persistence',typeof window.TGGEvents?.save==='function'&&typeof window.TGGEvents?.load==='function');test('events run',typeof window.TGGEvents?.run==='function');
    const economy=window.TGGEconomy?.reward?.({cash:100,xp:25,rep:5});test('economy normalization',!!economy&&economy.cash>=100&&economy.xp>=25&&economy.rep>=5&&economy.crew&&economy.crew.cash>=0,'shared reward normalization available');
    const integrity=window.TGGV12IntegrityResult||window.TGGV12Integrity?.run?.();test('v12 integrity',!!integrity?.passed);
    test('bridge snapshot',typeof window.TGGBridge?.snapshot==='function');
    const passed=checks.every(x=>x.pass);window.TGGReleaseQA={checks,passed,run};return window.TGGReleaseQA;
  }
  window.TGGReleaseQA={checks,passed:false,run};
})();
