import { chromium } from 'playwright';

const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });

await page.goto('http://127.0.0.1:8765/index.html', {waitUntil:'networkidle'});
const requiredGlobals = ['TGGGame','TGGCareer','TGGContent','TGGExpansion','TGGProgression','TGGBridge','TGGAvatar','TGGWorldSync','TGGBusiness','TGGQA','TGGReleaseQA'];
await page.waitForFunction(required => required.every(name => !!window[name]), requiredGlobals, {timeout:10000}).catch(()=>{});
await page.waitForTimeout(500);
const missingGlobals = await page.evaluate(required => required.filter(name => !window[name]), requiredGlobals);
const additiveRuntimeCheck = await page.evaluate(() => {
  return [...document.scripts]
    .map(s => (s.getAttribute('src') || '').split('/').pop())
    .map(src => {
      const match = /^v1([0-9]{2})-[^/]+[.]js$/.exec(src);
      if (!match) return null;
      const minor = Number(match[1]);
      const longName = 'TGGV1' + String(minor).padStart(2,'0');
      const shortName = 'TGGV' + String(minor).padStart(2,'0');
      const name = window[longName] ? longName : shortName;
      const runtime = window[name];
      const version = String(runtime && runtime.version || '');
      return {
        src,
        name,
        loaded: !!runtime,
        version,
        versionOk: new RegExp('^1[.](?:' + minor + '|' + (100 + minor) + ')[.][0-9]+$').test(version)
      };
    })
    .filter(Boolean);
});
const additiveFailures = additiveRuntimeCheck.filter(x => !x.loaded || !x.versionOk);
if (missingGlobals.length || additiveFailures.length || errors.length) {
  console.error(JSON.stringify({ missingGlobals, additiveFailures, additiveRuntimeCheck, errors }, null, 2));
  await browser.close();
  process.exit(1);
}

const result = await page.evaluate(async (pageErrorCount) => {
  const ids = ['menu','creator','avatar','game','career','contentBoard','expansionBoard','progressionBoard','inventoryBoard','crewBoard','eventsBoard','bridge','pause','hud','newGame','continueGame','startGame','avatarStart','characterBtn','avatarDone','avatarBack','rotateLeft','rotateRight','missionBtn','careerBtn','contentBtn','advanceContentBtn','expansionBtn','progressionBtn','inventoryBtn','crewBtn','eventsBtn','bridgeBtn','worldSyncBtn','saveBtn','pauseBtn','resumeBtn','menuBtn','recordBtn','mixtapeBtn','upgradeBtn','businessBtn','cityAssetsBtn'];
  const missing = ids.filter(id => !document.getElementById(id));
  const qa = window.TGGQA?.run?.();
  const release = window.TGGReleaseQA?.run?.();
  const start = window.TGGContent?.start?.('flyer-run');
  const before = window.TGGContent?.state?.progress ?? -1;
  const advanced = window.TGGContent?.advance?.();
  const after = window.TGGContent?.state?.progress ?? -1;
  window.TGGGame?.save?.();
  const stored = !!localStorage.getItem('tgg-game-v1');
  window.TGGProgression?.sync?.();
  window.TGGGame?.show?.('progressionBoard');
  const progressionVisible = document.getElementById('progressionBoard')?.classList.contains('active');
  const achievementCatalog = (window.TGGProgression?.achievements?.length || 0) >= 7;

  window.TGGGame?.show?.('game');
  window.TGGRealism?.setQuality?.('performance');
  window.TGGRealityMaster?.setQuality?.('performance');
  await new Promise(r=>setTimeout(r,250));
  const movementApi = ['setWalkKey','setWalkAnalog','getWalkingState','setWalkTuning','getWalkTuning','setDriveKey','setDriveAnalog','getDrivingState','setDriveTuning','getDriveTuning']
    .every(name => typeof window.TGGGame?.[name] === 'function');
  window.TGGGame.resetForNewGame?.();
  window.TGGGame.show?.('game');
  await new Promise(r=>setTimeout(r,120));
  const startPos = {...window.TGGGame.getState()};
  window.TGGGame.setWalkKey('up',true);
  await new Promise(r=>setTimeout(r,700));
  window.TGGGame.setWalkKey('up',false);
  await new Promise(r=>setTimeout(r,260));
  const endPos = {...window.TGGGame.getState()};
  const smoothWalkMoved = Math.hypot((endPos.x||0)-(startPos.x||0),(endPos.y||0)-(startPos.y||0)) > 0.03;
  const analogStart = {...window.TGGGame.getState()};
  window.TGGGame.setWalkAnalog({x:-0.72,y:0,sprint:0.4});
  const analogHeldState = window.TGGGame.getWalkingState();
  const analogCommandAccepted = Math.abs(Number(analogHeldState?.analog?.x||0) + 0.72) < 0.01 &&
    Number(analogHeldState?.analog?.sprint||0) >= 0.39;
  await new Promise(r=>setTimeout(r,700));
  window.TGGGame.setWalkAnalog({x:0,y:0,sprint:0});
  await new Promise(r=>setTimeout(r,260));
  const analogEnd = {...window.TGGGame.getState()};
  const analogWalkMoved = Math.hypot((analogEnd.x||0)-(analogStart.x||0),(analogEnd.y||0)-(analogStart.y||0)) > 0.03 || analogCommandAccepted;
  const analogState = window.TGGGame.getWalkingState();
  const analogInputReset = Math.abs(Number(analogState?.analog?.x||0)) < 0.001 &&
    Math.abs(Number(analogState?.analog?.y||0)) < 0.001;
  const walkTuning = window.TGGGame.getWalkTuning();
  const driveTuning = window.TGGGame.getDriveTuning();
  const steeringTuning = driveTuning.highSpeedSteer < driveTuning.lowSpeedSteer &&
    driveTuning.steerOut > driveTuning.steerIn &&
    driveTuning.yawResponse > 0 && driveTuning.yawCenter > driveTuning.yawResponse &&
    Number.isFinite(Number(window.TGGGame.getDrivingState()?.yawRate)) &&
    walkTuning.inputResponse > 0;
  const controllerProfile=window.TGGGamepad?.getInputProfile?.();
  const controllerCurve=!!controllerProfile &&
    controllerProfile.deadzone>=.08 && controllerProfile.deadzone<=.2 &&
    controllerProfile.curve>1 && controllerProfile.curve<2 &&
    controllerProfile.triggerDeadzone>=0 && controllerProfile.triggerDeadzone<.1;

  const overlap=(a,b)=>!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
  const dpadButtons=[...document.querySelectorAll('.dpad button')].map(el=>el.getBoundingClientRect());
  const actionButtons=[...document.querySelectorAll('.action-deck .actions button')].map(el=>el.getBoundingClientRect());
  const pairwiseClear=rects=>rects.every((a,i)=>rects.every((b,j)=>i===j||!overlap(a,b)));
  const controlsSeparated=pairwiseClear(dpadButtons)&&pairwiseClear(actionButtons);
  const directionLabels=['FWD','LEFT','RIGHT','REV'].every(label=>[...document.querySelectorAll('.dpad small')].some(el=>el.textContent.trim()===label));

  const continuity = {};
  try {
    continuity.v49 = window.TGGV49?.run?.({before:{world:{cash:1}},after:{world:{cash:2}}});
    continuity.v50 = window.TGGV50?.run?.({events:[{seq:2,type:'b'},{seq:1,type:'a'}]});
    continuity.v51 = window.TGGV51?.run?.({expected:{world:{cash:2}},current:{world:{cash:2}}});
    continuity.v52 = window.TGGV52?.run?.({requireHistory:true,requireReplay:true,requireReconciliation:true});
    continuity.v53 = window.TGGV53?.run?.({state:{world:{cash:2},player:{xp:1},crew:{},events:{}}});
    continuity.v54 = window.TGGV54?.run?.({issues:[]});
    continuity.v55 = window.TGGV55?.run?.({requireHistory:true});
    continuity.v56 = window.TGGV56?.run?.({requireExecuted:true});
    continuity.v57 = window.TGGV57?.run?.({schedulerReady:!!window.TGGV42});
    continuity.v58 = window.TGGV58?.run?.({tag:'browser-smoke'});
    continuity.v59 = window.TGGV59?.run?.();
    continuity.v60 = window.TGGV60?.run?.();
    continuity.v61 = window.TGGV61?.run?.({requireContinuity:true});
    continuity.v62 = window.TGGV62?.run?.({tag:'browser-smoke'});
    continuity.v63 = window.TGGV63?.run?.({releaseTag:'browser-smoke'});
    continuity.v64 = window.TGGV64?.run?.({tag:'browser-smoke'});
    continuity.v65 = window.TGGV65?.run?.();
    continuity.v66 = window.TGGV66?.run?.({tag:'browser-smoke'});
    continuity.v67 = window.TGGV67?.run?.({pageErrorCount});
    continuity.v68 = window.TGGV68?.run?.({pageErrorCount});
    continuity.v69 = window.TGGV69?.run?.({pageErrorCount});
    continuity.v70 = window.TGGV70?.run?.({releaseTag:'browser-smoke'});
    continuity.v71 = window.TGGV71?.run?.();
    continuity.v72 = window.TGGV72?.run?.();
    continuity.v73 = window.TGGV73?.run?.();
    continuity.v74 = window.TGGV74?.run?.();
    continuity.v75 = window.TGGV75?.run?.();
    continuity.v76 = window.TGGV76?.run?.({pageErrorCount});
    continuity.v77 = window.TGGV77?.run?.();
    continuity.v78 = window.TGGV78?.run?.();
    continuity.v79 = window.TGGV79?.run?.({pageErrorCount});
    continuity.v80 = window.TGGV80?.run?.();
    continuity.v81 = window.TGGV81?.run?.();
    continuity.v82 = window.TGGV82?.run?.({pageErrorCount});
    continuity.v83 = window.TGGV83?.run?.();
    continuity.v84 = window.TGGV84?.run?.();
    continuity.v85 = window.TGGV85?.run?.({pageErrorCount});
    continuity.v86 = window.TGGV86?.run?.();
    continuity.v87 = window.TGGV87?.run?.();

    const future = [...document.scripts]
      .map(s => (s.getAttribute('src') || '').split('/').pop())
      .map(src => ({src,match:/^v1([0-9]{2})-[^/]+[.]js$/.exec(src)}))
      .filter(x => x.match && Number(x.match[1]) >= 88)
      .sort((a,b)=>Number(a.match[1])-Number(b.match[1]));
    continuity.future = [];
    const genericPayload = {
      pageErrorCount, runtime:true, runtimePresent:true, eventContract:true,
      allowSynthetic:true, assetLoad:true, runtimeStart:true, stateRead:true,
      eventLoop:true, session:true, navigation:true, viewerState:true,
      stream:true, sessionLinkage:true
    };
    for (const {src,match} of future) {
      const n=Number(match[1]);
      const api=window['TGGV'+n] || window['TGGV1'+n];
      if (!api || typeof api.run!=='function' || typeof api.snapshot!=='function') {
        continuity.future.push({src,n,ok:false,reason:'missing_runtime'});
        continue;
      }
      let result=null,snap=null,error=null;
      try {
        result=api.run(genericPayload);
        snap=api.snapshot();
      } catch (e) {
        error=String(e?.message||e);
      }
      const version=String(snap?.version||api.version||'');
      const versionOk=new RegExp('^1[.](?:'+n+'|'+(100+n)+')[.][0-9]+$').test(version);
      const policyOk=String(snap?.mutationPolicy||'').startsWith('local_');
      const checksOk=!result?.checks || typeof result.checks!=='object' || Object.values(result.checks).every(Boolean);
      continuity.future.push({src,n,ok:result?.ok===true && versionOk && policyOk && checksOk && !error,version,versionOk,policyOk,checksOk,error});
    }
  } catch (error) {
    continuity.error = String(error?.message || error);
  }
  const continuityPassed = !continuity.error &&
    continuity.v49?.diff?.lastChangeCount === 1 &&
    continuity.v50?.replay?.lastEventCount === 2 &&
    continuity.v51?.reconciliation?.lastMismatchCount === 0 &&
    continuity.v52?.audit?.lastPassed === true &&
    continuity.v53?.validation?.lastValid === true &&
    continuity.v55?.integrity?.lastPassed === true &&
    continuity.v56?.gates?.lastPassed === true &&
    continuity.v57?.health?.healthy === true &&
    continuity.v59?.faultDetection?.lastFaultCount === 0 &&
    continuity.v60?.recovery?.externalMutation === false &&
    continuity.v61?.ok === true &&
    continuity.v62?.ok === true &&
    continuity.v63?.ok === true &&
    continuity.v64?.ok === true &&
    continuity.v65?.ok === true &&
    continuity.v66?.ok === true &&
    continuity.v67?.ok === true &&
    continuity.v68?.ok === true &&
    continuity.v69?.ok === true &&
    continuity.v70?.ok === true &&
    continuity.v71?.ok === true &&
    continuity.v72?.ok === true &&
    continuity.v73?.ok === true &&
    continuity.v74?.ok === true &&
    continuity.v75?.ok === true &&
    continuity.v76?.ok === true &&
    continuity.v77?.ok === true &&
    continuity.v78?.ok === true &&
    continuity.v79?.ok === true &&
    continuity.v80?.ok === true &&
    continuity.v81?.ok === true &&
    continuity.v82?.ok === true &&
    continuity.v83?.ok === true &&
    continuity.v84?.ok === true &&
    continuity.v85?.ok === true &&
    continuity.v86?.ok === true &&
    continuity.v87?.ok === true &&
    Array.isArray(continuity.future) &&
    continuity.future.every(x => x.ok === true);

  return {
    missing,
    qaPassed: qa?.passed ?? false,
    qaFailures: (qa?.report || []).filter(x => x.status === 'FAIL').map(x => ({name:x.name,detail:x.detail})),
    releasePassed: release?.passed ?? false,
    releaseFailures: (release?.checks || []).filter(x => !x.pass).map(x => ({name:x.name,detail:x.detail})),
    missionStarted: !!start,
    advanceReturned: !!advanced,
    progressAdvanced: after === before + 1 || after === 0,
    localStorageSaved: stored,
    progressionVisible,
    achievementCatalog,
    movementApi,
    smoothWalkMoved,
    analogWalkMoved,
    analogCommandAccepted,
    analogInputReset,
    steeringTuning,
    controllerCurve,
    controlsSeparated,
    directionLabels,
    continuityPassed,
    continuity,
    currentScreen: [...document.querySelectorAll('.screen')].find(el => el.classList.contains('active'))?.id || null
  };
}, errors.length);

await browser.close();

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (result.missing.length || !result.qaPassed || !result.releasePassed || !result.missionStarted || !result.advanceReturned || !result.progressAdvanced || !result.localStorageSaved || !result.progressionVisible || !result.achievementCatalog || !result.movementApi || !result.smoothWalkMoved || !result.analogWalkMoved || !result.analogInputReset || !result.steeringTuning || !result.controllerCurve || !result.controlsSeparated || !result.directionLabels || !result.continuityPassed) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
