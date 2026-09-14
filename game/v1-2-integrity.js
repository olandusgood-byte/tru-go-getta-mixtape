(() => {
  const REQUIRED=['TGGGame','TGGCareer','TGGContent','TGGExpansion','TGGProgression','TGGChains','TGGDistricts','TGGSave'];
  function run(){
    const missing=REQUIRED.filter(k=>!window[k]);
    const save=window.TGGSave?.report?.()||{valid:false};
    const chains=window.TGGChains?.chains||[];
    const districts=window.TGGDistricts?.districts||[];
    const result={missing,apis:missing.length===0,saveValid:!!save.valid,chains:chains.length>=2,districts:districts.length>=3,passed:missing.length===0&&!!save.valid&&chains.length>=2&&districts.length>=3};
    window.TGGV12IntegrityResult=result;
    return result;
  }
  window.TGGV12Integrity={run};
  window.TGGV12Integrity.run();
  const loadDaily=()=>{if(document.querySelector('script[data-tgg-daily]'))return;const s=document.createElement('script');s.src='daily.js';s.dataset.tggDaily='1';s.onload=()=>window.TGGDaily?.install?.();document.body.appendChild(s)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadDaily);else loadDaily();
})();
