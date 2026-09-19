(function(){
'use strict';
var api=null,root=null,capabilities={};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function wait(){api=window.TGGVideoStudio;if(!api){setTimeout(wait,40);return;}boot();}
function project(){return api.getState().project;}
function aiState(){var p=project();p.ai=p.ai||{beats:[],silence:[],analysis:{}};return p.ai;}
function status(msg){var el=document.getElementById('aiStatus');if(el)el.textContent=msg;}
function createUI(){
  var nav=document.querySelector('.workspace-tabs'),deliver=nav&&nav.querySelector('[data-workspace="deliver"]');
  if(nav&&!nav.querySelector('[data-ai-workspace]')){var b=document.createElement('button');b.textContent='AI Director';b.dataset.aiWorkspace='1';b.dataset.workspace='ai';if(deliver)nav.insertBefore(b,deliver);else nav.appendChild(b);b.addEventListener('click',function(ev){ev.preventDefault();ev.stopImmediatePropagation();showAI();},true);}
  root=document.createElement('section');root.id='aiDirectorView';root.className='ai-director-view view-hidden';
  root.innerHTML=`
    <div class="ai-hero"><div><span class="eyebrow">V2.5 · AI ASSISTED EDITING</span><h1>Director Mode</h1><p>Automatic cuts, beat-aware pacing, silence detection, smart reframing, masks, tracking and accelerated effects without replacing the pro timeline.</p></div><button id="aiBackEdit" class="primary-btn">Open Timeline</button></div>
    <div class="ai-grid">
      <article class="ai-card ai-card-main"><div class="ai-card-head"><span>AUTO EDIT</span><b>QUIK-STYLE</b></div>
        <h2>One-click rough cut.</h2><p>Build a real V1 timeline from imported footage, then keep editing every cut manually.</p>
        <div class="ai-form-grid">
          <label>Format<select id="aiFormat"><option value="music">Music Video · 16:9</option><option value="social">Social Short · 9:16</option><option value="performance">Performance Reel · 16:9</option></select></label>
          <label>Target<input id="aiTarget" type="range" min="10" max="120" step="5" value="30"><span id="aiTargetValue">30 sec</span></label>
          <label>Pace<select id="aiPace"><option value="fast">Fast Cuts</option><option value="balanced" selected>Balanced</option><option value="cinematic">Cinematic</option></select></label>
          <label>Transitions<select id="aiTransitions"><option value="smart">Smart Mix</option><option value="clean">Clean Dissolves</option><option value="hard">Hard Cuts</option></select></label>
        </div>
        <div class="ai-actions"><button id="aiAnalyze" class="ghost-btn">Analyze Media</button><button id="aiBeats" class="ghost-btn">Detect Beats</button><button id="aiSilence" class="ghost-btn">Find Silence</button><button id="aiBuild" class="primary-btn">AUTO EDIT</button></div>
        <div id="aiStatus" class="ai-status">Ready. Import media, then run analysis or Auto Edit.</div>
      </article>
      <article class="ai-card"><div class="ai-card-head"><span>SMART FRAME</span><b>REFRAME</b></div><h3>Auto Reframe</h3><p>Fit selected clips for landscape, vertical or square delivery while preserving editable transforms.</p><div class="ai-actions compact"><button data-reframe="landscape">16:9</button><button data-reframe="vertical">9:16</button><button data-reframe="square">1:1</button></div></article>
      <article class="ai-card"><div class="ai-card-head"><span>MASK + TRACK</span><b>REAL DATA</b></div><h3>Tracker Lab</h3><p>Add editable frame-space masks and run a browser block-matching tracker that writes X/Y keyframes to the selected video clip.</p><div class="ai-actions compact"><button data-mask="ellipse">Ellipse Mask</button><button data-mask="rect">Rect Mask</button><button id="aiTrack">Track Subject</button></div></article>
      <article class="ai-card"><div class="ai-card-head"><span>GPU FX</span><b>WEBGL2</b></div><h3>Shader Lab</h3><p>Accelerated preview effects stay clip-level and reversible.</p><div class="ai-actions compact"><button data-gpu="filmic">Filmic</button><button data-gpu="neon">Neon Edge</button><button data-gpu="prism">RGB Prism</button><button data-gpu="lens">Lens Warp</button></div><label class="ai-strength">Strength <input id="gpuStrength" type="range" min="0" max="100" value="60"></label></article>
      <article class="ai-card ai-cap-card"><div class="ai-card-head"><span>ACCELERATION</span><b>RUNTIME</b></div><h3>Hardware Check</h3><div id="aiCapabilities" class="cap-list"></div><button id="aiRefreshCaps" class="ghost-btn">Recheck Hardware</button></article>
      <article class="ai-card"><div class="ai-card-head"><span>ANALYSIS</span><b>PROJECT</b></div><h3>Director Notes</h3><div id="aiNotes" class="ai-notes">No analysis yet.</div></article>
    </div>`;
  document.querySelector('main.workspace').appendChild(root);
  document.getElementById('aiBackEdit').onclick=showEditor;
  document.getElementById('aiAnalyze').onclick=analyzeMedia;
  document.getElementById('aiBeats').onclick=detectBeats;
  document.getElementById('aiSilence').onclick=detectSilence;
  document.getElementById('aiBuild').onclick=autoEdit;
  document.getElementById('aiTrack').onclick=trackSelected;
  document.getElementById('aiRefreshCaps').onclick=detectCapabilities;
  document.getElementById('aiTarget').oninput=function(){document.getElementById('aiTargetValue').textContent=this.value+' sec';};
  root.addEventListener('click',function(e){
    var r=e.target.closest('[data-reframe]');if(r)reframe(r.dataset.reframe);
    var m=e.target.closest('[data-mask]');if(m)addMask(m.dataset.mask);
    var g=e.target.closest('[data-gpu]');if(g)applyGpu(g.dataset.gpu);
  });
}
function showAI(){
  document.querySelectorAll('.workspace-tabs button').forEach(function(b){b.classList.remove('active');});
  var b=document.querySelector('[data-ai-workspace]');if(b)b.classList.add('active');
  var d=document.getElementById('dashboardView'),e=document.getElementById('editorView');if(d)d.classList.add('view-hidden');if(e)e.classList.add('view-hidden');root.classList.remove('view-hidden');renderNotes();
}
function showEditor(){root.classList.add('view-hidden');api.switchWorkspace('edit');}
function getVisualAssets(){return project().assets.filter(function(a){return a.type==='video'||a.type==='image';});}
function getAudioAsset(){return project().assets.find(function(a){return (a.type==='audio'||a.type==='video')&&a.file;});}
function analyzeMedia(){
  var p=project(),visual=getVisualAssets(),audio=p.assets.filter(function(a){return a.type==='audio';}),seconds=visual.reduce(function(n,a){return n+(Number(a.duration)||0);},0);
  var portrait=visual.filter(function(a){return Number(a.height)>Number(a.width);}).length;
  aiState().analysis={visuals:visual.length,audio:audio.length,sourceSeconds:seconds,portrait:portrait,landscape:visual.length-portrait,at:Date.now()};
  api.markDirty();renderNotes();status('Analysis complete · '+visual.length+' visual assets · '+Math.round(seconds)+' source seconds.');
}
async function decodeAsset(a){
  if(!a||!a.file)throw new Error('Local audio/video file required for waveform analysis');
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error('Web Audio unavailable');
  var ac=new AC();try{return await ac.decodeAudioData((await a.file.arrayBuffer()).slice(0));}finally{ac.close().catch(function(){});}
}
async function detectBeats(){
  var a=getAudioAsset();if(!a)return status('Beat detection needs one locally imported audio/video file.');
  status('Detecting beats…');
  try{
    var buf=await decodeAsset(a),data=buf.getChannelData(0),rate=buf.sampleRate,hop=Math.max(256,Math.floor(rate*.05)),energy=[];
    for(var i=0;i<data.length;i+=hop){var s=0,end=Math.min(data.length,i+hop);for(var j=i;j<end;j+=4)s+=data[j]*data[j];energy.push(s/Math.max(1,(end-i)/4));}
    var beats=[];for(var k=2;k<energy.length-2;k++){var local=(energy[k-2]+energy[k-1]+energy[k+1]+energy[k+2])/4;if(energy[k]>local*1.55&&energy[k]>.0008){var t=k*hop/rate;if(!beats.length||t-beats[beats.length-1]>.22)beats.push(Number(t.toFixed(3)));}}
    aiState().beats=beats.slice(0,1200);aiState().beatSource=a.id;api.markDirty();renderNotes();status('Beat map ready · '+beats.length+' cuts/accents detected.');
  }catch(e){status('Beat analysis unavailable: '+e.message);}
}
async function detectSilence(){
  var a=getAudioAsset();if(!a)return status('Silence analysis needs a local audio/video file.');
  status('Finding silence…');
  try{
    var buf=await decodeAsset(a),data=buf.getChannelData(0),rate=buf.sampleRate,win=Math.max(512,Math.floor(rate*.1)),silent=[],open=null;
    for(var i=0;i<data.length;i+=win){var s=0,end=Math.min(data.length,i+win);for(var j=i;j<end;j+=4)s+=data[j]*data[j];var rms=Math.sqrt(s/Math.max(1,(end-i)/4)),t=i/rate;if(rms<.012){if(open==null)open=t;}else if(open!=null){if(t-open>.28)silent.push([Number(open.toFixed(2)),Number(t.toFixed(2))]);open=null;}}
    if(open!=null)silent.push([Number(open.toFixed(2)),Number(buf.duration.toFixed(2))]);
    aiState().silence=silent;api.markDirty();renderNotes();status('Silence map ready · '+silent.length+' removable gaps found.');
  }catch(e){status('Silence analysis unavailable: '+e.message);}
}
function nearestBeat(t,beats,maxDelta){var best=t,d=maxDelta||.3;for(var i=0;i<beats.length;i++){var x=Math.abs(beats[i]-t);if(x<d){d=x;best=beats[i];}if(beats[i]>t+d)break;}return best;}
function autoEdit(){
  var p=project(),assets=getVisualAssets();if(!assets.length)return status('Import video or images first.');
  var target=Number(document.getElementById('aiTarget').value)||30,pace=document.getElementById('aiPace').value,format=document.getElementById('aiFormat').value,trMode=document.getElementById('aiTransitions').value;
  var base=pace==='fast'?1.15:pace==='cinematic'?3.4:2.05,beats=aiState().beats||[],v1=api.trackById('v1');if(!v1)return status('V1 track is missing.');
  api.snapshot();v1.clips=[];var t=0,n=0,lastAsset=-1;
  while(t<target-.2&&n<300){
    var ai=(n+(n>>1))%assets.length;if(ai===lastAsset&&assets.length>1)ai=(ai+1)%assets.length;lastAsset=ai;var a=assets[ai],dur=Math.min(base,target-t,Math.max(.6,Number(a.duration)||base));
    if(beats.length){var snapped=nearestBeat(t+dur,beats,.38);if(snapped>t+.55)dur=Math.min(target-t,snapped-t);}
    var maxSource=Math.max(0,(Number(a.duration)||dur)-dur),source=maxSource?((n*1.73)%maxSource):0;
    var c={id:api.uid('clip'),assetId:a.id,name:a.name,type:a.type,start:Number(t.toFixed(3)),duration:Number(dur.toFixed(3)),sourceStart:Number(source.toFixed(3)),fx:api.defaultFx(),effects:[],keyframes:{},volume:1,aiEdit:true};
    if(trMode!=='hard'&&n>0)c.transitionIn={name:trMode==='clean'?'Cross Dissolve':(n%4===0?'Whip Pan':n%3===0?'Zoom':'Cross Dissolve'),duration:Math.min(.35,dur*.2)};
    v1.clips.push(c);t+=dur;n++;
  }
  if(format==='social'){p.width=1080;p.height=1920;v1.clips.forEach(function(c){c.fx.scale=118;});}
  else{p.width=1920;p.height=1080;}
  p.duration=Math.max(target,t);aiState().lastBuild={clips:n,target:target,pace:pace,format:format,at:Date.now()};api.markDirty();api.renderAll();status('Auto Edit built · '+n+' editable cuts · '+Math.round(t)+' sec.');renderNotes();
}
function reframe(mode){
  var p=project(),clips=[];p.tracks.filter(function(t){return t.kind==='video';}).forEach(function(t){clips=clips.concat(t.clips);});if(!clips.length)return status('Add clips first.');
  api.snapshot();if(mode==='vertical'){p.width=1080;p.height=1920;}else if(mode==='square'){p.width=1080;p.height=1080;}else{p.width=1920;p.height=1080;}
  clips.forEach(function(c){var a=api.assetById(c.assetId);if(!a||!a.width||!a.height)return;var src=a.width/a.height,dst=p.width/p.height;c.fx.scale=Math.ceil((src>dst?src/dst:dst/src)*100);c.smartReframe=mode;});
  api.markDirty();api.renderAll();status('Reframed '+clips.length+' clips for '+mode+'.');
}
function addMask(type){
  var c=api.selectedClip();if(!c)return status('Select a video/image clip on the timeline first.');
  api.snapshot();c.mask={type:type,x:50,y:50,w:type==='ellipse'?48:58,h:type==='ellipse'?62:58,feather:12,invert:false};api.markDirty();api.drawFrame(true);status(type+' mask added to '+c.name+'.');
}
async function seek(el,t){return new Promise(function(resolve){var done=function(){el.removeEventListener('seeked',done);resolve();};el.addEventListener('seeked',done);try{el.currentTime=Math.max(0,Math.min((el.duration||t)-.02,t));}catch(e){done();}});}
function gray(data,w,x,y){var i=(y*w+x)*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114;}
async function trackSelected(){
  var c=api.selectedClip();if(!c||c.type!=='video')return status('Select a video clip for tracking.');
  var a=api.assetById(c.assetId),el=a&&api.mediaElement(a.id);if(!el||!el.videoWidth)return status('Video media must be online and loaded first.');
  status('Tracking subject…');var old=el.currentTime,wasPaused=el.paused;el.pause();var W=160,H=90,cv=document.createElement('canvas'),g=cv.getContext('2d',{willReadFrequently:true});cv.width=W;cv.height=H;
  var step=Math.max(.18,Math.min(.45,c.duration/45)),samples=Math.min(70,Math.max(2,Math.ceil(c.duration/step))),cx=Math.round((c.mask?c.mask.x:50)/100*W),cy=Math.round((c.mask?c.mask.y:50)/100*H),r=6,search=8,template=null,kx=[],ky=[];
  try{
    for(var s=0;s<samples;s++){
      var local=Math.min(c.duration-.03,s*step);await seek(el,(c.sourceStart||0)+local*(c.fx.speed||1));g.drawImage(el,0,0,W,H);var img=g.getImageData(0,0,W,H),d=img.data;
      if(!template){template=[];for(var yy=-r;yy<=r;yy++)for(var xx=-r;xx<=r;xx++){var px=Math.max(0,Math.min(W-1,cx+xx)),py=Math.max(0,Math.min(H-1,cy+yy));template.push(gray(d,W,px,py));}}
      else{
        var best=1e20,bx=cx,by=cy;
        for(var dy=-search;dy<=search;dy+=2)for(var dx=-search;dx<=search;dx+=2){var score=0,q=0,nx=cx+dx,ny=cy+dy;if(nx-r<0||ny-r<0||nx+r>=W||ny+r>=H)continue;for(var yy2=-r;yy2<=r;yy2+=2)for(var xx2=-r;xx2<=r;xx2+=2){score+=Math.abs(gray(d,W,nx+xx2,ny+yy2)-template[(yy2+r)*(r*2+1)+(xx2+r)]);q++;}score/=Math.max(1,q);if(score<best){best=score;bx=nx;by=ny;}}cx=bx;cy=by;
      }
      kx.push({time:Number(local.toFixed(3)),value:Number((((cx-W/2)/W)*100).toFixed(2))});ky.push({time:Number(local.toFixed(3)),value:Number((((cy-H/2)/H)*100).toFixed(2))});
    }
    c.keyframes=c.keyframes||{};c.keyframes.x=kx;c.keyframes.y=ky;c.tracker={engine:'tgg-block-match-v1',samples:samples,step:step,trackedAt:Date.now()};api.markDirty();api.renderTimeline();api.drawFrame(true);status('Tracking complete · '+samples+' motion samples written as editable X/Y keyframes.');
  }catch(e){status('Tracking stopped: '+e.message);}finally{await seek(el,old).catch(function(){});if(!wasPaused)el.play().catch(function(){});}
}
function applyGpu(mode){
  var c=api.selectedClip();if(!c)return status('Select a clip first.');api.snapshot();c.gpuFx={enabled:true,mode:mode,strength:Number(document.getElementById('gpuStrength').value)||60};api.markDirty();api.drawFrame(true);status('GPU '+mode+' shader enabled on '+c.name+'.');
}
async function detectCapabilities(){
  var gpu=window.TGGVideoGPU?window.TGGVideoGPU.capabilities():{webgl2:false,webgpu:!!navigator.gpu},encoder={supported:false,hardware:false};
  if('VideoEncoder' in window&&VideoEncoder.isConfigSupported){try{var p=project(),r=await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width:p.width,height:p.height,framerate:p.fps,bitrate:12000000,hardwareAcceleration:'prefer-hardware'});encoder.supported=!!r.supported;encoder.hardware=!!r.supported;}catch(e){}}
  capabilities={webgl2:!!gpu.webgl2,webgpu:!!gpu.webgpu,webcodecs:'VideoEncoder' in window,hardwareEncode:encoder.hardware,mediaRecorder:!!window.MediaRecorder};
  var host=document.getElementById('aiCapabilities');host.innerHTML=Object.keys(capabilities).map(function(k){return '<div><span>'+esc(k.replace(/([A-Z])/g,' $1'))+'</span><b class="'+(capabilities[k]?'cap-on':'cap-off')+'">'+(capabilities[k]?'READY':'FALLBACK')+'</b></div>';}).join('');
}
function renderNotes(){
  var a=aiState(),x=a.analysis||{},host=document.getElementById('aiNotes');if(!host)return;
  host.innerHTML='<div><b>'+Number(x.visuals||0)+'</b><span>visual assets</span></div><div><b>'+Number((a.beats||[]).length)+'</b><span>beat accents</span></div><div><b>'+Number((a.silence||[]).length)+'</b><span>silence gaps</span></div><div><b>'+Number(a.lastBuild&&a.lastBuild.clips||0)+'</b><span>auto cuts</span></div>';
}
function boot(){createUI();detectCapabilities();renderNotes();window.TGGVideoAI={analyzeMedia:analyzeMedia,detectBeats:detectBeats,detectSilence:detectSilence,autoEdit:autoEdit,trackSelected:trackSelected,reframe:reframe,capabilities:function(){return capabilities;}};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wait);else wait();
})();