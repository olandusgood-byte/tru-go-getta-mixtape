(() => {
  const checks=[]; const test=(name,pass,detail='')=>checks.push({name,pass:!!pass,detail});
  function run(){
    checks.length=0;
    test('game api',!!window.TGGGame);test('career api',!!window.TGGCareer);test('content api',!!window.TGGContent);test('expansion api',!!window.TGGExpansion);test('progression api',!!window.TGGProgression);test('bridge api',!!window.TGGBridge);test('chain api',!!window.TGGChains);test('district api',!!window.TGGDistricts);test('save api',!!window.TGGSave);
    ['menu','creator','game','career','contentBoard','expansionBoard','progressionBoard','bridge','pause','hud'].forEach(id=>test('dom:'+id,!!document.getElementById(id)));
    ['newGame','continueGame','startGame','missionBtn','careerBtn','contentBtn','advanceContentBtn','expansionBtn','progressionBtn','bridgeBtn','chainBtn','saveBtn','pauseBtn','resumeBtn','menuBtn','recordBtn','mixtapeBtn','upgradeBtn'].forEach(id=>test('control:'+id,!!document.getElementById(id)));
    test('local storage',typeof localStorage!=='undefined');
    const p=window.TGGGame?.getState?.();test('player state',!!p&&typeof p.level==='number'&&typeof p.cash==='number'&&typeof p.xp==='number');
    const c=window.TGGCareer?.career;test('career state',!!c&&typeof c.studioLevel==='number'&&typeof c.reputation==='number');
    const content=window.TGGContent?.content;test('content missions',Array.isArray(content?.missions)&&content.missions.length>=3);test('content progression',typeof window.TGGContent?.advance==='function'&&typeof window.TGGContent?.start==='function');
    test('expansion activities',Array.isArray(window.TGGExpansion?.activities)&&window.TGGExpansion.activities.length>=3);
    test('progression catalog',Array.isArray(window.TGGProgression?.achievements)&&window.TGGProgression.achievements.length>=7);test('progression state',Array.isArray(window.TGGProgression?.state?.unlocked));test('progression sync',typeof window.TGGProgression?.sync==='function');
    test('chain catalog',Array.isArray(window.TGGChains?.chains)&&window.TGGChains.chains.length>=2);test('chain ui',typeof window.TGGChainUI?.start==='function');
    test('district catalog',Array.isArray(window.TGGDistricts?.districts)&&window.TGGDistricts.districts.length>=3);test('district access',typeof window.TGGDistricts?.canEnter==='function');
    test('save validator',typeof window.TGGSave?.report==='function'&&typeof window.TGGSave?.repair==='function');
    const integrity=window.TGGV12Integrity?.run?.();test('v12 integrity',!!integrity?.passed);
    test('bridge snapshot',typeof window.TGGBridge?.snapshot==='function');
    const passed=checks.every(x=>x.pass);window.TGGReleaseQA={checks,passed,run};return window.TGGReleaseQA;
  }
  window.TGGReleaseQA={checks,passed:false,run};
})();
