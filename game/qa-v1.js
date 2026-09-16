(() => {
  const checks=[]; const ok=(name,test)=>{try{checks.push({name,pass:!!test()})}catch(e){checks.push({name,pass:false,error:String(e)})}};
  ok('core state exposed',()=>!!window.TGGGame?.getState);
  ok('career module loaded',()=>!!window.TGGCareer?.career);
  ok('content module loaded',()=>!!window.TGGContent?.content?.missions?.length);
  ok('mission board wired',()=>!!document.querySelector('[data-mission="flyer-run"]'));
  ok('career actions wired',()=>!!document.getElementById('recordBtn')&&!!document.getElementById('upgradeBtn'));
  window.TGGQA={checks,run:()=>checks};
  console.table(checks);
})();
