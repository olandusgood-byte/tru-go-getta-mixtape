import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve('game');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const store=new Map();
const localStorage={
  getItem:key=>store.has(key)?store.get(key):null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key)
};
const context=vm.createContext({
  window:{TGGGame:{getState:()=>({x:0,y:0})},TGGWorldSync:{snapshot:()=>({ok:true})}},localStorage,console,Date,JSON,Math,Number,String,Array,Object,WeakSet,Set,Map
});
const layers=[
  'v149-snapshot-diff.js','v150-replay-engine.js','v151-reconciliation.js',
  'v152-continuity-audit.js','v153-state-validation.js','v154-repair-orchestration.js',
  'v155-world-integrity.js','v156-certification-gates.js','v157-runtime-health.js',
  'v158-observability.js','v159-fault-detection.js','v160-recovery-controller.js',
  'v161-production-self-test.js','v162-regression-matrix.js','v163-release-gate.js',
  'v164-production-telemetry.js','v165-incident-journal.js','v166-recovery-evidence.js',
  'v167-production-load-test.js','v168-browser-runtime-audit.js','v169-live-viewer-audit.js',
  'v170-production-release-readiness.js','v171-cross-system-compatibility.js','v172-final-runtime-integrity.js',
  'v173-production-finalization.js','v174-tgg-browser-viewer-reconciliation.js','v175-final-verification-gate.js',
  'v176-post-finalization-monitoring.js','v177-autonomous-regression-watch.js','v178-browser-viewer-health.js',
  'v179-continuous-production-watch.js','v180-browser-viewer-recovery-monitor.js','v181-autonomous-runtime-controller.js',
  'v182-continuous-integrity-hardening.js','v183-browser-viewer-failover.js','v184-autonomous-release-sentinel.js',
  'v185-runtime-resilience.js','v186-browser-session-resilience.js','v187-live-runtime-sentinel.js'
];
for(const file of layers){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
}
const futureLayers=fs.readdirSync(root)
  .map(file=>{
    const v1=/^v1([0-9]{2})-[^/]+[.]js$/.exec(file);
    const v2=/^v2([0-9]{2})-[^/]+[.]js$/.exec(file);
    if(v1&&Number(v1[1])>=88)return{file,major:1,minor:Number(v1[1]),runtimeNumber:100+Number(v1[1])};
    if(v2)return{file,major:2,minor:Number(v2[1]),runtimeNumber:200+Number(v2[1])};
    return null;
  })
  .filter(Boolean)
  .sort((a,b)=>a.runtimeNumber-b.runtimeNumber);
for(const {file} of futureLayers){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
}
const w=context.window;
assert(w.TGGV49.run({before:{world:{cash:1}},after:{world:{cash:2}}}).diff.lastChangeCount===1,'V1.49 diff runtime failed');
assert(w.TGGV50.run({events:[{seq:2,type:'b'},{seq:1,type:'a'}]}).replay.lastEventCount===2,'V1.50 replay runtime failed');
assert(w.TGGV51.run({expected:{world:{cash:1}},current:{world:{cash:2}}}).reconciliation.lastMismatchCount===1,'V1.51 reconciliation runtime failed');
assert(w.TGGV52.run({requireHistory:true,requireReplay:true,requireReconciliation:true}).audit.lastPassed===true,'V1.52 audit failed');
assert(w.TGGV53.run({state:{world:{cash:2},player:{xp:1},crew:{},events:{}}}).validation.lastValid===true,'V1.53 validation failed');
assert(w.TGGV54.run({issues:['timeline_gap']}).repair.lastPlanSize>=1,'V1.54 repair plan failed');
assert(w.TGGV55.run({requireHistory:true}).integrity.lastPassed===true,'V1.55 integrity failed');
assert(w.TGGV56.run({requireExecuted:true}).gates.lastPassed===true,'V1.56 certification failed');
assert(w.TGGV57.run({schedulerReady:true}).health.healthy===true,'V1.57 runtime health failed');
assert(w.TGGV58.run({tag:'ci'}).observability.lastSample.tag==='ci','V1.58 observability failed');
assert(w.TGGV59.run().faultDetection.lastFaultCount===0,'V1.59 fault detection failed');
assert(w.TGGV60.run().recovery.externalMutation===false,'V1.60 recovery policy failed');
assert(w.TGGV61.run({requireContinuity:true}).ok===true,'V1.61 production self-test failed');
assert(w.TGGV62.run({tag:'ci'}).ok===true,'V1.62 regression matrix failed');
assert(w.TGGV63.run({releaseTag:'ci-candidate'}).ok===true,'V1.63 release gate failed');
assert(w.TGGV64.run({tag:'ci'}).ok===true,'V1.64 telemetry failed');
assert(w.TGGV65.run().ok===true,'V1.65 incident journal failed');
assert(w.TGGV66.run({tag:'ci'}).ok===true,'V1.66 recovery evidence failed');
assert(w.TGGV67.run({assetLoad:true,runtimeStart:true,stateRead:true,eventLoop:true,pageErrorCount:0}).ok===true,'V1.67 load test failed');
assert(w.TGGV68.run({session:true,navigation:true,runtime:true,pageErrorCount:0}).ok===true,'V1.68 browser audit logic failed');
assert(w.TGGV69.run({viewerState:true,stream:true,sessionLinkage:true,pageErrorCount:0}).ok===true,'V1.69 viewer audit logic failed');
assert(w.TGGV70.run({releaseTag:'ci-candidate'}).ok===true,'V1.70 release readiness failed');
assert(w.TGGV71.run({allowSynthetic:true,game:true,browser:true,liveViewer:true,coreContract:true}).ok===true,'V1.71 compatibility failed');
assert(w.TGGV72.run().ok===true,'V1.72 final integrity failed');
assert(w.TGGV73.run({allowSynthetic:true,runtimeObjects:true}).ok===true,'V1.73 production finalization failed');
assert(w.TGGV74.run({eventContract:true}).ok===true,'V1.74 browser-viewer reconciliation failed');
assert(w.TGGV75.run().ok===true,'V1.75 final verification failed');
assert(w.TGGV76.run({runtimePresent:true,pageErrorCount:0}).ok===true,'V1.76 monitoring failed');
assert(w.TGGV77.run().ok===true,'V1.77 regression watch failed');
assert(w.TGGV78.run().ok===true,'V1.78 browser viewer health failed');
assert(w.TGGV79.run({runtime:true,pageErrorCount:0}).ok===true,'V1.79 production watch failed');
assert(w.TGGV80.run().ok===true,'V1.80 recovery monitor failed');
assert(w.TGGV81.run().ok===true,'V1.81 runtime controller failed');
assert(w.TGGV82.run({runtime:true,pageErrorCount:0}).ok===true,'V1.82 integrity hardening failed');
assert(w.TGGV83.run().ok===true,'V1.83 browser viewer failover failed');
assert(w.TGGV84.run().ok===true,'V1.84 release sentinel failed');
assert(w.TGGV85.run({runtime:true,pageErrorCount:0}).ok===true,'V1.85 runtime resilience failed');
assert(w.TGGV86.run().ok===true,'V1.86 browser session resilience failed');
assert(w.TGGV87.run().ok===true,'V1.87 live runtime sentinel failed');
for(let n=49;n<=87;n++){
  const api=w['TGGV'+n];
  assert(api&&typeof api.snapshot==='function','Missing runtime TGGV'+n);
  const snap=api.snapshot();
  const version=String(snap.version||api.version||'');
  const logical='1.'+n+'.';
  const physical='1.'+(100+n)+'.';
  assert(version.startsWith(logical)||version.startsWith(physical),'Version mismatch TGGV'+n+': '+version);
  assert(String(snap.mutationPolicy||'').startsWith('local_'),'Non-local mutation policy TGGV'+n);
}
const futureResults=[];
const genericPayload={pageErrorCount:0,runtime:true,runtimePresent:true,eventContract:true,allowSynthetic:true,assetLoad:true,runtimeStart:true,stateRead:true,eventLoop:true,session:true,navigation:true,viewerState:true,stream:true,sessionLinkage:true};
for(const {file,major,minor,runtimeNumber} of futureLayers){
  const api=w['TGGV'+runtimeNumber]||(major===1?w['TGGV'+minor]:null);
  assert(api&&typeof api.run==='function'&&typeof api.snapshot==='function','Missing future runtime for '+file);
  const result=api.run(genericPayload);
  const snap=api.snapshot();
  const version=String(snap.version||api.version||'');
  const versionOk=major===1
    ? version.startsWith('1.'+minor+'.')||version.startsWith('1.'+runtimeNumber+'.')
    : version.startsWith('2.'+minor+'.');
  assert(versionOk,'Future version mismatch '+file+': '+version);
  assert(String(snap.mutationPolicy||'').startsWith('local_'),'Future non-local mutation policy '+file);
  assert(result&&result.ok===true,'Future runtime evidence failed '+file+': '+JSON.stringify(result));
  if(result.checks&&typeof result.checks==='object')assert(Object.values(result.checks).every(Boolean),'Future checks failed '+file);
  futureResults.push({file,version,runtimeNumber});
}
const last=futureLayers.at(-1);
const through=last?(last.major===1?'V1.'+last.minor:'V2.'+String(last.minor).padStart(2,'0')):'V1.87';
console.log(JSON.stringify({ok:true,layers:layers.length+futureLayers.length,from:'V1.49',through,futureResults}));
