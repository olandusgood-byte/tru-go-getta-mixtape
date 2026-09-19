(() => {
  const requiredScreens=['menu','creator','avatar','game','pause','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','worldLifeBoard','storyMissionsBoard','bridge','park','studio','shops','home','media','garage','businessBoard'];
  const requiredButtons=['newGame','continueGame','startGame','avatarStart','avatarDone','avatarBack','missionBtn','vehicleBtn','interact3dBtn','camera3dBtn','driftBtn','hornBtn','characterBtn','studioBtn','parkBtn','shopsBtn','homeBtn','mediaBtn','businessBtn','garageBtn','careerBtn','eventsBtn','worldLifeBtn','storyMissionsBtn','contentBtn','expansionBtn','progressionBtn','inventoryBtn','crewBtn','bridgeBtn','saveBtn','pauseBtn','careerBack','careerDirectorGo','contentBack','worldLifeBack','storyMissionBack','storyMissionAction','bridgeBack','resumeBtn','menuBtn','garageBack','studioBack','parkBack','shopsBack','homeBack','mediaBack'];
  const requiredApiPaths=[
    ['TGGGame','getState'],['TGGGame','getActiveScreen'],['TGGGame','show'],['TGGGame','save'],['TGGGame','load'],['TGGGame','reward'],['TGGGame','spend'],['TGGGame','move'],['TGGGame','driveVehicle'],['TGGGame','setDriveKey'],['TGGGame','getDrivingState'],['TGGGame','setDriveTuning'],['TGGGame','getDriveTuning'],['TGGGame','setWalkKey'],['TGGGame','getWalkingState'],['TGGGame','setWalkTuning'],['TGGGame','getWalkTuning'],['TGGGame','horn'],['TGGGame','toggleVehicle'],
    ['TGG3D','isReady'],['TGG3D','nearbyDestination'],['TGG3D','interactNearest'],['TGG3D','cycleCamera'],['TGG3D','setCameraMode'],['TGG3D','getCameraMode'],['TGG3D','setVehicleDynamics'],['TGG3D','setPlayerDynamics'],['TGG3D','setCarAppearance'],
    ['TGGStoryMissions','status'],['TGGStoryMissions','sync'],['TGGStoryMissions','doCurrent'],['TGGStoryMissions','navigationTarget'],['TGGStoryMissions','start'],['TGGStoryMissions','startChapter2'],['TGGStoryMissions','startChapter3'],
    ['TGGStoryWorld3D','getStatus'],['TGGStoryWorld3D','isNearTarget'],
    ['TGGStreetPresence','getStatus'],['TGGStreetPresence','setDensity'],['TGGStreetPresence','getDensity'],
    ['TGGCrowdPresentation','getStatus'],['TGGCrowdPresentation','getFocus'],
    ['TGGVerticalSlice','checkpoint'],['TGGVerticalSlice','getState'],['TGGVerticalSlice','setQuality'],['TGGVerticalSlice','setInput']
  ];

  const getPath=(root,path)=>path.reduce((v,k)=>v?.[k],root);
  function run(){
    const checks=[];
    const add=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail:String(detail??'')});

    requiredScreens.forEach(id=>{
      const el=document.getElementById(id);
      add('screen:'+id+':exists',!!el);
      add('screen:'+id+':screen-class',!!el?.classList.contains('screen'));
      add('screen:'+id+':unique',document.querySelectorAll('#'+CSS.escape(id)).length===1,document.querySelectorAll('#'+CSS.escape(id)).length);
    });

    requiredButtons.forEach(id=>{
      const el=document.getElementById(id);
      add('button:'+id+':exists',!!el);
      add('button:'+id+':is-button',el?.tagName==='BUTTON');
      add('button:'+id+':label',!!el?.textContent?.trim(),el?.textContent?.trim()||'');
    });

    requiredApiPaths.forEach(([root,method])=>{
      const obj=window[root];
      add('api:'+root+'.'+method,typeof obj?.[method]==='function',typeof obj?.[method]);
    });

    const story=window.TGGStoryMissions;
    const chapters=story?.chapters||{};
    const chapterDefs=[
      ['firstContract',6],
      ['cityBuzz',10],
      ['cityTakeover',8]
    ];
    chapterDefs.forEach(([key,count])=>{
      const steps=Array.isArray(chapters[key])?chapters[key]:[];
      add('story:'+key+':array',Array.isArray(chapters[key]));
      add('story:'+key+':count',steps.length===count,steps.length);
      const ids=new Set();
      steps.forEach((step,i)=>{
        add('story:'+key+':'+i+':id',typeof step?.id==='string'&&step.id.length>0,step?.id);
        add('story:'+key+':'+i+':title',typeof step?.title==='string'&&step.title.length>=3,step?.title);
        add('story:'+key+':'+i+':detail',typeof step?.detail==='string'&&step.detail.length>=8,step?.detail);
        add('story:'+key+':'+i+':id-unique',!ids.has(step?.id),step?.id);
        ids.add(step?.id);
        if(step?.target){
          add('story:'+key+':'+i+':target-x',Number.isFinite(Number(step.target.x)),step.target.x);
          add('story:'+key+':'+i+':target-y',Number.isFinite(Number(step.target.y)),step.target.y);
          add('story:'+key+':'+i+':target-radius',Number(step.target.radius)>=4&&Number(step.target.radius)<=12,step.target.radius);
          add('story:'+key+':'+i+':target-label',typeof step.target.label==='string'&&step.target.label.length>=3,step.target.label);
        }
      });
    });

    const destinations=Array.isArray(window.TGG3D?.destinations)?window.TGG3D.destinations:[];
    add('world:destinations:count',destinations.length>=6,destinations.length);
    destinations.forEach((d,i)=>{
      add('world:destination:'+i+':id',typeof d?.id==='string'&&d.id.length>0,d?.id);
      add('world:destination:'+i+':label',typeof d?.label==='string'&&d.label.length>2,d?.label);
      add('world:destination:'+i+':coords',Number.isFinite(Number(d?.x))&&Number.isFinite(Number(d?.z)),(d?.x)+','+(d?.z));
      add('world:destination:'+i+':group',!!d?.group);
      add('world:destination:'+i+':marker',!!d?.marker);
    });

    const contacts=Array.isArray(window.TGGStoryWorld3D?.contacts)?window.TGGStoryWorld3D.contacts:[];
    add('world:contacts:minimum',contacts.length>=4,contacts.length);
    contacts.forEach((c,i)=>{
      add('world:contact:'+i+':id',typeof c?.id==='string'&&c.id.length>0,c?.id);
      add('world:contact:'+i+':name',typeof c?.name==='string'&&c.name.length>0,c?.name);
      add('world:contact:'+i+':role',typeof c?.role==='string'&&c.role.length>0,c?.role);
      add('world:contact:'+i+':coords',Number.isFinite(Number(c?.x))&&Number.isFinite(Number(c?.y)),(c?.x)+','+(c?.y));
      add('world:contact:'+i+':group',!!c?.group);
    });

    const presence=window.TGGStreetPresence;
    const presenceStatus=presence?.getStatus?.()||{};
    add('street:runtime-ready',presenceStatus.ready===true,JSON.stringify(presenceStatus));
    add('street:citizen-pool',Array.isArray(presence?.citizens)&&presence.citizens.length===14,presence?.citizens?.length);
    add('street:social-pool',Array.isArray(presence?.socialPeople)&&presence.socialPeople.length===8,presence?.socialPeople?.length);
    add('street:activity-nodes',Array.isArray(presence?.activityNodes)&&presence.activityNodes.length===4,presence?.activityNodes?.length);
    add('street:density-valid',['LOW','MEDIUM','HIGH'].includes(presenceStatus.density),presenceStatus.density);
    add('street:population-minimum',Number(presenceStatus.totalStreetPopulation)>=16,presenceStatus.totalStreetPopulation);
    add('street:district-state',typeof presenceStatus.activeDistrict==='string'&&presenceStatus.activeDistrict.length>0,presenceStatus.activeDistrict);

    const crowd=window.TGGCrowdPresentation;
    const crowdStatus=crowd?.getStatus?.()||{};
    add('crowd:runtime-ready',crowdStatus.ready===true,JSON.stringify(crowdStatus));
    add('crowd:fan-pool',Array.isArray(crowd?.fans)&&crowd.fans.length===12,crowd?.fans?.length);
    add('crowd:clusters',Array.isArray(crowd?.clusters)&&crowd.clusters.length===4,crowd?.clusters?.length);
    add('crowd:visible-fans',Number(crowdStatus.visibleFans)>=4,crowdStatus.visibleFans);
    add('crowd:accessories',Number(crowdStatus.accessories)>=20,crowdStatus.accessories);
    add('crowd:street-phones',Number(crowdStatus.streetPhones)>=4,crowdStatus.streetPhones);
    add('crowd:total-presented',Number(crowdStatus.totalPresented)>=20,crowdStatus.totalPresented);

    const scripts=[...document.scripts].map(s=>(s.getAttribute('src')||'').split('/').pop()).filter(Boolean);
    ['game.js','game-3d.js','navigation.js','gamepad.js','final-build.js','career.js','career-director.js','world-life.js','story-missions.js','story-cinematics.js','story-world-3d.js','street-presence.js','crowd-presentation.js','vertical-slice-director.js'].forEach(file=>{
      add('script:'+file,scripts.includes(file),scripts.join(','));
    });

    const uniqueIds=new Set();
    let duplicateCount=0;
    document.querySelectorAll('[id]').forEach(el=>{if(uniqueIds.has(el.id))duplicateCount++;uniqueIds.add(el.id)});
    add('dom:no-duplicate-ids',duplicateCount===0,duplicateCount);
    add('dom:city3d-host',!!document.getElementById('city3d'));
    add('dom:radar-host',!!document.getElementById('radar3d'));
    add('dom:nav-hud',!!document.getElementById('navHud'));
    add('dom:vehicle-hud',!!document.getElementById('vehicleHud'));
    add('dom:player-hud',!!document.getElementById('playerMoveHud'));
    add('dom:story-director',!!document.getElementById('sliceDirector'));

    const game=window.TGGGame?.getState?.();
    add('state:game-object',!!game&&typeof game==='object');
    ['x','y','cash','xp','level','heading'].forEach(k=>add('state:game:'+k,Number.isFinite(Number(game?.[k])),game?.[k]));
    add('state:game:vehicle-boolean',typeof game?.inVehicle==='boolean',typeof game?.inVehicle);
    add('state:game:automode',game?.autoMode===true,game?.autoMode);

    const walk=window.TGGGame?.getWalkingState?.();
    ['vx','vy','speed'].forEach(k=>add('state:walk:'+k,Number.isFinite(Number(walk?.[k])),walk?.[k]));
    add('state:walk:sprinting',typeof walk?.sprinting==='boolean',typeof walk?.sprinting);

    const drive=window.TGGGame?.getDrivingState?.();
    ['speed','steer'].forEach(k=>add('state:drive:'+k,Number.isFinite(Number(drive?.[k])),drive?.[k]));
    add('state:drive:braking',typeof drive?.braking==='boolean',typeof drive?.braking);
    add('state:drive:handbrake',typeof drive?.handbrake==='boolean',typeof drive?.handbrake);

    const slice=window.TGGVerticalSlice?.getState?.();
    add('slice:state',!!slice&&typeof slice==='object');
    add('slice:input',typeof slice?.input==='string',slice?.input);
    add('slice:quality',['HIGH','BALANCED','PERF'].includes(slice?.quality),slice?.quality);
    add('slice:fps',Number.isFinite(Number(slice?.fps)),slice?.fps);

    const activeScreens=[...document.querySelectorAll('.screen.active')];
    add('dom:single-active-screen',activeScreens.length===1,activeScreens.map(x=>x.id).join(','));

    const summary={
      total:checks.length,
      passed:checks.filter(x=>x.pass).length,
      failed:checks.filter(x=>!x.pass).length,
      ok:checks.every(x=>x.pass),
      checks,
      updatedAt:new Date().toISOString()
    };
    window.__TGG_MEGA_QA_LAST__=summary;
    return summary;
  }

  window.TGGMegaQA={run};
})();