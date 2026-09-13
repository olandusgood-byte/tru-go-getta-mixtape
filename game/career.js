(() => {
  const CAREER_KEY='tgg-career-v1';
  const $=id=>document.getElementById(id);
  const career={studioLevel:1,reputation:0,recordings:0,mixtapes:0,upgrades:0,unlocks:['Bedroom Studio'],cash:0};
  function loadCareer(){try{Object.assign(career,JSON.parse(localStorage.getItem(CAREER_KEY)||'{}'))}catch(e){}}
  function saveCareer(){localStorage.setItem(CAREER_KEY,JSON.stringify(career))}
  function rep(n){career.reputation+=n;while(career.reputation>=100*career.studioLevel){career.reputation-=100*career.studioLevel;career.studioLevel++;career.upgrades++;career.unlocks.push(career.studioLevel===2?'Professional Studio':`Studio Level ${career.studioLevel}`);notify('CAREER LEVEL UP — '+career.studioLevel)}saveCareer();renderCareer()}
  function notify(t){if(window.__tggToast){window.__tggToast(t)}else console.log(t)}
  function renderCareer(){const el=$('careerStats');if(!el)return;el.innerHTML=`<b>Studio LVL ${career.studioLevel}</b><span>REP ${career.reputation}</span><span>RECORDINGS ${career.recordings}</span><span>MIXTAPES ${career.mixtapes}</span><span>UPGRADES ${career.upgrades}</span>`}
  window.TGGCareer={career,addRep:rep,record(){career.recordings++;rep(25);notify('TRACK RECORDED +25 REP')},mixtape(){if(career.recordings<3){notify('RECORD 3 TRACKS FIRST');return}career.mixtapes++;rep(75);notify('MIXTAPE RELEASED +75 REP')},upgrade(){const cost=250*career.studioLevel;const s=window.TGGGame?.getState?.();if(!s||s.cash<cost){notify('NOT ENOUGH CASH — $'+cost+' NEEDED');return}s.cash-=cost;career.upgrades++;saveCareer();window.TGGGame?.save?.();rep(10);window.TGGGame?.refresh?.();notify('STUDIO UPGRADED')}};
  loadCareer();document.addEventListener('DOMContentLoaded',()=>renderCareer());
})();
