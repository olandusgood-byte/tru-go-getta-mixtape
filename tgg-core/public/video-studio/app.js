(function(){
'use strict';

var API=location.origin, LS_KEY='tgg_video_studio_v2_project', TOKEN_KEY='tgg_core_token';
var state={
  workspace:'edit',panel:'media',inspector:'video',tool:'select',
  playing:false,playhead:0,inPoint:0,outPoint:null,loop:false,snap:true,
  selectedClipId:null,zoom:100,dirty:true,lastFrame:0,previewUserScale:.5,autoPreviewReduced:false,previewCostSamples:[],
  token:localStorage.getItem(TOKEN_KEY)||localStorage.getItem('tgg_access_token')||'',
  cloudUser:null,cloudProjectId:null,cloudMediaByAsset:{},history:[],future:[],renderReadiness:null,serverPreset:'1080p',renderPollTimer:null,
  project:{version:2,title:'Untitled Music Video',width:1920,height:1080,fps:30,duration:60,
    settings:{previewScale:.5,background:'#05070a'},assets:[],
    tracks:[
      {id:'v3',name:'V3',kind:'video',clips:[]},{id:'v2',name:'V2',kind:'video',clips:[]},{id:'v1',name:'V1',kind:'video',clips:[]},
      {id:'a1',name:'A1',kind:'audio',clips:[]},{id:'a2',name:'A2',kind:'audio',clips:[]}
    ]}
};

var fxCatalog={
 'Color & Tone':['Exposure','Contrast','White Balance','Lift / Gamma / Gain','Curves','HSL Secondary','Vibrance','Saturation','Film LUT','Teal & Orange','Film Print','Bleach Bypass','Day for Night','Black & White','Sepia'],
 'Detail & Repair':['Sharpen','Unsharp Mask','Denoise','Dehaze','Deflicker','Skin Smooth','Dust Repair','Dead Pixel Fix'],
 'Blur & Focus':['Gaussian Blur','Directional Blur','Radial Blur','Lens Blur','Motion Blur','Tilt Shift','Mosaic','Pixelate'],
 'Light & Lens':['Bloom','Glow','Halation','Lens Flare','Light Leaks','Vignette','God Rays','Chromatic Aberration','Lens Distortion','Fisheye'],
 'Stylize':['Film Grain','VHS','CRT','RGB Split','Glitch','Scanlines','Posterize','Threshold','Duotone','Emboss','Old Film','Neon Edge','Dream'],
 'Key & Matte':['Chroma Key','Luma Key','Spill Suppression','Matte Choker','Mask Feather','Garbage Matte'],
 'Motion & Transform':['Crop','Transform','Perspective','Stabilizer','Rolling Shutter','Time Remap','Speed Ramp','Freeze Frame','Mirror','Flip'],
 'Audio FX':['Gain','Parametric EQ','Compressor','Limiter','De-Esser','Noise Gate','Voice Denoise','Reverb','Delay','Chorus','Flanger','Pitch','Stereo Widener','Exciter']
};
var transitionCatalog=['Cross Dissolve','Dip to Black','Dip to White','Film Burn','Luma Fade','Whip Pan','Zoom','Push','Slide','Spin','Blur Dissolve','Flash','RGB Shift','Light Leak','Glitch Cut','Morph'];
var titleCatalog=['Clean Lower Third','Bold Center','Kinetic Type','Artist Title','Lyrics Line','Chapter Card','Credits Roll','Neon Tag','Minimal Caption','Social Handle','Breaking Bar','Tour Date'];

var $=function(s){return document.querySelector(s);};
var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};
var MEDIA_DB_NAME='tgg-video-studio-media-v2',MEDIA_DB_STORE='blobs',mediaDbPromise=null;
var canvas=$('#previewCanvas'),ctx=canvas.getContext('2d',{alpha:false}),fxCanvas=document.createElement('canvas'),fxCtx=fxCanvas.getContext('2d',{willReadFrequently:true}),pixelCanvas=document.createElement('canvas'),pixelCtx=pixelCanvas.getContext('2d'),mediaEls=new Map(),audioNodes=new Map(),audioCtx=null,audioCaptureDest=null,audioImpulse=null,autosaveTimer=null,renderRecorder=null,renderCancel=false;

function uid(prefix){return (prefix||'id')+'_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36);}
function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
function escapeHtml(v){var d=document.createElement('div');d.textContent=String(v==null?'':v);return d.innerHTML;}
function humanBytes(n){n=Number(n)||0;if(!n)return '0 B';var u=['B','KB','MB','GB','TB'],i=Math.min(u.length-1,Math.floor(Math.log(n)/Math.log(1024)));return (n/Math.pow(1024,i)).toFixed(i?1:0)+' '+u[i];}
function formatTime(sec,fps){sec=Math.max(0,Number(sec)||0);fps=Number(fps)||30;var whole=Math.floor(sec),frames=Math.floor((sec-whole)*fps),h=Math.floor(whole/3600),m=Math.floor((whole%3600)/60),s=whole%60;return [h,m,s,frames].map(function(n){return String(n).padStart(2,'0');}).join(':');}
function safeFileName(s){return String(s||'video').trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'video';}
function toast(msg,type){var n=document.createElement('div');n.className='toast '+(type||'');n.textContent=msg;$('#toastHost').appendChild(n);setTimeout(function(){n.remove();},3300);}
function api(path,opts){opts=opts||{};opts.headers=Object.assign({'Content-Type':'application/json'},opts.headers||{});if(state.token)opts.headers.Authorization='Bearer '+state.token;return fetch(API+path,opts).then(async function(r){var body={};try{body=await r.json();}catch(e){}if(!r.ok){var er=new Error(body.error||('HTTP '+r.status));er.status=r.status;throw er;}return body;});}
function openMediaDb(){
  if(!('indexedDB' in window))return Promise.resolve(null);
  if(mediaDbPromise)return mediaDbPromise;
  mediaDbPromise=new Promise(function(resolve,reject){
    var req=indexedDB.open(MEDIA_DB_NAME,1);
    req.onupgradeneeded=function(){var db=req.result;if(!db.objectStoreNames.contains(MEDIA_DB_STORE))db.createObjectStore(MEDIA_DB_STORE);};
    req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error);};
  }).catch(function(){return null;});
  return mediaDbPromise;
}
async function requestPersistentStorage(){
  try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist();}catch(e){}
}
async function cacheLocalMedia(asset,file){
  if(!asset||!file||file.size>536870912)return false;
  var db=await openMediaDb();if(!db)return false;
  try{
    await new Promise(function(resolve,reject){
      var tx=db.transaction(MEDIA_DB_STORE,'readwrite');
      tx.objectStore(MEDIA_DB_STORE).put(file,asset.id);
      tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error);};
    });
    asset.cacheKey=asset.id;asset.cachedLocal=true;saveLocal(true);return true;
  }catch(e){return false;}
}
async function readCachedMedia(key){
  var db=await openMediaDb();if(!db||!key)return null;
  return new Promise(function(resolve){
    try{
      var tx=db.transaction(MEDIA_DB_STORE,'readonly'),req=tx.objectStore(MEDIA_DB_STORE).get(key);
      req.onsuccess=function(){resolve(req.result||null);};req.onerror=function(){resolve(null);};
    }catch(e){resolve(null);}
  });
}
async function restoreLocalMedia(){
  var pending=state.project.assets.filter(function(a){return a.localOnly&&!a.objectUrl&&(a.cacheKey||a.id);});
  if(!pending.length)return;
  var restored=0;
  for(var i=0;i<pending.length;i++){
    var a=pending[i],blob=await readCachedMedia(a.cacheKey||a.id);
    if(!blob)continue;
    a.objectUrl=URL.createObjectURL(blob);a.file=new File([blob],a.name||'media',{type:a.mime||blob.type||'application/octet-stream'});a.missing=false;a.cachedLocal=true;probeAsset(a);restored++;
  }
  if(restored){renderLibrary();state.dirty=true;drawFrame(true);toast('Restored '+restored+' local media item'+(restored===1?'':'s'));}
}
function scheduleMediaCache(asset,file){
  var run=function(){cacheLocalMedia(asset,file).then(function(ok){if(ok)renderLibrary();});};
  if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:2500});else setTimeout(run,50);
}
function notePreviewCost(ms){
  if(!state.playing||!Number.isFinite(ms))return;
  var s=state.previewCostSamples;s.push(ms);if(s.length>45)s.shift();if(s.length<24)return;
  var avg=s.reduce(function(a,b){return a+b;},0)/s.length,current=parseFloat($('#qualitySelect').value)||.5;
  if(avg>27&&current>.25){
    var next=current>0.75?.75:current>.5?.5:.25;
    $('#qualitySelect').value=String(next);state.autoPreviewReduced=true;state.previewCostSamples=[];resizePreview(next);
    toast('Performance mode: preview lowered to '+Math.round(next*100)+'% while playing','warn');
  }
}
function defaultFx(){return {brightness:100,contrast:100,saturation:100,hue:0,blur:0,opacity:100,scale:100,x:0,y:0,rotation:0,speed:1,grain:0,vignette:0,sepia:0,grayscale:0,scanlines:0,glitch:0,chroma:0,chromaTolerance:55,bloom:0,lightLeak:0,rgbSplit:0,pixelate:0,mirrorX:0,mirrorY:0};}
function snapshot(){var clean=JSON.parse(JSON.stringify(state.project,function(k,v){return k==='objectUrl'||k==='file'?undefined:v;}));state.history.push(JSON.stringify(clean));if(state.history.length>50)state.history.shift();state.future=[];}
function normalizeProject(){var p=state.project||{};p.version=2;p.title=p.title||'Untitled Music Video';p.width=Number(p.width)||1920;p.height=Number(p.height)||1080;p.fps=Number(p.fps)||30;p.duration=Number(p.duration)||60;p.settings=p.settings||{};p.assets=Array.isArray(p.assets)?p.assets:[];if(!Array.isArray(p.tracks)||!p.tracks.length)p.tracks=[{id:'v3',name:'V3',kind:'video',clips:[]},{id:'v2',name:'V2',kind:'video',clips:[]},{id:'v1',name:'V1',kind:'video',clips:[]},{id:'a1',name:'A1',kind:'audio',clips:[]},{id:'a2',name:'A2',kind:'audio',clips:[]}];p.tracks.forEach(function(t){t.clips=t.clips||[];t.clips.forEach(function(c){c.fx=Object.assign(defaultFx(),c.fx||{});c.effects=c.effects||[];c.keyframes=c.keyframes||{};});});state.project=p;}
function selectedClip(){var found=null;state.project.tracks.some(function(t){return t.clips.some(function(c){if(c.id===state.selectedClipId){found=c;return true;}return false;});});return found;}
function selectedById(id){var out=null;state.project.tracks.some(function(t){return t.clips.some(function(c){if(c.id===id){out=c;return true;}return false;});});return out;}
function assetById(id){return state.project.assets.find(function(a){return a.id===id;});}
function trackById(id){return state.project.tracks.find(function(t){return t.id===id;});}
function markDirty(){state.dirty=true;$('#saveState').classList.add('syncing');$('#saveState span').textContent='Unsaved changes';clearTimeout(autosaveTimer);autosaveTimer=setTimeout(function(){saveLocal(true);},700);}
function saveLocal(quiet){var clone=JSON.parse(JSON.stringify(state.project,function(k,v){return k==='objectUrl'||k==='file'?undefined:v;}));try{localStorage.setItem(LS_KEY,JSON.stringify({project:clone,cloudProjectId:state.cloudProjectId,savedAt:Date.now()}));}catch(e){}$('#saveState').classList.remove('syncing');$('#saveState span').textContent=state.cloudUser?'Local + cloud ready':'Local saved';if(!quiet)toast('Project saved locally');}
function loadLocal(){try{var data=JSON.parse(localStorage.getItem(LS_KEY)||'null');if(data&&data.project&&data.project.version>=2){state.project=data.project;state.cloudProjectId=data.cloudProjectId||null;}}catch(e){}normalizeProject();state.previewUserScale=Number(state.project.settings&&state.project.settings.previewScale)||.5;state.project.assets.forEach(function(a){if(a.localOnly&&!a.objectUrl)a.missing=true;});}
function undo(){if(!state.history.length)return;state.future.push(JSON.stringify(state.project));state.project=JSON.parse(state.history.pop());normalizeProject();state.dirty=true;renderAll();}
function redo(){if(!state.future.length)return;state.history.push(JSON.stringify(state.project));state.project=JSON.parse(state.future.pop());normalizeProject();state.dirty=true;renderAll();}

function importFiles(files){files=Array.prototype.slice.call(files||[]);if(!files.length)return;snapshot();files.forEach(function(file){var type=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':file.type.startsWith('image/')?'image':null;if(!type)return;var asset={id:uid('asset'),name:file.name,type:type,mime:file.type,size:file.size,duration:type==='image'?6:10,objectUrl:URL.createObjectURL(file),file:file,localOnly:true,missing:false,cacheKey:null,cachedLocal:false};state.project.assets.push(asset);probeAsset(asset);scheduleMediaCache(asset,file);});renderLibrary();markDirty();$('#dropHint').classList.add('hidden');toast(files.length+' media item'+(files.length===1?'':'s')+' imported');}
function probeAsset(asset){if(!asset||!asset.objectUrl)return;if(asset.type==='image'){var im=new Image();im.onload=function(){asset.width=im.naturalWidth;asset.height=im.naturalHeight;renderLibrary();state.dirty=true;};im.src=asset.objectUrl;mediaEls.set(asset.id,im);return;}var el=document.createElement(asset.type==='video'?'video':'audio');el.preload='metadata';el.muted=asset.type==='video';el.src=asset.objectUrl;el.onloadedmetadata=function(){asset.duration=isFinite(el.duration)?el.duration:asset.duration;asset.width=el.videoWidth||0;asset.height=el.videoHeight||0;renderLibrary();};mediaEls.set(asset.id,el);}
function addAssetToTimeline(asset){snapshot();var target=state.project.tracks.find(function(t){return asset.type==='audio'?t.kind==='audio':t.kind==='video';});if(!target)return;var maxEnd=target.clips.reduce(function(m,c){return Math.max(m,c.start+c.duration);},0),dur=clamp(Number(asset.duration)||6,.5,Math.max(1,state.project.duration-maxEnd));var clip={id:uid('clip'),assetId:asset.id,name:asset.name,type:asset.type,start:maxEnd,duration:dur,sourceStart:0,fx:defaultFx(),effects:[],transitionIn:null,transitionOut:null,volume:1};target.clips.push(clip);state.selectedClipId=clip.id;state.playhead=clip.start;ensureDuration();markDirty();renderAll();}
function ensureDuration(){var end=0;state.project.tracks.forEach(function(t){t.clips.forEach(function(c){end=Math.max(end,c.start+c.duration);});});if(end>state.project.duration)state.project.duration=Math.ceil(end+5);}
function splitSelected(){var c=selectedClip();if(!c||state.playhead<=c.start+.05||state.playhead>=c.start+c.duration-.05)return toast('Move the playhead inside a clip','warn');snapshot();var tr=state.project.tracks.find(function(t){return t.clips.some(function(x){return x.id===c.id;});}),cut=state.playhead-c.start,clone=JSON.parse(JSON.stringify(c));clone.id=uid('clip');clone.start=state.playhead;clone.sourceStart=(c.sourceStart||0)+cut*(c.fx.speed||1);clone.duration=c.duration-cut;c.duration=cut;tr.clips.push(clone);state.selectedClipId=clone.id;markDirty();renderTimeline();renderInspector();}
function deleteSelected(){if(!state.selectedClipId)return;snapshot();state.project.tracks.forEach(function(t){t.clips=t.clips.filter(function(c){return c.id!==state.selectedClipId;});});state.selectedClipId=null;markDirty();renderAll();}
function duplicateSelected(){var c=selectedClip();if(!c)return;snapshot();var tr=state.project.tracks.find(function(t){return t.clips.some(function(x){return x.id===c.id;});}),clone=JSON.parse(JSON.stringify(c));clone.id=uid('clip');clone.start=c.start+c.duration+.1;tr.clips.push(clone);state.selectedClipId=clone.id;ensureDuration();markDirty();renderAll();}
function titleStyleFor(name){
  var n=String(name||'').toLowerCase(),s={size:64,weight:900,align:'center',x:0,y:0,color:'#ffffff',accent:'#ff3148',box:0,uppercase:false};
  if(n.indexOf('lower third')>=0){s.size=42;s.x=-18;s.y=32;s.align='left';s.box=55;}
  if(n.indexOf('bold center')>=0){s.size=86;s.uppercase=true;}
  if(n.indexOf('kinetic')>=0){s.size=78;s.x=-10;s.y=-8;s.uppercase=true;}
  if(n.indexOf('artist')>=0){s.size=74;s.y=18;s.uppercase=true;}
  if(n.indexOf('lyrics')>=0){s.size=48;s.y=30;s.weight=750;s.box=42;}
  if(n.indexOf('chapter')>=0){s.size=70;s.uppercase=true;s.box=70;}
  if(n.indexOf('credits')>=0){s.size=34;s.weight=600;s.y=10;}
  if(n.indexOf('neon')>=0){s.size=68;s.color='#dff8ff';s.accent='#49d7ff';}
  if(n.indexOf('minimal')>=0){s.size=36;s.weight=650;s.y=34;}
  if(n.indexOf('social')>=0){s.size=38;s.x=-22;s.y=36;s.align='left';s.box=50;}
  if(n.indexOf('breaking')>=0){s.size=40;s.y=34;s.align='left';s.x=-20;s.box=80;s.accent='#ff3148';}
  if(n.indexOf('tour')>=0){s.size=58;s.y=22;s.uppercase=true;s.box=55;}
  return s;
}
function addTitle(name){snapshot();var style=titleStyleFor(name),asset={id:uid('asset'),name:name,type:'title',duration:4,text:name==='Lyrics Line'?'YOUR LYRICS HERE':'TRU GO GETTA',style:style},tr=trackById('v3');state.project.assets.push(asset);var clip={id:uid('clip'),assetId:asset.id,name:name,type:'title',start:state.playhead,duration:4,sourceStart:0,fx:defaultFx(),effects:[],keyframes:{},volume:1};tr.clips.push(clip);state.selectedClipId=clip.id;markDirty();renderAll();}
function addTransition(name){var c=selectedClip();if(!c)return toast('Select a clip first','warn');snapshot();var local=localClipTime(c,state.playhead),side=local>c.duration/2?'Out':'In';c['transition'+side]={name:name,duration:.45};markDirty();renderInspector();state.dirty=true;drawFrame(true);toast(name+' · '+side+' transition added');}
function effectEnabled(c,name){var n=String(name||'').toLowerCase();return (c.effects||[]).some(function(f){return f.enabled!==false&&String(f.name||'').toLowerCase()===n;});}
function localClipTime(c,time){return clamp((Number(time)||0)-Number(c.start||0),0,Math.max(0,Number(c.duration)||0));}
function keyframeList(c,key){c.keyframes=c.keyframes||{};c.keyframes[key]=Array.isArray(c.keyframes[key])?c.keyframes[key]:[];return c.keyframes[key];}
function hasKeyframeAt(c,key,time){
  var local=localClipTime(c,time==null?state.playhead:time),eps=Math.max(.025,1/(state.project.fps||30));
  return keyframeList(c,key).some(function(k){return Math.abs(Number(k.time)-local)<=eps;});
}
function setKeyframe(c,key,value,time){
  var local=localClipTime(c,time==null?state.playhead:time),list=keyframeList(c,key),eps=Math.max(.025,1/(state.project.fps||30)),found=list.find(function(k){return Math.abs(Number(k.time)-local)<=eps;});
  if(found)found.value=Number(value);else list.push({time:Number(local.toFixed(4)),value:Number(value)});
  list.sort(function(a,b){return a.time-b.time;});
}
function toggleKeyframe(c,key){
  var local=localClipTime(c,state.playhead),list=keyframeList(c,key),eps=Math.max(.025,1/(state.project.fps||30)),idx=list.findIndex(function(k){return Math.abs(Number(k.time)-local)<=eps;});
  if(idx>=0){list.splice(idx,1);toast('Keyframe removed · '+key);}
  else{var fx=interpolatedFx(c,state.playhead);setKeyframe(c,key,fx[key]);toast('Keyframe added · '+key);}
  markDirty();renderTimeline();renderInspector();state.dirty=true;drawFrame(true);
}
function interpolateKeyframes(c,key,time,base){
  var list=keyframeList(c,key);if(!list.length)return Number(base);
  var local=localClipTime(c,time);
  if(local<=Number(list[0].time))return Number(list[0].value);
  if(local>=Number(list[list.length-1].time))return Number(list[list.length-1].value);
  for(var i=0;i<list.length-1;i++){
    var a=list[i],b=list[i+1];
    if(local>=Number(a.time)&&local<=Number(b.time)){
      var span=Math.max(.0001,Number(b.time)-Number(a.time)),p=(local-Number(a.time))/span;
      return Number(a.value)+(Number(b.value)-Number(a.value))*p;
    }
  }
  return Number(base);
}
function applyStackAmounts(c,fx){
  (c.effects||[]).filter(function(e){return e.enabled!==false;}).forEach(function(e){
    var n=String(e.name||'').toLowerCase(),a=clamp(Number(e.amount==null?50:e.amount),0,100);
    if(n.indexOf('bloom')>=0||n.indexOf('glow')>=0)fx.bloom=a;
    if(n.indexOf('halation')>=0)fx.bloom=Math.max(fx.bloom,a*.72);
    if(n.indexOf('rgb split')>=0||n.indexOf('chromatic aberration')>=0)fx.rgbSplit=a;
    if(n.indexOf('glitch')>=0)fx.glitch=a;
    if(n.indexOf('scanline')>=0||n.indexOf('crt')>=0)fx.scanlines=a;
    if(n.indexOf('film grain')>=0||n.indexOf('vhs')>=0)fx.grain=a;
    if(n.indexOf('vignette')>=0)fx.vignette=a;
    if(n.indexOf('light leak')>=0||n.indexOf('lens flare')>=0||n.indexOf('god rays')>=0)fx.lightLeak=a;
    if(n.indexOf('chroma key')>=0)fx.chroma=a;
    if(n.indexOf('pixelate')>=0||n.indexOf('mosaic')>=0)fx.pixelate=a;
    if(n.indexOf('blur')>=0)fx.blur=Math.max(fx.blur,a*.12);
  });
  return fx;
}
function interpolatedFx(c,time){
  var fx=Object.assign(defaultFx(),c.fx||{});
  Object.keys(c.keyframes||{}).forEach(function(key){if(key in fx)fx[key]=interpolateKeyframes(c,key,time,fx[key]);});
  return applyStackAmounts(c,fx);
}
function applyEffect(name){
  var c=selectedClip();if(!c)return toast('Select a clip first','warn');
  snapshot();c.effects.push({id:uid('fx'),name:name,enabled:true,amount:50});
  var n=name.toLowerCase(),f=c.fx;
  if(n.indexOf('exposure')>=0)f.brightness=115;
  if(n.indexOf('contrast')>=0)f.contrast=120;
  if(n.indexOf('white balance')>=0){f.hue=-3;f.brightness=104;}
  if(n.indexOf('curves')>=0){f.contrast=112;f.brightness=104;}
  if(n.indexOf('hsl')>=0||n.indexOf('vibrance')>=0||n==='saturation')f.saturation=125;
  if(n.indexOf('gaussian blur')>=0||n.indexOf('lens blur')>=0||n.indexOf('motion blur')>=0)f.blur=4;
  if(n.indexOf('sepia')>=0||n.indexOf('old film')>=0){f.sepia=65;f.grain=Math.max(f.grain,22);}
  if(n.indexOf('black & white')>=0)f.grayscale=100;
  if(n.indexOf('film grain')>=0||n.indexOf('vhs')>=0)f.grain=Math.max(f.grain,35);
  if(n.indexOf('vignette')>=0)f.vignette=Math.max(f.vignette,40);
  if(n.indexOf('film print')>=0){f.contrast=115;f.saturation=90;f.grain=18;f.vignette=20;f.sepia=8;}
  if(n.indexOf('bleach bypass')>=0){f.grayscale=28;f.contrast=138;f.saturation=68;}
  if(n.indexOf('day for night')>=0){f.brightness=72;f.saturation=75;f.hue=8;f.vignette=28;}
  if(n.indexOf('teal')>=0){f.hue=-9;f.contrast=112;f.saturation=115;}
  if(n.indexOf('dehaze')>=0){f.contrast=128;f.saturation=108;}
  if(n.indexOf('glitch')>=0)f.glitch=45;
  if(n.indexOf('scanline')>=0||n.indexOf('crt')>=0){f.scanlines=42;f.rgbSplit=Math.max(f.rgbSplit,18);}
  if(n.indexOf('rgb split')>=0||n.indexOf('chromatic aberration')>=0)f.rgbSplit=40;
  if(n.indexOf('pixelate')>=0||n.indexOf('mosaic')>=0)f.pixelate=45;
  if(n.indexOf('bloom')>=0||n.indexOf('glow')>=0)f.bloom=45;
  if(n.indexOf('halation')>=0){f.bloom=30;f.sepia=Math.max(f.sepia,8);}
  if(n.indexOf('light leak')>=0||n.indexOf('lens flare')>=0||n.indexOf('god rays')>=0)f.lightLeak=50;
  if(n.indexOf('chroma key')>=0){f.chroma=100;f.chromaTolerance=55;}
  if(n==='mirror')f.mirrorX=f.mirrorX?0:1;
  if(n==='flip')f.mirrorY=f.mirrorY?0:1;
  if(n.indexOf('posterize')>=0){f.contrast=145;f.saturation=135;}
  if(n.indexOf('dream')>=0){f.bloom=30;f.blur=Math.max(f.blur,1);f.saturation=110;}
  markDirty();renderInspector();state.dirty=true;drawFrame(true);toast(name+' added');
}

function renderLibrary(){var host=$('#libraryContent'),q=($('#librarySearch').value||'').toLowerCase();host.innerHTML='';if(state.panel==='media'){var lab=document.createElement('div');lab.className='section-label';lab.innerHTML='<span>Project Media</span><span>'+state.project.assets.filter(function(a){return a.type!=='title';}).length+'</span>';host.appendChild(lab);var grid=document.createElement('div');grid.className='asset-grid';state.project.assets.filter(function(a){return a.type!=='title'&&(!q||a.name.toLowerCase().indexOf(q)>=0);}).forEach(function(a){var card=document.createElement('div');card.className='asset-card';card.dataset.asset=a.id;var thumb='<div class="asset-thumb">'+(a.type==='video'?'▶':a.type==='audio'?'≋':'▧')+'</div>';if(a.type==='image'&&a.objectUrl)thumb='<div class="asset-thumb"><img src="'+a.objectUrl+'" alt=""></div>';card.innerHTML=thumb+'<b>'+escapeHtml(a.name)+'</b><small>'+a.type.toUpperCase()+' · '+humanBytes(a.size)+'</small>';grid.appendChild(card);});host.appendChild(grid);if(!grid.children.length){var empty=document.createElement('div');empty.className='fx-item';empty.innerHTML='<div class="fx-icon">＋</div><div><b>Import media</b><small>Video, audio or images. Drag files onto the viewer too.</small></div>';empty.onclick=function(){$('#fileInput').click();};host.appendChild(empty);}return;}if(state.panel==='effects'){Object.keys(fxCatalog).filter(function(k){return k!=='Audio FX';}).forEach(function(cat){renderFxGroup(host,cat,fxCatalog[cat],q);});return;}if(state.panel==='titles'){renderFxGroup(host,'Title Templates',titleCatalog,q,'title');return;}if(state.panel==='transitions'){renderFxGroup(host,'Transitions',transitionCatalog,q,'transition');return;}if(state.panel==='audiofx'){renderFxGroup(host,'Audio Effects',fxCatalog['Audio FX'],q);}}
function renderFxGroup(host,cat,list,q,mode){var filtered=list.filter(function(n){return !q||n.toLowerCase().indexOf(q)>=0||cat.toLowerCase().indexOf(q)>=0;});if(!filtered.length)return;var lab=document.createElement('div');lab.className='section-label';lab.innerHTML='<span>'+escapeHtml(cat)+'</span><span>'+filtered.length+'</span>';host.appendChild(lab);var box=document.createElement('div');box.className='fx-list';filtered.forEach(function(n,i){var row=document.createElement('div');row.className='fx-item';row.dataset.fx=n;row.dataset.mode=mode||'effect';row.innerHTML='<div class="fx-icon">'+['◐','◈','✦','◉','⌁'][i%5]+'</div><div><b>'+escapeHtml(n)+'</b><small>Click to apply</small></div>';box.appendChild(row);});host.appendChild(box);}
function renderTimeline(){var headers=$('#trackHeaders'),tracks=$('#tracks'),ruler=$('#ruler');headers.innerHTML='';tracks.innerHTML='';ruler.innerHTML='';var px=state.zoom,width=Math.max(1000,state.project.duration*px),step=state.zoom<70?5:state.zoom<140?2:1;ruler.style.width=width+'px';tracks.style.width=width+'px';for(var s=0;s<=state.project.duration;s+=step){var m=document.createElement('div');m.className='ruler-mark';m.style.left=(s*px)+'px';m.textContent=formatTime(s,state.project.fps).slice(3,8);ruler.appendChild(m);}state.project.tracks.forEach(function(t){var h=document.createElement('div');h.className='track-head';h.innerHTML='<strong>'+t.name+'</strong><button>M</button><button>S</button><span class="track-name">'+(t.kind==='video'?'Video':'Audio')+'</span>';headers.appendChild(h);var row=document.createElement('div');row.className='track-row';row.dataset.track=t.id;t.clips.sort(function(a,b){return a.start-b.start;}).forEach(function(c){var clip=document.createElement('div');clip.className='clip '+(c.type==='audio'?'audio ':c.type==='image'?'image ':'')+(c.id===state.selectedClipId?'selected':'');clip.dataset.clip=c.id;clip.style.left=(c.start*px)+'px';clip.style.width=Math.max(28,c.duration*px)+'px';var marks=[],seen={};Object.keys(c.keyframes||{}).forEach(function(key){keyframeList(c,key).forEach(function(k){var kt=Number(k.time)||0,tag=kt.toFixed(3);if(!seen[tag]&&kt>=0&&kt<=c.duration){seen[tag]=1;marks.push('<span class="clip-keyframe" style="left:'+clamp(kt/Math.max(.01,c.duration)*100,1,99)+'%" title="Keyframe">◆</span>');}});});
clip.innerHTML='<i class="trim-handle trim-left" data-trim="left"></i><b>'+escapeHtml(c.name)+'</b><div class="clip-wave"></div>'+marks.join('')+'<i class="trim-handle trim-right" data-trim="right"></i>';row.appendChild(clip);});tracks.appendChild(row);});updatePlayheadUI();}
function renderProjectMeta(){$('#projectTitle').value=state.project.title;$('#sequenceMeta').textContent=state.project.width+'×'+state.project.height+' · '+state.project.fps+' FPS';$('#resolutionMeter').textContent=state.project.width+' × '+state.project.height;$('#fpsMeter').textContent=state.project.fps+' fps';}
function paramRow(label,key,value,min,max,active){var step=key==='speed'?'.05':'1';return '<div class="param-row"><label>'+label+'</label><input data-param="'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+Number(value||0)+'"><span class="param-value">'+Number(value||0).toFixed(key==='speed'?2:0)+'</span><button class="keyframe'+(active?' active':'')+'" data-keyframe="'+key+'" title="Add/remove keyframe at playhead">◆</button></div>';}
function renderInspector(){var host=$('#inspectorContent');host.innerHTML='';if(state.inspector==='scopes'){host.innerHTML='<div class="section-label"><span>Luma Waveform</span><span>IRE</span></div><div class="scope-box"><canvas id="scopeLuma" width="320" height="145"></canvas></div><div class="section-label"><span>RGB Parade</span><span>LIVE</span></div><div class="scope-box"><canvas id="scopeRgb" width="320" height="145"></canvas></div><div class="section-label"><span>Vectorscope</span><span>100%</span></div><div class="scope-box scope-vector"><canvas id="scopeVector" width="220" height="165"></canvas></div>';requestAnimationFrame(drawScopes);return;}if(state.inspector==='render'){var rr=state.renderReadiness,serverState=rr?(rr.server_render_online?'ONLINE':'WAITING FOR WORKER'):'CHECKING';host.innerHTML='<div class="render-card"><strong>Quick Browser Master</strong><p>Records the live compositor and mixed audio tracks in real time for fast previews and delivery.</p><button data-open-export>Open Export Studio</button></div><div class="render-card"><strong>Production FFmpeg Pipeline · '+serverState+'</strong><p>TGG Core private master → GitHub OIDC worker → H.264/AAC → private Media Vault.</p><button data-server-render>Queue '+escapeHtml(state.serverPreset.toUpperCase())+' Server Render</button></div><div class="render-card"><strong>Project Package</strong><p>Timeline, effects, captions, transitions and metadata as portable JSON.</p><button data-export-json>Export Package</button></div>';return;}var c=selectedClip();if(!c){host.innerHTML='<div class="section-label"><span>Inspector</span><span>NO SELECTION</span></div><div class="render-card"><strong>Select a timeline clip</strong><p>Transform, effects, speed and keyframe controls appear here.</p></div>';return;}var displayFx=interpolatedFx(c,state.playhead),html='';
if(c.type==='title'){var ta=assetById(c.assetId),ts=Object.assign(titleStyleFor(ta&&ta.name),ta&&ta.style||{});html+='<div class="inspector-section"><h3><span>Title Designer</span><span>LIVE</span></h3><label class="field-label">Text<input class="title-text-input" data-title-text value="'+escapeHtml(ta&&ta.text||c.name)+'"></label><div class="title-control-grid"><label>Size<input data-title-param="size" type="range" min="18" max="140" value="'+Number(ts.size||64)+'"></label><label>X<input data-title-param="x" type="range" min="-45" max="45" value="'+Number(ts.x||0)+'"></label><label>Y<input data-title-param="y" type="range" min="-40" max="40" value="'+Number(ts.y||0)+'"></label><label>Box<input data-title-param="box" type="range" min="0" max="90" value="'+Number(ts.box||0)+'"></label></div><div class="title-color-row"><label>Text <input data-title-color="color" type="color" value="'+escapeHtml(ts.color||'#ffffff')+'"></label><label>Accent <input data-title-color="accent" type="color" value="'+escapeHtml(ts.accent||'#ff3148')+'"></label></div></div>';}
html+='<div class="inspector-section"><h3><span>Transform</span><span>'+escapeHtml(c.type.toUpperCase())+'</span></h3>';[['Position X','x',-100,100],['Position Y','y',-100,100],['Scale','scale',10,300],['Rotation','rotation',-180,180],['Opacity','opacity',0,100],['Speed','speed',.25,4]].forEach(function(p){html+=paramRow(p[0],p[1],displayFx[p[1]],p[2],p[3],hasKeyframeAt(c,p[1]));});html+='</div><div class="inspector-section"><h3><span>Image Controls</span><span>REALTIME</span></h3>';[['Exposure','brightness',20,200],['Contrast','contrast',0,200],['Saturation','saturation',0,250],['Hue','hue',-180,180],['Blur','blur',0,20],['Grain','grain',0,100],['Vignette','vignette',0,100],['Chroma Key','chroma',0,100],['Key Tolerance','chromaTolerance',10,120],['Bloom','bloom',0,100],['Light Leak','lightLeak',0,100],['RGB Split','rgbSplit',0,100],['Pixelate','pixelate',0,100]].forEach(function(p){html+=paramRow(p[0],p[1],displayFx[p[1]],p[2],p[3],hasKeyframeAt(c,p[1]));});html+='</div>';
var tin=c.transitionIn,tout=c.transitionOut;
html+='<div class="inspector-section"><h3><span>Transitions</span><span>'+(tin||tout?'ACTIVE':'NONE')+'</span></h3>';
if(tin)html+='<div class="transition-control"><b>IN · '+escapeHtml(tin.name)+'</b><input data-transition-duration="in" type="range" min=".1" max="2.5" step=".05" value="'+Number(tin.duration||.45)+'"><button data-remove-transition="in">×</button></div>';
if(tout)html+='<div class="transition-control"><b>OUT · '+escapeHtml(tout.name)+'</b><input data-transition-duration="out" type="range" min=".1" max="2.5" step=".05" value="'+Number(tout.duration||.45)+'"><button data-remove-transition="out">×</button></div>';
if(!tin&&!tout)html+='<div class="render-card"><p>Select a transition from the library. Placement follows the playhead: first half = In, second half = Out.</p></div>';
html+='</div><div class="inspector-section"><h3><span>Effects Stack</span><span>'+c.effects.length+'</span></h3><div class="effect-stack">';c.effects.forEach(function(f){html+='<div class="effect-chip" data-effect-id="'+f.id+'"><span class="fx-enabled" style="opacity:'+(f.enabled===false?'.25':'1')+'">●</span><b>'+escapeHtml(f.name)+'</b><input class="fx-amount" data-fx-amount="'+f.id+'" type="range" min="0" max="100" value="'+Number(f.amount==null?50:f.amount)+'" title="Effect amount"><button data-toggle-fx="'+f.id+'">◉</button><button data-remove-fx="'+f.id+'">×</button></div>';});if(!c.effects.length)html+='<div class="render-card"><p>Choose an effect from the Effects panel to build a stack.</p></div>';html+='</div></div>';host.innerHTML=html;}
function renderAll(){normalizeProject();renderProjectMeta();renderLibrary();renderTimeline();renderInspector();drawFrame(true);}
function updatePlayheadUI(){var x=state.playhead*state.zoom;$('#playhead').style.left=x+'px';$('#timecode').textContent=formatTime(state.playhead,state.project.fps);$('#durationInfo').textContent=formatTime(state.project.duration,state.project.fps);}
function activeVisualClips(time){
  var candidates=[];
  state.project.tracks.filter(function(t){return t.kind==='video';}).forEach(function(t,idx){
    t.clips.forEach(function(c){if(time>=c.start&&time<c.start+c.duration)candidates.push({clip:c,z:idx});});
  });
  return candidates.sort(function(a,b){return b.z-a.z;}).map(function(x){return x.clip;});
}

function ensureFxBuffer(w,h){
  if(fxCanvas.width!==w||fxCanvas.height!==h){fxCanvas.width=w;fxCanvas.height=h;}
}
function visualLayers(time){
  var layers=[];
  state.project.tracks.filter(function(t){return t.kind==='video';}).forEach(function(t,idx){
    t.clips.forEach(function(c){if(c.type!=='title'&&time>=c.start&&time<c.start+c.duration)layers.push({clip:c,z:idx});});
  });
  layers.sort(function(a,b){return b.z-a.z;});
  return layers.map(function(x){return x.clip;});
}
function transitionState(c,time,w){
  var elapsed=time-c.start,remaining=c.start+c.duration-time,inTr=c.transitionIn,outTr=c.transitionOut,tr=null,out=false;
  if(inTr&&elapsed>=0&&elapsed<Number(inTr.duration||.45))tr=inTr;
  if(outTr&&remaining>=0&&remaining<Number(outTr.duration||.45)){tr=outTr;out=true;}
  if(!tr)return {alpha:1,x:0,scale:1,rotation:0,blur:0,flash:0};
  var d=Math.max(.05,Number(tr.duration||.45)),p=clamp((out?remaining:elapsed)/d,0,1),name=String(tr.name||'').toLowerCase(),s={alpha:p,x:0,scale:1,rotation:0,blur:0,flash:0};
  if(name.indexOf('dip to black')>=0||name.indexOf('dip to white')>=0)s.alpha=p;
  if(name.indexOf('zoom')>=0){s.scale=1.35-.35*p;s.alpha=Math.min(1,p*1.4);}
  if(name.indexOf('push')>=0||name.indexOf('slide')>=0||name.indexOf('whip')>=0)s.x=(1-p)*w*(name.indexOf('whip')>=0?.55:1);
  if(name.indexOf('spin')>=0)s.rotation=(1-p)*.55;
  if(name.indexOf('blur')>=0)s.blur=(1-p)*14;
  if(name.indexOf('flash')>=0){s.flash=(1-p)*.7;s.alpha=Math.min(1,p*1.8);}
  if(name.indexOf('glitch')>=0)s.x=(Math.random()-.5)*(1-p)*42;
  return s;
}
function applyChromaKey(bufferCtx,w,h,fx){
  if(!fx.chroma)return;
  try{
    var image=bufferCtx.getImageData(0,0,w,h),d=image.data,strength=clamp(Number(fx.chroma)||0,0,100)/100,tol=clamp(Number(fx.chromaTolerance)||55,10,120);
    for(var i=0;i<d.length;i+=4){
      var r=d[i],g=d[i+1],b=d[i+2],greenLead=g-Math.max(r,b),gate=(greenLead-tol*.25)/(tol*.75);
      if(g>45&&gate>0){
        var cut=clamp(gate,0,1)*strength;
        d[i+3]=Math.round(d[i+3]*(1-cut));
        d[i+1]=Math.round(g*(1-cut*.35));
      }
    }
    bufferCtx.putImageData(image,0,0);
  }catch(e){}
}
function applyPixelate(bufferCtx,w,h,amount){
  if(!amount)return;
  var block=Math.max(2,Math.round(2+(Number(amount)||0)*.22)),sw=Math.max(8,Math.floor(w/block)),sh=Math.max(8,Math.floor(h/block));
  pixelCanvas.width=sw;pixelCanvas.height=sh;pixelCtx.imageSmoothingEnabled=false;pixelCtx.clearRect(0,0,sw,sh);pixelCtx.drawImage(fxCanvas,0,0,sw,sh);
  bufferCtx.clearRect(0,0,w,h);bufferCtx.imageSmoothingEnabled=false;bufferCtx.drawImage(pixelCanvas,0,0,sw,sh,0,0,w,h);bufferCtx.imageSmoothingEnabled=true;
}
function drawClipLayer(c,w,h){
  var a=assetById(c.assetId),fx=interpolatedFx(c,state.playhead),t=transitionState(c,state.playhead,w);
  ensureFxBuffer(w,h);fxCtx.setTransform(1,0,0,1,0,0);fxCtx.globalAlpha=1;fxCtx.globalCompositeOperation='source-over';fxCtx.filter='none';fxCtx.clearRect(0,0,w,h);
  fxCtx.save();
  fxCtx.filter='brightness('+fx.brightness+'%) contrast('+fx.contrast+'%) saturate('+fx.saturation+'%) hue-rotate('+fx.hue+'deg) blur('+fx.blur+'px) sepia('+(fx.sepia||0)+'%) grayscale('+(fx.grayscale||0)+'%)';
  fxCtx.translate(w/2+(fx.x||0)*w/200,h/2+(fx.y||0)*h/200);
  fxCtx.rotate((fx.rotation||0)*Math.PI/180);
  fxCtx.scale(((fx.scale||100)/100)*(fx.mirrorX?-1:1),((fx.scale||100)/100)*(fx.mirrorY?-1:1));
  drawAsset(a,c,w,h,fxCtx);
  fxCtx.restore();fxCtx.filter='none';
  applyChromaKey(fxCtx,w,h,fx);
  applyPixelate(fxCtx,w,h,fx.pixelate);

  ctx.save();ctx.translate(w/2+t.x,h/2);ctx.rotate(t.rotation);ctx.scale(t.scale,t.scale);ctx.translate(-w/2,-h/2);
  ctx.globalAlpha=clamp((fx.opacity||100)/100,0,1)*t.alpha;
  if(t.blur)ctx.filter='blur('+t.blur+'px)';
  if(fx.bloom){
    ctx.save();ctx.globalAlpha*=Math.min(.55,.12+fx.bloom/180);ctx.filter='blur('+(4+fx.bloom*.12)+'px) brightness(145%)';ctx.globalCompositeOperation='screen';ctx.drawImage(fxCanvas,0,0);ctx.restore();
  }
  if(fx.rgbSplit){
    var shift=Math.max(1,Math.round(fx.rgbSplit*.09));
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=.15;ctx.drawImage(fxCanvas,-shift,0);ctx.drawImage(fxCanvas,shift,0);ctx.restore();
  }
  ctx.drawImage(fxCanvas,0,0);ctx.filter='none';ctx.globalAlpha=1;
  if(fx.lightLeak)drawLightLeak(w,h,fx.lightLeak);
  if(t.flash){ctx.fillStyle='rgba(255,255,255,'+t.flash+')';ctx.fillRect(0,0,w,h);}
  ctx.restore();
  if(fx.grain)drawGrain(w,h,fx.grain);if(fx.vignette)drawVignette(w,h,fx.vignette);if(fx.scanlines)drawScanlines(w,h,fx.scanlines);if(fx.glitch)drawGlitch(w,h,fx.glitch);
}
function drawFrame(force){
  if(!force&&!state.dirty&&!state.playing)return;
  state.dirty=false;var w=canvas.width,h=canvas.height;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#05070a';ctx.fillRect(0,0,w,h);
  var layers=visualLayers(state.playhead);
  if(layers.length)layers.forEach(function(c){drawClipLayer(c,w,h);});else drawEmptySlate(w,h);
  drawTitleOverlays(w,h);ctx.restore();
  if(state.inspector==='scopes')requestAnimationFrame(drawScopes);
}
function scopeGrid(g,w,h){
  g.clearRect(0,0,w,h);g.fillStyle='#05080c';g.fillRect(0,0,w,h);g.strokeStyle='rgba(120,145,170,.16)';g.lineWidth=1;
  for(var y=0;y<=4;y++){var yy=Math.round(y*h/4)+.5;g.beginPath();g.moveTo(0,yy);g.lineTo(w,yy);g.stroke();}
  for(var x=0;x<=6;x++){var xx=Math.round(x*w/6)+.5;g.beginPath();g.moveTo(xx,0);g.lineTo(xx,h);g.stroke();}
}
function drawScopes(){
  var l=document.querySelector('#scopeLuma'),r=document.querySelector('#scopeRgb'),v=document.querySelector('#scopeVector');if(!l||!r||!v)return;
  var lg=l.getContext('2d'),rg=r.getContext('2d'),vg=v.getContext('2d'),sw=Math.min(240,canvas.width),sh=Math.min(135,canvas.height),sample=document.createElement('canvas');
  sample.width=sw;sample.height=sh;var sg=sample.getContext('2d',{willReadFrequently:true});sg.drawImage(canvas,0,0,sw,sh);
  var data;try{data=sg.getImageData(0,0,sw,sh).data;}catch(e){return;}
  scopeGrid(lg,l.width,l.height);scopeGrid(rg,r.width,r.height);scopeGrid(vg,v.width,v.height);
  lg.fillStyle='rgba(80,235,170,.22)';rg.globalAlpha=.22;vg.globalAlpha=.26;
  var step=3;
  for(var y=0;y<sh;y+=step){for(var x=0;x<sw;x+=step){
    var i=(y*sw+x)*4,R=data[i],G=data[i+1],B=data[i+2],lum=.2126*R+.7152*G+.0722*B;
    var px=x/sw*l.width,py=l.height-(lum/255*l.height);lg.fillRect(px,py,1.3,1.3);
    var third=r.width/3,rx=x/sw*(third-2);
    rg.fillStyle='rgba(255,78,94,.32)';rg.fillRect(rx,r.height-R/255*r.height,1.2,1.2);
    rg.fillStyle='rgba(69,229,138,.32)';rg.fillRect(third+rx,r.height-G/255*r.height,1.2,1.2);
    rg.fillStyle='rgba(73,215,255,.32)';rg.fillRect(third*2+rx,r.height-B/255*r.height,1.2,1.2);
    var Y=.299*R+.587*G+.114*B,U=(B-Y)*.493,V=(R-Y)*.877,vx=v.width/2+U/128*v.width*.42,vy=v.height/2-V/128*v.height*.42;
    vg.fillStyle='rgba(86,224,190,.34)';vg.fillRect(vx,vy,1.2,1.2);
  }}
  vg.globalAlpha=1;vg.strokeStyle='rgba(170,190,210,.25)';vg.beginPath();vg.arc(v.width/2,v.height/2,Math.min(v.width,v.height)*.39,0,Math.PI*2);vg.stroke();
}
function drawAsset(a,c,w,h,drawCtx){
  drawCtx=drawCtx||ctx;
  if(!a){drawMissing(w,h,'MEDIA OFFLINE',drawCtx);return;}
  if(a.type==='title'){drawCtx.fillStyle='#fff';drawCtx.textAlign='center';drawCtx.textBaseline='middle';drawCtx.font='900 64px system-ui';drawCtx.fillText(a.text||a.name,0,0);return;}
  var el=mediaEls.get(a.id);if(!el&&a.objectUrl){probeAsset(a);el=mediaEls.get(a.id);}
  if(!el||a.missing){drawMissing(w,h,a.name||'MEDIA OFFLINE',drawCtx);return;}
  if(a.type==='video'){
    var local=(state.playhead-c.start)*(c.fx.speed||1)+(c.sourceStart||0);if(isFinite(el.duration))local=clamp(local,0,Math.max(0,el.duration-.03));
    if(Math.abs((el.currentTime||0)-local)>.08){try{el.currentTime=local;}catch(e){}}
    if(state.playing&&el.paused){el.play().catch(function(){});}else if(!state.playing&&!el.paused)el.pause();
    if(el.readyState>=2)coverDraw(el,w,h,drawCtx);else drawMissing(w,h,'DECODING '+a.name,drawCtx);
  }else if(a.type==='image'&&el.complete)coverDraw(el,w,h,drawCtx);else drawMissing(w,h,a.name,drawCtx);
}
function coverDraw(el,w,h,drawCtx){drawCtx=drawCtx||ctx;var iw=el.videoWidth||el.naturalWidth||w,ih=el.videoHeight||el.naturalHeight||h,scale=Math.max(w/iw,h/ih),dw=iw*scale,dh=ih*scale;drawCtx.drawImage(el,-dw/2,-dh/2,dw,dh);}
function drawMissing(w,h,label,drawCtx){drawCtx=drawCtx||ctx;var g=drawCtx.createLinearGradient(-w/2,-h/2,w/2,h/2);g.addColorStop(0,'#142231');g.addColorStop(.55,'#30131c');g.addColorStop(1,'#090c12');drawCtx.fillStyle=g;drawCtx.fillRect(-w/2,-h/2,w,h);drawCtx.fillStyle='rgba(255,255,255,.88)';drawCtx.textAlign='center';drawCtx.textBaseline='middle';drawCtx.font='800 20px system-ui';drawCtx.fillText(label,0,0);}
function drawEmptySlate(w,h){var g=ctx.createRadialGradient(w*.55,h*.36,10,w*.5,h*.5,w*.7);g.addColorStop(0,'#253448');g.addColorStop(.35,'#101722');g.addColorStop(1,'#040609');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);for(var i=0;i<7;i++){ctx.fillStyle='rgba(255,49,72,'+(0.035+i*.007)+')';ctx.beginPath();ctx.arc(w*(.12+i*.14),h*(.35+(i%3)*.08),20+i*9,0,Math.PI*2);ctx.fill();}ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='900 38px system-ui';ctx.fillText('TRU GO GETTA',w/2,h*.47);ctx.fillStyle='#ff4057';ctx.font='800 12px system-ui';ctx.fillText('VIDEO STUDIO · PRO WORKSTATION',w/2,h*.54);}
function drawTitleOverlays(w,h){state.project.tracks.forEach(function(t){t.clips.forEach(function(c){
  if(c.type!=='title'||state.playhead<c.start||state.playhead>=c.start+c.duration)return;
  var a=assetById(c.assetId),s=Object.assign(titleStyleFor(a&&a.name),a&&a.style||{}),tr=transitionState(c,state.playhead,w),text=(a&&a.text)||c.name;
  if(s.uppercase)text=String(text).toUpperCase();
  var x=w/2+(Number(s.x)||0)*w/100,y=h/2+(Number(s.y)||0)*h/100,size=Math.max(18,Math.round((Number(s.size)||64)*w/960));
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=tr.alpha;ctx.translate(tr.x,0);ctx.textAlign=s.align||'center';ctx.textBaseline='middle';
  ctx.font=(Number(s.weight)||900)+' '+size+'px system-ui';
  var measure=ctx.measureText(text),pad=Math.max(10,size*.28),left=s.align==='left'?x-pad:x-measure.width/2-pad;
  if(Number(s.box)>0){ctx.shadowBlur=0;ctx.fillStyle='rgba(3,6,10,'+clamp(Number(s.box)/100,0,.9)+')';ctx.fillRect(left,y-size*.72,measure.width+pad*2,size*1.42);ctx.fillStyle=s.accent||'#ff3148';ctx.fillRect(left,y+size*.62,Math.max(34,measure.width*.24),Math.max(2,size*.055));}
  ctx.fillStyle=s.color||'#fff';ctx.shadowColor=(s.accent||'#000');ctx.shadowBlur=String(a&&a.name||'').toLowerCase().indexOf('neon')>=0?22:12;
  ctx.fillText(text,x,y);ctx.restore();
});});}
function drawGrain(w,h,amount){ctx.save();var count=Math.round(1000*(amount/100));for(var i=0;i<count;i++){var v=Math.random()>.5?255:0;ctx.fillStyle='rgba('+v+','+v+','+v+','+(Math.random()*.09)+')';ctx.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);}ctx.restore();}
function drawVignette(w,h,amount){var g=ctx.createRadialGradient(w/2,h/2,w*.18,w/2,h/2,w*.72);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,'+(.75*amount/100)+')');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
function drawScanlines(w,h,amount){ctx.save();ctx.fillStyle='rgba(0,0,0,'+(.4*amount/100)+')';for(var y=0;y<h;y+=4)ctx.fillRect(0,y,w,1);ctx.restore();}
function drawGlitch(w,h,amount){if(Math.random()>amount/100)return;ctx.save();for(var i=0;i<5;i++){var y=Math.random()*h,hh=2+Math.random()*18,dx=(Math.random()-.5)*28;try{ctx.drawImage(canvas,0,y,w,hh,dx,y,w,hh);}catch(e){}}ctx.restore();}
function drawLightLeak(w,h,amount){ctx.save();var x=w*(.15+.7*((Math.sin(state.playhead*.7)+1)/2)),g=ctx.createRadialGradient(x,h*.25,0,x,h*.25,w*.7);g.addColorStop(0,'rgba(255,118,70,'+(.35*amount/100)+')');g.addColorStop(.38,'rgba(255,44,92,'+(.16*amount/100)+')');g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalCompositeOperation='screen';ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore();}
function makeAudioImpulse(context,seconds,decay){
  var rate=context.sampleRate,length=Math.max(1,Math.floor(rate*seconds)),buffer=context.createBuffer(2,length,rate);
  for(var ch=0;ch<2;ch++){var d=buffer.getChannelData(ch);for(var i=0;i<length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/length,decay);}
  return buffer;
}
function configureAudioNode(c,node){
  var enabled=(c.effects||[]).filter(function(f){return f.enabled!==false;});
  var amount=function(term){
    var vals=enabled.filter(function(f){return String(f.name||'').toLowerCase().indexOf(term)>=0;}).map(function(f){return clamp(Number(f.amount==null?50:f.amount),0,100)/100;});
    return vals.length?Math.max.apply(Math,vals):0;
  };
  var gainAmt=amount('gain'),eqAmt=amount('parametric eq'),deEss=amount('de-esser'),excite=amount('exciter'),compAmt=amount('compressor'),limitAmt=amount('limiter');
  var delayAmt=amount('delay'),chorusAmt=amount('chorus'),flangerAmt=amount('flanger'),reverbAmt=amount('reverb'),wideAmt=amount('stereo widener'),pitchAmt=amount('pitch');
  var vol=clamp(Number(c.volume==null?1:c.volume),0,1);
  node.gain.gain.value=vol*(1+gainAmt*.5);
  node.low.gain.value=eqAmt*4;
  node.mid.gain.value=eqAmt*5;
  node.high.gain.value=eqAmt*4-deEss*7+excite*6;
  node.comp.threshold.value=limitAmt?(-2-limitAmt*5):(compAmt?(-8-compAmt*18):0);
  node.comp.knee.value=limitAmt?Math.max(.5,3-limitAmt*2):Math.max(4,40-compAmt*28);
  node.comp.ratio.value=limitAmt?(8+limitAmt*14):(1+compAmt*5);
  node.comp.attack.value=.003;node.comp.release.value=limitAmt?(.05+.06*(1-limitAmt)):(.12+.16*(1-compAmt));
  node.delay.delayTime.value=flangerAmt?(.004+.012*flangerAmt):chorusAmt?(.012+.025*chorusAmt):delayAmt?(.08+.34*delayAmt):0;
  node.delayGain.gain.value=delayAmt*.38+chorusAmt*.24+flangerAmt*.17;
  node.feedback.gain.value=delayAmt*.32+flangerAmt*.12;
  node.reverbGain.gain.value=reverbAmt*.48;
  node.pan.pan.value=wideAmt?(Math.sin(state.playhead*1.7)*.42*wideAmt):0;
  node.pitchRate=pitchAmt?Math.pow(2,(pitchAmt*4)/12):1;
}
async function ensureAudioGraph(){
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  if(!audioCtx){audioCtx=new AC();audioCaptureDest=audioCtx.createMediaStreamDestination();audioImpulse=makeAudioImpulse(audioCtx,1.6,2.5);}
  state.project.assets.filter(function(a){return a.type==='audio'||a.type==='video';}).forEach(function(a){
    var el=mediaEls.get(a.id);if(!el||audioNodes.has(a.id))return;
    try{
      var source=audioCtx.createMediaElementSource(el),low=audioCtx.createBiquadFilter(),mid=audioCtx.createBiquadFilter(),high=audioCtx.createBiquadFilter(),comp=audioCtx.createDynamicsCompressor(),dry=audioCtx.createGain(),delay=audioCtx.createDelay(2),delayGain=audioCtx.createGain(),feedback=audioCtx.createGain(),convolver=audioCtx.createConvolver(),reverbGain=audioCtx.createGain(),pan=audioCtx.createStereoPanner(),gain=audioCtx.createGain();
      low.type='lowshelf';low.frequency.value=180;mid.type='peaking';mid.frequency.value=1400;mid.Q.value=.8;high.type='highshelf';high.frequency.value=6500;convolver.buffer=audioImpulse;
      source.connect(low);low.connect(mid);mid.connect(high);high.connect(comp);comp.connect(dry);dry.connect(pan);
      comp.connect(delay);delay.connect(delayGain);delayGain.connect(pan);delay.connect(feedback);feedback.connect(delay);
      comp.connect(convolver);convolver.connect(reverbGain);reverbGain.connect(pan);
      pan.connect(gain);gain.connect(audioCtx.destination);gain.connect(audioCaptureDest);
      delayGain.gain.value=0;feedback.gain.value=0;reverbGain.gain.value=0;gain.gain.value=0;
      el.muted=false;el.volume=1;
      audioNodes.set(a.id,{source:source,low:low,mid:mid,high:high,comp:comp,dry:dry,delay:delay,delayGain:delayGain,feedback:feedback,convolver:convolver,reverbGain:reverbGain,pan:pan,gain:gain,pitchRate:1});
    }catch(e){}
  });
  if(audioCtx.state==='suspended')await audioCtx.resume().catch(function(){});
  return audioCaptureDest?audioCaptureDest.stream:null;
}
function syncAudio(){
  var activeAssets=new Set();
  state.project.tracks.forEach(function(t){t.clips.forEach(function(c){
    if(c.type!=='audio'&&c.type!=='video')return;
    var a=assetById(c.assetId),el=a&&mediaEls.get(a.id),node=a&&audioNodes.get(a.id),active=state.playhead>=c.start&&state.playhead<c.start+c.duration;
    if(!el||!el.play)return;
    if(active){
      activeAssets.add(a.id);var local=(state.playhead-c.start)*(c.fx.speed||1)+(c.sourceStart||0);
      if(Math.abs((el.currentTime||0)-local)>.15){try{el.currentTime=local;}catch(e){}}
      if(node){configureAudioNode(c,node);el.volume=1;}else el.volume=clamp(Number(c.volume==null?1:c.volume),0,1);
      el.playbackRate=clamp(Number(c.fx.speed||1)*(node?node.pitchRate:1),.25,4);
      if(state.playing&&el.paused)el.play().catch(function(){});if(!state.playing&&!el.paused)el.pause();
    }
  });});
  audioNodes.forEach(function(node,id){if(!activeAssets.has(id))node.gain.gain.value=0;});
}
function tick(ts){if(state.playing){if(!state.lastFrame)state.lastFrame=ts;var dt=(ts-state.lastFrame)/1000;state.lastFrame=ts;state.playhead+=dt;var end=state.outPoint==null?state.project.duration:state.outPoint;if(state.playhead>=end){if(state.loop)state.playhead=state.inPoint||0;else{state.playhead=end;togglePlay(false);}}updatePlayheadUI();state.dirty=true;var perfStart=performance.now();drawFrame(true);notePreviewCost(performance.now()-perfStart);syncAudio();followPlayhead();}requestAnimationFrame(tick);}
function togglePlay(force){state.playing=typeof force==='boolean'?force:!state.playing;$('#playBtn').textContent=state.playing?'❚❚':'▶';state.lastFrame=0;if(state.playing)ensureAudioGraph().then(function(){syncAudio();}).catch(function(){});if(!state.playing){mediaEls.forEach(function(el){if(el.pause)el.pause();});if(state.autoPreviewReduced){state.autoPreviewReduced=false;state.previewCostSamples=[];$('#qualitySelect').value=String(state.previewUserScale);resizePreview(state.previewUserScale);}}state.dirty=true;}
function followPlayhead(){var vp=$('#timelineViewport'),x=state.playhead*state.zoom;if(x>vp.scrollLeft+vp.clientWidth-80)vp.scrollLeft=x-vp.clientWidth+100;if(x<vp.scrollLeft)vp.scrollLeft=Math.max(0,x-50);}
function resizePreview(scaleOverride){var scale=Number(scaleOverride)||parseFloat($('#qualitySelect').value)||.5,ratio=state.project.width/state.project.height,maxW=Math.min(1280,Math.max(320,Math.round(state.project.width*scale)));canvas.width=maxW;canvas.height=Math.max(180,Math.round(maxW/ratio));state.project.settings.previewScale=scale;state.dirty=true;drawFrame(true);}

function syncTabState(){$$('.panel-tabs button').forEach(function(b){b.classList.toggle('active',b.dataset.panel===state.panel);});$$('.inspector-tabs button').forEach(function(b){b.classList.toggle('active',b.dataset.inspector===state.inspector);});}
function switchWorkspace(name){state.workspace=name;$$('[data-workspace]').forEach(function(b){b.classList.toggle('active',b.dataset.workspace===name);});if(name==='dashboard'){$('#dashboardView').classList.remove('view-hidden');$('#editorView').classList.add('view-hidden');loadDashboard();return;}$('#dashboardView').classList.add('view-hidden');$('#editorView').classList.remove('view-hidden');if(name==='color'){state.panel='effects';state.inspector='scopes';}else if(name==='audio'){state.panel='audiofx';state.inspector='video';}else if(name==='captions'){state.panel='titles';state.inspector='video';}else if(name==='deliver'){state.inspector='render';if(state.cloudUser){loadRenderReadiness();pollServerRenders(true);}}else state.inspector='video';syncTabState();renderLibrary();renderInspector();resizePreview();}
async function verifyCloud(){if(!state.token){setCloudUI(false);return false;}try{var r=await api('/v1/me');state.cloudUser=r.user;setCloudUI(true);return true;}catch(e){if(e.status===401){state.token='';localStorage.removeItem(TOKEN_KEY);}setCloudUI(false);return false;}}
function setCloudUI(ok){$('#cloudBtn').textContent=ok?'Cloud ✓':'Cloud';$('#saveState span').textContent=ok?'Local + cloud ready':'Local saved';$('#logoutBtn').style.display=ok?'inline-block':'none';}
async function signIn(email,password){var r=await api('/v1/auth/login',{method:'POST',body:JSON.stringify({email:email,password:password})});state.token=r.access_token;state.cloudUser=r.user;localStorage.setItem(TOKEN_KEY,state.token);setCloudUI(true);return r;}
function serializeProject(){var p=JSON.parse(JSON.stringify(state.project,function(k,v){if(k==='objectUrl'||k==='file')return undefined;return v;}));p.assets.forEach(function(a){var m=state.cloudMediaByAsset[a.id];if(m){a.mediaObjectId=m.id;a.storageKey=m.storage_key;a.localOnly=false;}});return p;}
async function saveCloud(){if(!await verifyCloud()){toast('Sign in to TGG Cloud first','warn');$('#cloudDialog').showModal();return null;}saveLocal(true);var payload={title:state.project.title,width:state.project.width,height:state.project.height,fps:state.project.fps,duration_ms:Math.round(state.project.duration*1000),project_json:serializeProject()};$('#saveState').classList.add('syncing');$('#saveState span').textContent='Syncing…';try{var r;if(state.cloudProjectId)r=await api('/v1/video-studio/projects/'+state.cloudProjectId,{method:'PATCH',body:JSON.stringify(payload)});else{r=await api('/v1/video-studio/projects',{method:'POST',body:JSON.stringify(payload)});state.cloudProjectId=r.project.id;saveLocal(true);}$('#saveState').classList.remove('syncing');$('#saveState span').textContent='Cloud synced';await syncPendingMedia();return r.project;}catch(e){$('#saveState').classList.remove('syncing');$('#saveState span').textContent='Cloud sync error';toast('Cloud save failed: '+e.message,'error');return null;}}
async function syncPendingMedia(){if(!state.cloudProjectId||!state.token)return;var pending=state.project.assets.filter(function(a){return a.file&&!state.cloudMediaByAsset[a.id]&&(a.type==='video'||a.type==='audio'||a.type==='image');});for(var i=0;i<pending.length;i++){try{await uploadAsset(pending[i],i,pending.length);}catch(e){toast('Media sync failed for '+pending[i].name+': '+e.message,'error');}}if(pending.length){await api('/v1/video-studio/projects/'+state.cloudProjectId,{method:'PATCH',body:JSON.stringify({project_json:serializeProject()})}).catch(function(){});saveLocal(true);}}
function uploadAsset(asset,index,total){return new Promise(function(resolve,reject){var xhr=new XMLHttpRequest();xhr.open('PUT',API+'/v1/video-studio/projects/'+state.cloudProjectId+'/media');xhr.setRequestHeader('Authorization','Bearer '+state.token);xhr.setRequestHeader('Content-Type',asset.mime||'application/octet-stream');xhr.setRequestHeader('X-Mime-Type',asset.mime||'application/octet-stream');xhr.setRequestHeader('X-File-Name',encodeURIComponent(asset.name));xhr.upload.onprogress=function(e){if(e.lengthComputable){var pct=Math.round(e.loaded/e.total*100);$('#saveState span').textContent='Media '+(index+1)+'/'+total+' · '+pct+'%';}};xhr.onload=function(){if(xhr.status>=200&&xhr.status<300){var r=JSON.parse(xhr.responseText);state.cloudMediaByAsset[asset.id]=r.media;asset.mediaObjectId=r.media.id;asset.storageKey=r.media.storage_key;asset.cloudUrl=r.url;asset.localOnly=false;resolve(r);}else reject(new Error('HTTP '+xhr.status));};xhr.onerror=function(){reject(new Error('network_error'));};xhr.send(asset.file);});}
async function openCloudProject(id){if(!await verifyCloud())return;try{var r=await api('/v1/video-studio/projects/'+id);snapshot();state.cloudProjectId=r.project.id;state.project=r.project.project_json||{};state.project.title=r.project.title;state.project.width=r.project.width;state.project.height=r.project.height;state.project.fps=Number(r.project.fps);state.project.duration=Number(r.project.duration_ms)/1000;normalizeProject();(r.media||[]).forEach(function(m){var a=state.project.assets.find(function(x){return x.mediaObjectId===m.id||x.storageKey===m.storage_key;});if(a){a.cloudUrl=API+m.url;a.objectUrl=API+m.url;a.localOnly=false;a.missing=false;state.cloudMediaByAsset[a.id]=m;probeAsset(a);}});saveLocal(true);switchWorkspace('edit');renderAll();toast('Cloud project loaded');}catch(e){toast('Could not load project: '+e.message,'error');}}
async function saveVersion(){var p=await saveCloud();if(!p)return;try{await api('/v1/video-studio/projects/'+state.cloudProjectId+'/versions',{method:'POST',body:JSON.stringify({label:'Manual save · '+new Date().toLocaleString(),project_json:serializeProject()})});toast('Cloud version saved');}catch(e){toast('Version save failed: '+e.message,'error');}}
async function loadRenderReadiness(){
  if(!state.cloudUser||!state.token){state.renderReadiness=null;renderInspector();return null;}
  try{state.renderReadiness=await api('/v1/video-studio/readiness');renderInspector();return state.renderReadiness;}
  catch(e){state.renderReadiness=null;renderInspector();return null;}
}
async function queueServerRender(){
  if(!await verifyCloud()){toast('Sign in to TGG Cloud first','warn');$('#cloudDialog').showModal();return;}
  var project=await saveCloud();if(!project)return;
  try{
    var r=await api('/v1/video-studio/projects/'+state.cloudProjectId+'/server-render',{method:'POST',body:JSON.stringify({preset:state.serverPreset})});
    var label=r.existing?'Render already exists':'Server render queued';
    toast(label+' · '+state.serverPreset.toUpperCase());
    $('#renderProgress').querySelector('i').style.width='2%';
    $('#renderProgress').querySelector('span').textContent=(r.export.status||'queued')+' · '+state.serverPreset.toUpperCase();
    pollServerRenders(true);
  }catch(e){
    if(String(e.message).indexOf('browser_master_required')>=0)toast('Create a Quick Browser Render first, then queue the server render.','warn');
    else toast('Server render queue failed: '+e.message,'error');
  }
}
async function pollServerRenders(force){
  if(!state.cloudProjectId||!state.cloudUser)return;
  if(state.renderPollTimer&&!force)return;
  if(state.renderPollTimer){clearTimeout(state.renderPollTimer);state.renderPollTimer=null;}
  try{
    var r=await api('/v1/video-studio/projects/'+state.cloudProjectId+'/server-renders'),latest=(r.renders||[])[0];
    if(latest){
      var progress=Number((latest.metadata||{}).progress||((latest.result||{}).progress)||0);
      if(latest.status==='ready')progress=100;
      $('#renderProgress').querySelector('i').style.width=clamp(progress,0,100)+'%';
      $('#renderProgress').querySelector('span').textContent=String(latest.status||'queued').toUpperCase()+' · '+String(latest.preset||state.serverPreset).toUpperCase()+(progress?' · '+progress+'%':'');
      if(latest.status==='ready')toast('Server master ready · '+String(latest.preset||'').toUpperCase());
      if(latest.status==='queued'||latest.status==='processing')state.renderPollTimer=setTimeout(function(){state.renderPollTimer=null;pollServerRenders();},5000);
    }
  }catch(e){}
}
async function loadDashboard(){var stat=$('#dashStats').children;stat[0].querySelector('strong').textContent='1';$('#recentProjects').innerHTML='<div class="project-row" data-local-project><i class="project-thumb"></i><div><b>'+escapeHtml(state.project.title)+'</b><small>Local project · '+state.project.width+'×'+state.project.height+'</small></div><em>local</em></div>';$('#renderHistory').innerHTML='<div class="render-row"><i></i><div><b>Browser compositor ready</b><small>Export a timeline master from Deliver.</small></div></div>';if(!await verifyCloud()){stat[1].querySelector('strong').textContent='Local';stat[2].querySelector('strong').textContent='—';return;}await loadRenderReadiness();try{var r=await api('/v1/video-studio/dashboard');stat[0].querySelector('strong').textContent=r.summary.projects;stat[1].querySelector('strong').textContent=r.summary.ready;stat[2].querySelector('strong').textContent=humanBytes(r.media.bytes);var html='';r.projects.forEach(function(p){html+='<div class="project-row" data-cloud-project="'+p.id+'"><i class="project-thumb"></i><div><b>'+escapeHtml(p.title)+'</b><small>'+p.width+'×'+p.height+' · '+Number(p.fps)+' fps</small></div><em>'+escapeHtml(p.status)+'</em></div>';});if(html)$('#recentProjects').innerHTML=html;var rh='';r.exports.forEach(function(x){rh+='<div class="render-row"><i></i><div><b>'+escapeHtml(x.preset)+' · '+escapeHtml(x.provider)+'</b><small>'+escapeHtml(x.status)+' · '+(x.width||'—')+'×'+(x.height||'—')+' · '+humanBytes(x.size_bytes)+'</small></div></div>';});if(rh)$('#renderHistory').innerHTML=rh;}catch(e){toast('Dashboard cloud data unavailable','warn');}}

function downloadBlob(blob,name){var a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
function exportFrame(){var oldW=canvas.width,oldH=canvas.height;canvas.width=state.project.width;canvas.height=state.project.height;drawFrame(true);canvas.toBlob(function(blob){downloadBlob(blob,safeFileName(state.project.title)+'-frame.png');canvas.width=oldW;canvas.height=oldH;state.dirty=true;drawFrame(true);},'image/png');}
function exportJson(){downloadBlob(new Blob([JSON.stringify(serializeProject(),null,2)],{type:'application/json'}),safeFileName(state.project.title)+'.tggvideo.json');}
async function quickRender(){if(renderRecorder)return toast('Render already running','warn');var start=state.inPoint||0,end=state.outPoint==null?state.project.duration:state.outPoint,dur=Math.max(.1,end-start);if(dur>180&&!confirm('This browser render is '+Math.ceil(dur)+' seconds and records in real time. Continue?'))return;if(!window.MediaRecorder||!canvas.captureStream)return toast('Browser render is not supported here','error');var mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(function(x){return MediaRecorder.isTypeSupported(x);})||'video/webm',stream=canvas.captureStream(state.project.fps),audioStream=await ensureAudioGraph(),chunks=[];if(audioStream)audioStream.getAudioTracks().forEach(function(t){stream.addTrack(t);});renderCancel=false;try{renderRecorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:12000000});}catch(e){renderRecorder=new MediaRecorder(stream);}renderRecorder.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};var prog=$('#renderProgress');prog.querySelector('span').textContent='Rendering 0%';renderRecorder.onstop=async function(){var blob=new Blob(chunks,{type:renderRecorder.mimeType||mime}),ext=(blob.type||'').indexOf('mp4')>=0?'mp4':'webm';downloadBlob(blob,safeFileName(state.project.title)+'-master.'+ext);prog.querySelector('i').style.width='100%';prog.querySelector('span').textContent='Browser master ready · '+humanBytes(blob.size);if(state.cloudUser&&state.cloudProjectId&&!renderCancel){try{var file=new File([blob],safeFileName(state.project.title)+'-master.'+ext,{type:blob.type}),asset={id:uid('render'),name:file.name,type:'video',mime:file.type,size:file.size,file:file},up=await uploadAsset(asset,0,1);await api('/v1/video-studio/projects/'+state.cloudProjectId+'/browser-render',{method:'POST',body:JSON.stringify({media_object_id:up.media.id,preset:'browser-master',mime_type:file.type,width:state.project.width,height:state.project.height,duration_ms:Math.round(dur*1000),size_bytes:file.size,metadata:{source_revision:Date.now(),browser:true}})});toast('Browser master saved to private cloud media');}catch(e){toast('Master downloaded; cloud registration failed: '+e.message,'warn');}}renderRecorder=null;togglePlay(false);};state.playhead=start;togglePlay(true);renderRecorder.start(1000);var monitor=setInterval(function(){var pct=clamp((state.playhead-start)/dur*100,0,100);prog.querySelector('i').style.width=pct+'%';prog.querySelector('span').textContent='Rendering '+Math.round(pct)+'%';if(state.playhead>=end||!state.playing){clearInterval(monitor);if(renderRecorder&&renderRecorder.state!=='inactive')renderRecorder.stop();}},200);}

function timelinePointerDown(e){
  var el=e.target.closest('.clip');if(!el)return;var c=selectedById(el.dataset.clip);if(!c)return;
  state.selectedClipId=c.id;renderInspector();$('#selectionInfo').textContent=c.name+' · '+formatTime(c.duration,state.project.fps);
  if(state.tool==='blade'&&!e.target.closest('[data-trim]')){var rect=el.getBoundingClientRect();state.playhead=c.start+clamp((e.clientX-rect.left)/Math.max(1,rect.width),0,1)*c.duration;splitSelected();return;}
  e.preventDefault();snapshot();
  var startX=e.clientX,start=c.start,startDuration=c.duration,startSource=Number(c.sourceStart||0),handle=e.target.closest('[data-trim]'),mode=handle?handle.dataset.trim:(state.tool==='trim'?(e.offsetX<el.offsetWidth/2?'left':'right'):'move');
  el.setPointerCapture(e.pointerId);
  function snapTime(v){return state.snap?Math.round(v*10)/10:v;}
  function move(ev){
    var delta=(ev.clientX-startX)/state.zoom;
    if(mode==='left'){
      var maxDelta=Math.max(0,startDuration-.05),d=clamp(delta,-start,maxDelta),nextStart=snapTime(start+d),actual=nextStart-start;
      c.start=Math.max(0,nextStart);c.duration=Math.max(.05,startDuration-actual);c.sourceStart=Math.max(0,startSource+actual*(c.fx.speed||1));
      el.style.left=(c.start*state.zoom)+'px';el.style.width=Math.max(28,c.duration*state.zoom)+'px';
    }else if(mode==='right'){
      c.duration=Math.max(.05,snapTime(startDuration+delta));el.style.width=Math.max(28,c.duration*state.zoom)+'px';
    }else{
      var next=Math.max(0,snapTime(start+delta));c.start=next;el.style.left=(next*state.zoom)+'px';
    }
    state.dirty=true;drawFrame(true);
  }
  function up(){el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);ensureDuration();markDirty();renderTimeline();renderInspector();}
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
}
function newProject(){if(!confirm('Create a new local Video Studio project? Your current project is saved first.'))return;saveLocal(true);state.cloudProjectId=null;state.selectedClipId=null;state.playhead=0;state.project={version:2,title:'Untitled Music Video',width:1920,height:1080,fps:30,duration:60,settings:{previewScale:.5},assets:[],tracks:[{id:'v3',name:'V3',kind:'video',clips:[]},{id:'v2',name:'V2',kind:'video',clips:[]},{id:'v1',name:'V1',kind:'video',clips:[]},{id:'a1',name:'A1',kind:'audio',clips:[]},{id:'a2',name:'A2',kind:'audio',clips:[]}]};saveLocal(true);switchWorkspace('edit');renderAll();}

function bind(){
  $$('.workspace-tabs button').forEach(function(b){b.onclick=function(){switchWorkspace(b.dataset.workspace);};});
  $$('.panel-tabs button').forEach(function(b){b.onclick=function(){state.panel=b.dataset.panel;syncTabState();renderLibrary();};});
  $$('.inspector-tabs button').forEach(function(b){b.onclick=function(){state.inspector=b.dataset.inspector;syncTabState();renderInspector();};});
  $$('.toolrail button').forEach(function(b){b.onclick=function(){$$('.toolrail button').forEach(function(x){x.classList.remove('active');});b.classList.add('active');state.tool=b.dataset.tool;};});
  $('#importBtn').onclick=function(){$('#fileInput').click();};$('#fileInput').onchange=function(){importFiles(this.files);this.value='';};
  ['dragenter','dragover'].forEach(function(ev){$('#dropZone').addEventListener(ev,function(e){e.preventDefault();$('#dropZone').style.outline='2px solid #49d7ff';});});
  ['dragleave','drop'].forEach(function(ev){$('#dropZone').addEventListener(ev,function(e){e.preventDefault();$('#dropZone').style.outline='';});});$('#dropZone').addEventListener('drop',function(e){importFiles(e.dataTransfer.files);});
  $('#librarySearch').oninput=renderLibrary;$('#libraryContent').onclick=function(e){var card=e.target.closest('[data-asset]');if(card){var a=assetById(card.dataset.asset);if(a)addAssetToTimeline(a);return;}var fx=e.target.closest('[data-fx]');if(fx){if(fx.dataset.mode==='title')addTitle(fx.dataset.fx);else if(fx.dataset.mode==='transition')addTransition(fx.dataset.fx);else applyEffect(fx.dataset.fx);}};
  $('#playBtn').onclick=function(){togglePlay();};$('#jumpStart').onclick=function(){state.playhead=state.inPoint||0;updatePlayheadUI();state.dirty=true;};$('#jumpEnd').onclick=function(){state.playhead=state.outPoint==null?state.project.duration:state.outPoint;updatePlayheadUI();state.dirty=true;};$('#frameBack').onclick=function(){state.playhead=Math.max(0,state.playhead-1/state.project.fps);updatePlayheadUI();state.dirty=true;drawFrame(true);};$('#frameForward').onclick=function(){state.playhead=Math.min(state.project.duration,state.playhead+1/state.project.fps);updatePlayheadUI();state.dirty=true;drawFrame(true);};
  $('#markIn').onclick=function(){state.inPoint=state.playhead;toast('In point · '+formatTime(state.inPoint,state.project.fps));};$('#markOut').onclick=function(){state.outPoint=state.playhead;toast('Out point · '+formatTime(state.outPoint,state.project.fps));};$('#loopBtn').onclick=function(){state.loop=!state.loop;this.classList.toggle('active',state.loop);};
  $('#timelineZoom').oninput=function(){state.zoom=Number(this.value);renderTimeline();};$('#snapBtn').onclick=function(){state.snap=!state.snap;this.classList.toggle('active',state.snap);};
  $('#splitBtn').onclick=splitSelected;$('#deleteBtn').onclick=deleteSelected;$('#duplicateBtn').onclick=duplicateSelected;$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
  $('#tracks').addEventListener('pointerdown',timelinePointerDown);$('#timelineViewport').addEventListener('pointerdown',function(e){if(e.target.closest('.clip'))return;var rect=this.getBoundingClientRect();state.playhead=clamp((e.clientX-rect.left+this.scrollLeft)/state.zoom,0,state.project.duration);updatePlayheadUI();state.dirty=true;drawFrame(true);});
  $('#inspectorContent').addEventListener('input',function(e){
    var c=selectedClip();if(!c)return;
    if(e.target.dataset.titleText!==undefined){var ta=assetById(c.assetId);if(ta){ta.text=e.target.value;markDirty();state.dirty=true;drawFrame(true);}return;}
    if(e.target.dataset.titleParam){var ta2=assetById(c.assetId);if(ta2){ta2.style=Object.assign(titleStyleFor(ta2.name),ta2.style||{});ta2.style[e.target.dataset.titleParam]=Number(e.target.value);markDirty();state.dirty=true;drawFrame(true);}return;}
    if(e.target.dataset.titleColor){var ta3=assetById(c.assetId);if(ta3){ta3.style=Object.assign(titleStyleFor(ta3.name),ta3.style||{});ta3.style[e.target.dataset.titleColor]=e.target.value;markDirty();state.dirty=true;drawFrame(true);}return;}
    if(e.target.dataset.transitionDuration){var side=e.target.dataset.transitionDuration==='out'?'transitionOut':'transitionIn';if(c[side]){c[side].duration=Number(e.target.value);markDirty();state.dirty=true;drawFrame(true);}return;}
    if(e.target.dataset.fxAmount){var fxItem=c.effects.find(function(f){return f.id===e.target.dataset.fxAmount;});if(fxItem){fxItem.amount=Number(e.target.value);markDirty();state.dirty=true;drawFrame(true);}return;}
    if(!e.target.dataset.param)return;
    var key=e.target.dataset.param,value=Number(e.target.value);
    if(keyframeList(c,key).length)setKeyframe(c,key,value);else c.fx[key]=value;
    e.target.nextElementSibling.textContent=value.toFixed(key==='speed'?2:0);markDirty();state.dirty=true;drawFrame(true);renderTimeline();
  });
  $('#inspectorContent').addEventListener('click',function(e){
    if(e.target.dataset.keyframe){var kc=selectedClip();if(kc){snapshot();toggleKeyframe(kc,e.target.dataset.keyframe);}return;}
    if(e.target.dataset.removeTransition){var tc=selectedClip();if(tc){snapshot();if(e.target.dataset.removeTransition==='out')delete tc.transitionOut;else delete tc.transitionIn;markDirty();renderInspector();state.dirty=true;drawFrame(true);}return;}
    if(e.target.dataset.removeFx){var c=selectedClip();snapshot();c.effects=c.effects.filter(function(f){return f.id!==e.target.dataset.removeFx;});markDirty();renderInspector();state.dirty=true;drawFrame(true);}
    if(e.target.dataset.toggleFx){var c2=selectedClip(),f=c2.effects.find(function(x){return x.id===e.target.dataset.toggleFx;});if(f){f.enabled=!f.enabled;e.target.parentElement.querySelector('.fx-enabled').style.opacity=f.enabled?'1':'.25';markDirty();state.dirty=true;drawFrame(true);}}
    if(e.target.matches('[data-open-export]'))$('#exportDialog').showModal();if(e.target.matches('[data-export-json]'))exportJson();if(e.target.matches('[data-server-render]'))queueServerRender();
  });
  $('#projectTitle').oninput=function(){state.project.title=this.value;markDirty();};$('#qualitySelect').onchange=function(){state.previewUserScale=parseFloat(this.value)||.5;state.autoPreviewReduced=false;state.previewCostSamples=[];resizePreview(state.previewUserScale);markDirty();};$('#gridBtn').onclick=function(){$('#gridGuides').classList.toggle('hidden');};$('#safeBtn').onclick=function(){$('#safeGuides').classList.toggle('hidden');};$('#fullscreenBtn').onclick=function(){var d=$('#dropZone');if(d.requestFullscreen)d.requestFullscreen();};
  $('#saveBtn').onclick=function(){saveLocal();if(state.cloudUser)saveCloud();};$('#cloudBtn').onclick=function(){$('#cloudDialog').showModal();};$('#exportBtn').onclick=function(){$('#exportDialog').showModal();};
  $('#loginForm').addEventListener('submit',async function(e){e.preventDefault();$('#loginMessage').textContent='Signing in…';try{await signIn($('#loginEmail').value,$('#loginPassword').value);$('#loginMessage').textContent='Connected';setTimeout(function(){$('#cloudDialog').close();saveCloud();},350);}catch(er){$('#loginMessage').textContent='Sign in failed: '+er.message;}});
  $('#logoutBtn').onclick=function(){if(state.token)api('/v1/auth/logout',{method:'POST',body:'{}'}).catch(function(){});state.token='';state.cloudUser=null;localStorage.removeItem(TOKEN_KEY);setCloudUI(false);$('#cloudDialog').close();toast('Cloud signed out');};
  $('#exportDialog').addEventListener('click',function(e){var b=e.target.closest('[data-export]');if(!b)return;if(b.dataset.export==='frame')exportFrame();if(b.dataset.export==='json')exportJson();if(b.dataset.export==='version')saveVersion();if(b.dataset.export==='quick')quickRender();if(b.dataset.export==='server')queueServerRender();});
  $('.render-presets [data-preset]').forEach(function(b){b.onclick=function(){$('.render-presets [data-preset]').forEach(function(x){x.classList.remove('active');});b.classList.add('active');state.serverPreset=b.dataset.preset;renderInspector();};});
  $('#newProjectBtn').onclick=newProject;$('#refreshDash').onclick=loadDashboard;$('#recentProjects').onclick=function(e){var row=e.target.closest('[data-cloud-project]');if(row)openCloudProject(row.dataset.cloudProject);if(e.target.closest('[data-local-project]'))switchWorkspace('edit');};
  document.addEventListener('keydown',function(e){if(/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlay();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveLocal();if(state.cloudUser)saveCloud();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}if(e.key==='ArrowLeft')$('#frameBack').click();if(e.key==='ArrowRight')$('#frameForward').click();if(e.key.toLowerCase()==='c')state.tool='blade';if(e.key==='Delete'||e.key==='Backspace')deleteSelected();});
  window.addEventListener('beforeunload',function(){saveLocal(true);});
}
function registerServiceWorker(){if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(function(){});}
function init(){loadLocal();bind();$('#qualitySelect').value=String(state.previewUserScale);verifyCloud();renderAll();resizePreview(state.previewUserScale);registerServiceWorker();requestPersistentStorage();restoreLocalMedia();requestAnimationFrame(tick);}
document.addEventListener('DOMContentLoaded',init);
})();