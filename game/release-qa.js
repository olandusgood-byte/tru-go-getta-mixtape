(() => {
  const checks=[];
  const test=(name,pass,detail='')=>checks.push({name,pass:!!pass,detail});
  function run(){
    checks.length=0;
    test('game api',!!window.TGGGame);
    test('career api',!!window.TGGCareer);
    test('content api',!!window.TGGContent);
    test('expansion api',!!window.TGGExpansion);
    ['menu','creator','game','career','contentBoard','expansionBoard','pause','hud'].forEach(id=>test('dom:'+id,!!document.getElementById(id)));
    ['newGame','continueGame','startGame','missionBtn','careerBtn','contentBtn','saveBtn','pauseBtn','resumeBtn','menuBtn','expansionBtn'].forEach(id=>test('control:'+id,!!document.getElementById(id)));
    test('local storage',typeof localStorage!=='undefined');
    const p=window.TGGGame?.getState?.();
    test('player state',!!p&&typeof p.level==='number'&&typeof p.cash==='number'&&typeof p.xp==='number');
    const passed=checks.every(x=>x.pass);
    window.TGGReleaseQA={checks,passed,run};
    return window.TGGReleaseQA;
  }
  window.TGGReleaseQA={checks,passed:false,run};
})();
