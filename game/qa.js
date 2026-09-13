(() => {
  const report=[];
  const pass=(name,detail)=>report.push({name,status:'PASS',detail});
  const fail=(name,detail)=>report.push({name,status:'FAIL',detail});
  const check=(name,condition,detail)=>condition?pass(name,detail):fail(name,detail);
  function run(){
    report.length=0;
    check('localStorage','localStorage' in window,'browser persistence available');
    check('game-api',!!window.TGGGame,'main game API available');check('career-api',!!window.TGGCareer,'career API available');check('content-api',!!window.TGGContent,'content API available');check('expansion-api',!!window.TGGExpansion,'city expansion API available');check('progression-api',!!window.TGGProgression,'progression API available');check('bridge-api',!!window.TGGBridge,'website bridge API available');
    check('chain-api',!!window.TGGChains&&typeof window.TGGChains.start==='function','mission chain API available');check('chain-ui',!!window.TGGChainUI&&typeof window.TGGChainUI.start==='function','mission chain UI available');check('district-api',!!window.TGGDistricts&&typeof window.TGGDistricts.canEnter==='function','district progression API available');check('save-api',!!window.TGGSave&&typeof window.TGGSave.repair==='function','save validator available');
    ['menu','creator','game','career','contentBoard','expansionBoard','progressionBoard','bridge','pause','hud'].forEach(id=>check(id,!!document.getElementById(id),'required screen/control host exists'));
    ['missionBtn','saveBtn','careerBtn','contentBtn','advanceContentBtn','expansionBtn','progressionBtn','bridgeBtn','chainBtn'].forEach(id=>check(id,!!document.getElementById(id),'required action exists'));
    check('content-start',typeof window.TGGContent?.start==='function','content start API available');check('content-advance',typeof window.TGGContent?.advance==='function','content advance API available');check('expansion-run',typeof window.TGGExpansion?.run==='function','expansion run API available');check('progression-sync',typeof window.TGGProgression?.sync==='function','progression sync API available');check('progression-achievements',Array.isArray(window.TGGProgression?.achievements)&&window.TGGProgression.achievements.length>=7,'achievement catalog available');check('bridge-snapshot',typeof window.TGGBridge?.snapshot==='function','bridge snapshot API available');
    check('district-catalog',Array.isArray(window.TGGDistricts?.districts)&&window.TGGDistricts.districts.length>=3,'district catalog available');
    const integrity=window.TGGV12Integrity?.run?.();check('v12-integrity',!!integrity?.passed,'V1.2 integrity gate passes');
    const bad=report.filter(x=>x.status==='FAIL');window.TGGQA={report,passed:bad.length===0,repair(){window.TGGSave?.repair?.();return !!document.getElementById('hud')&&!!window.TGGGame&&!!window.TGGProgression&&!!window.TGGChains&&!!window.TGGDistricts&&!!window.TGGSave}};return window.TGGQA;
  }
  window.TGGQA={run};
})();
