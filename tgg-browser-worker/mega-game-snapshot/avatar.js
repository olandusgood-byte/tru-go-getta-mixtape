(() => {
  const KEY='tgg-avatar-v1';
  const defaults={skin:'#8b5a3c',hair:'fade',top:'hoodie',bottom:'joggers',shoes:'high-tops',hat:'none',chain:'gold',accent:'#c7ff00',gender:'street'};
  let avatar={...defaults};
  const $=id=>document.getElementById(id);
  function load(){try{avatar={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}}
  function save(){localStorage.setItem(KEY,JSON.stringify(avatar)); renderPreview(); renderMini(); if(window.TGGGame?.refresh)window.TGGGame.refresh();}
  function set(k,v){avatar[k]=v;save();}
  function renderPreview(){
    const root=$('avatarFigure'); if(!root)return;
    root.innerHTML='<div class="avatar-shadow"></div><div class="avatar-body"><div class="avatar-head"><div class="avatar-hair '+avatar.hair+'"></div><div class="avatar-face"></div><div class="avatar-hat '+avatar.hat+'"></div></div><div class="avatar-neck"></div><div class="avatar-torso '+avatar.top+'"><div class="avatar-chain '+avatar.chain+'"></div></div><div class="avatar-legs '+avatar.bottom+'"><i></i><i></i></div><div class="avatar-feet '+avatar.shoes+'"><i></i><i></i></div></div>';
    root.style.setProperty('--skin',avatar.skin);root.style.setProperty('--accent',avatar.accent);
  }
  function renderMini(){
    const root=$('player'); if(!root)return;
    root.innerHTML='<div class="mini-avatar"><span class="mini-head"></span><span class="mini-body"></span><span class="mini-legs"></span></div>';
    root.style.setProperty('--skin',avatar.skin);root.style.setProperty('--accent',avatar.accent);
  }
  function bind(){
    document.querySelectorAll('[data-avatar]').forEach(el=>el.addEventListener('click',()=>set(el.dataset.avatar,el.dataset.value)));
    $('avatarBack')?.addEventListener('click',()=>window.TGGGame?.show('game'));
    $('avatarDone')?.addEventListener('click',()=>{save();window.TGGGame?.show('game');window.__tggToast?.('LOOK SAVED');});
    $('rotateLeft')?.addEventListener('click',()=>rotate(-12));$('rotateRight')?.addEventListener('click',()=>rotate(12));
    const fig=$('avatarFigure'); let down=false,last=0;
    fig?.addEventListener('pointerdown',e=>{down=true;last=e.clientX;fig.setPointerCapture?.(e.pointerId)});
    fig?.addEventListener('pointermove',e=>{if(!down)return;const d=e.clientX-last;last=e.clientX;rotate(d*.65)});
    fig?.addEventListener('pointerup',()=>down=false);fig?.addEventListener('pointercancel',()=>down=false);
  }
  function rotate(d){const f=$('avatarFigure');if(!f)return;let r=Number(f.dataset.rot||0)+d;f.dataset.rot=r;f.style.setProperty('--rot',r+'deg');f.style.setProperty('--spin',r+'deg');}
  load();window.TGGAvatar={get:()=>({...avatar}),set,save,load,open:()=>window.TGGGame?.show('avatar'),renderMini,renderPreview};bind();renderPreview();renderMini();
})();