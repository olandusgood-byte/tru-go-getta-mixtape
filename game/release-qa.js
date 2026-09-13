(() => {
  const checks=[]; const test=(name,pass,detail='')=>checks.push({name,pass:!!pass,detail});
  function run(){
    checks.length=0;
    test('game api',!!window.TGGGame);test('career api',!!window.TGGCareer);test('content api',!!window.TGGContent);test('expansion api',!!window.TGGExpansion);test('bridge api',!!window.TGGBridge);
    ['menu','creator','game','career','contentBoard','expansionBoard','bridge','pause','hud'].forEach(id=>test('dom:'+id,!!document.getElementById(id)));
    ['newGame','continueGame','startGame','missionBtn','careerBtn','contentBtn','expansionBtn','bridgeBtn','saveBtn','pauseBtn','resumeBtn','menuBtn','recordBtn','mixtapeBtn','upgradeBtn'].forEach(id=>test('control:'+id,!!document.getElementById(id)));
    test('local storage',typeof localStorage!=='undefined');
    const p=window.TGGGame?.getState?.();test('player state',!!p&&typeof p.level==='number'&&typeof p.cash==='number'&&typeof p.xp==='number');
    const c=window.TGGCareer?.career;test('career state',!!c&&typeof c.studioLevel==='number'&&typeof c.reputation==='number');
    test('expansion activities',Array.isArray(window.TGGExpansion?.activities)&&window.TGGExpansion.activities.length>=3);
    const passed=checks.every(x=>x.pass);window.TGGReleaseQA={checks,passed,run};return window.TGGReleaseQA;
  }
  window.TGGReleaseQA={checks,passed:false,run};
})();
