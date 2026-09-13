(() => {
  const REQUIRED=['TGGGame','TGGCareer','TGGContent','TGGExpansion','TGGProgression','TGGChains','TGGDistricts','TGGSave'];
  function run(){
    const missing=REQUIRED.filter(k=>!window[k]);
    const save=window.TGGSave?.report?.()||{valid:false};
    const chains=window.TGGChains?.chains||[];
    const districts=window.TGGDistricts?.districts||[];
    const result={missing,apis:missing.length===0,saveValid:!!save.valid,chains:chains.length>=2,districts:districts.length>=3,passed:missing.length===0&&!!save.valid&&chains.length>=2&&districts.length>=3};
    window.TGGV12Integrity=result;
    return result;
  }
  window.TGGV12Integrity={run};
})();
