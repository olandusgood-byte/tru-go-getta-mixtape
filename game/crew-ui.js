(() => {
  function sync(){window.TGGCrew?.render()}
  document.getElementById('crewBtn')?.addEventListener('click',()=>{document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById('crewBoard')?.classList.add('active');sync()});
  document.getElementById('crewBack')?.addEventListener('click',()=>window.TGGGame?.show('game'));
  window.TGGCrewUI={sync};
})();
