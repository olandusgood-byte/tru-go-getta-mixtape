import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const CORE_URL=String(process.env.TGG_CORE_URL||'https://tgg-core.onrender.com').replace(/\/$/,'');
const OIDC_AUDIENCE='tgg-core-video-render-worker';
const oidcRequestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if(!oidcRequestUrl||!oidcRequestToken)throw new Error('GitHub OIDC runtime unavailable.');

let jobId=null,leaseToken=null,latestProgress=1,heartbeatTimer=null,tempDir=null,oidcCache=null,oidcCacheAt=0;

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function oidcToken(){
  if(oidcCache&&Date.now()-oidcCacheAt<180000)return oidcCache;
  const sep=oidcRequestUrl.includes('?')?'&':'?';
  const r=await fetch(oidcRequestUrl+sep+'audience='+encodeURIComponent(OIDC_AUDIENCE),{
    headers:{Authorization:'bearer '+oidcRequestToken},signal:AbortSignal.timeout(10000)
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.value)throw new Error('OIDC token request failed ('+r.status+').');
  oidcCache=String(d.value);oidcCacheAt=Date.now();return oidcCache;
}
async function broker(operation,args={}){
  const token=await oidcToken();
  const r=await fetch(CORE_URL+'/v1/video-studio/render-worker',{
    method:'POST',
    headers:{'content-type':'application/json','x-tgg-github-oidc':token},
    body:JSON.stringify({operation,...args}),
    signal:AbortSignal.timeout(25000)
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw new Error('TGG Core render broker '+operation+' failed ('+r.status+'): '+(d.error||'unknown_error'));
  return d.data||{};
}
async function probe(file){
  return new Promise((resolve,reject)=>{
    const p=spawn('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height:format=duration','-of','json',file]);
    let out='',err='';
    p.stdout.on('data',d=>out+=d.toString());
    p.stderr.on('data',d=>err=(err+d.toString()).slice(-4000));
    p.on('error',reject);
    p.on('close',code=>{
      if(code!==0)return reject(new Error('ffprobe failed ('+code+'): '+err));
      try{
        const j=JSON.parse(out||'{}'),streams=Array.isArray(j.streams)?j.streams:[],v=streams.find(s=>s.codec_type==='video')||{},a=streams.find(s=>s.codec_type==='audio')||null;
        resolve({width:Number(v.width)||null,height:Number(v.height)||null,duration:Number(j.format?.duration)||null,video_codec:v.codec_name||null,audio_codec:a?.codec_name||null,has_audio:Boolean(a)});
      }catch(e){reject(e);}
    });
  });
}
function scaleFilter(preset,w,h){
  const edge=preset==='720p'?720:preset==='1080p'?1080:preset==='2160p'?2160:null;
  if(!edge)return null;
  if(w&&h&&w<h)return 'scale='+edge+':-2:flags=lanczos';
  if(w&&h&&w===h)return 'scale='+edge+':'+edge+':flags=lanczos';
  return 'scale=-2:'+edge+':flags=lanczos';
}
async function heartbeat(){
  if(!jobId||!leaseToken)return;
  await broker('heartbeat',{job_id:jobId,lease_token:leaseToken,progress:Math.max(1,Math.min(98,latestProgress))});
}
async function transcode(input,output,preset,source){
  const args=['-y','-hide_banner','-loglevel','warning','-i',input,'-map','0:v:0','-map','0:a:0?'];
  const vf=scaleFilter(preset,source.width,source.height);
  if(vf)args.push('-vf',vf);
  args.push('-c:v','libx264','-preset','medium','-crf',preset==='2160p'?'19':'18','-pix_fmt','yuv420p');
  if(source.has_audio)args.push('-c:a','aac','-b:a','192k');
  else args.push('-an');
  args.push('-movflags','+faststart','-progress','pipe:1','-nostats',output);
  await new Promise((resolve,reject)=>{
    const p=spawn('ffmpeg',args);let err='',carry='';
    p.stdout.on('data',d=>{
      carry+=d.toString();const lines=carry.split(/\r?\n/);carry=lines.pop()||'';
      for(const line of lines){
        const parts=line.split('=',2);if(parts[0]==='out_time_us'&&source.duration){
          const sec=Number(parts[1])/1000000;if(Number.isFinite(sec))latestProgress=Math.max(latestProgress,Math.min(94,Math.floor(sec/source.duration*94)));
        }
      }
    });
    p.stderr.on('data',d=>err=(err+d.toString()).slice(-6000));
    p.on('error',reject);
    p.on('close',code=>code===0?resolve():reject(new Error('ffmpeg failed ('+code+'): '+err)));
  });
}
async function uploadOutput(file){
  const bytes=await readFile(file),token=await oidcToken();
  const r=await fetch(CORE_URL+'/v1/video-studio/render-worker/jobs/'+encodeURIComponent(jobId)+'/output',{
    method:'PUT',
    headers:{
      'content-type':'video/mp4',
      'content-length':String(bytes.length),
      'x-tgg-github-oidc':token,
      'x-tgg-render-lease':leaseToken
    },
    body:bytes,
    signal:AbortSignal.timeout(20*60*1000)
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw new Error('Render output upload failed ('+r.status+'): '+(d.error||'unknown_error'));
  return d.media;
}
async function main(){
  await broker('register',{progress:0});
  const claim=await broker('claim');
  const manifest=claim.manifest||null;
  if(!manifest){console.log('TGG Core video render queue idle.');return;}
  jobId=String(manifest.job.id);leaseToken=String(manifest.lease_token);
  const preset=String(manifest.job.preset||'1080p').toLowerCase();
  if(!['720p','1080p','2160p','source'].includes(preset))throw new Error('Unsupported output preset: '+preset);
  console.log('Claimed TGG Core video render '+jobId+' · '+preset);
  tempDir=await mkdtemp(join(tmpdir(),'tgg-core-render-'));
  const input=join(tempDir,'source'),output=join(tempDir,'master-'+preset+'.mp4');
  const dl=await broker('download_url',{job_id:jobId,lease_token:leaseToken});
  const sourceResponse=await fetch(dl.signed_url,{signal:AbortSignal.timeout(10*60*1000)});
  if(!sourceResponse.ok)throw new Error('Private source download failed ('+sourceResponse.status+').');
  await writeFile(input,Buffer.from(await sourceResponse.arrayBuffer()));
  const source=await probe(input);
  if(!source.width||!source.height)throw new Error('Source video stream missing.');
  heartbeatTimer=setInterval(()=>heartbeat().catch(e=>console.warn('Heartbeat warning:',e.message)),60000);
  await heartbeat();
  await transcode(input,output,preset,source);
  latestProgress=96;await heartbeat();
  const outputProbe=await probe(output),outputStat=await stat(output);
  latestProgress=98;await heartbeat();
  const media=await uploadOutput(output);
  latestProgress=99;await heartbeat();
  await broker('complete',{
    job_id:jobId,lease_token:leaseToken,media_object_id:media.id,
    width:outputProbe.width,height:outputProbe.height,
    duration_ms:outputProbe.duration?Math.round(outputProbe.duration*1000):null,
    codec_video:outputProbe.video_codec||'h264',
    codec_audio:outputProbe.audio_codec||null
  });
  console.log('Completed TGG Core render '+jobId+' -> '+media.storage_key+' ('+outputStat.size+' bytes)');
  jobId=null;leaseToken=null;
  await broker('register',{progress:0});
}
try{
  await main();
}catch(e){
  console.error(e?.stack||e?.message||String(e));
  if(jobId&&leaseToken){
    try{
      await broker('fail',{job_id:jobId,lease_token:leaseToken,error:String(e?.message||e).slice(0,1900),retryable:!/Unsupported output preset|Source video stream missing/.test(String(e?.message||e))});
    }catch(f){console.error('Could not report render failure:',f?.message||String(f));}
  }
  process.exitCode=1;
}finally{
  if(heartbeatTimer)clearInterval(heartbeatTimer);
  if(tempDir)await rm(tempDir,{recursive:true,force:true}).catch(()=>{});
}
