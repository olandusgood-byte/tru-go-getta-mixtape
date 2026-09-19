(()=>{
  const VERSION='V2.46 TGG CONSEQUENCE + RELATIONSHIP WORLD 100';
  const manager={
    smart:{tier:'TRUSTED',perk:'NEGOTIATOR',route:'business',summary:'Calculated moves unlock higher-value planning routes.'},
    bold:{tier:'TRUSTED',perk:'HEADLINER',route:'events',summary:'Aggressive momentum unlocks faster public opportunities.'},
    loyal:{tier:'TRUSTED',perk:'INNER CIRCLE',route:'crew',summary:'Team-first choices strengthen crew and contact routes.'}
  };
  const kane={
    melodic:{tier:'TRUSTED',perk:'HOOK ARCHITECT',profile:'cinematic',summary:'Melodic identity pushes emotional studio presentation.'},
    street:{tier:'TRUSTED',perk:'STREET PRESSURE',profile:'street',summary:'Street identity pushes hard drums and direct performance energy.'},
    experimental:{tier:'TRUSTED',perk:'SOUND LAB',profile:'studio',summary:'Experimental identity unlocks unusual studio direction.'}
  };
  const director={
    story:{tier:'TRUSTED',perk:'STORYBOARD',preset:'cinematic',summary:'Story visuals prioritize cinematic treatment and narrative framing.'},
    performance:{tier:'TRUSTED',perk:'LIVE LENS',preset:'stage',summary:'Performance visuals prioritize stage energy and movement.'},
    luxury:{tier:'TRUSTED',perk:'PREMIUM FRAME',preset:'showcase',summary:'Lifestyle visuals prioritize polish, status and premium framing.'}
  };
  function resolve(v245={}){
    const choices=v245.choices||{};
    const rel=v245.relationships||{};
    const m=manager[choices.manager]||null,k=kane[choices.kane]||null,d=director[choices.director]||null;
    const relationshipTiers={
      manager:{score:Number(rel.manager?.score)||0,tier:(Number(rel.manager?.score)||0)>=60?'TRUSTED':'NEW'},
      kane:{score:Number(rel.kane?.score)||0,tier:(Number(rel.kane?.score)||0)>=60?'TRUSTED':'NEW'},
      director:{score:Number(rel.director?.score)||0,tier:(Number(rel.director?.score)||0)>=60?'TRUSTED':'NEW'}
    };
    const identity=v245.identity||{};
    const arc=(identity.career&&identity.sound&&identity.visual)?{
      id:'blueprint-season',
      title:'BLUEPRINT SEASON',
      detail:'Turn your career strategy, sound identity and visual language into the next city run.',
      route:m?.route||'career',
      studioProfile:k?.profile||'street',
      cameraPreset:d?.preset||'cinematic',
      ready:true
    }:null;
    return {
      version:VERSION,
      manager:m,kane:k,director:d,
      relationshipTiers,
      identity:{career:identity.career||null,sound:identity.sound||null,visual:identity.visual||null},
      arc
    };
  }
  const api={version:VERSION,layers:100,resolve,definitions:{manager,kane,director}};
  globalThis.TGGV246Core=api;if(typeof window!=='undefined')window.TGGV246Core=api;
})();