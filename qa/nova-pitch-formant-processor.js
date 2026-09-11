/* TGG NOVA Pitch/Formant Processor v1.0
 * Original NOVA implementation: granular time-preserving pitch shift + LPC envelope transfer.
 * No third-party runtime dependency.
 */
const TWO_PI = Math.PI * 2;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function hamming(n,N){ return N<=1 ? 1 : 0.54 - 0.46*Math.cos(TWO_PI*n/(N-1)); }
function computeLpc(frame, order=16){
  const N=frame.length, r=new Float64Array(order+1);
  for(let k=0;k<=order;k++){
    let sum=0;
    for(let n=0;n<N-k;n++){
      const a=frame[n]*hamming(n,N), b=frame[n+k]*hamming(n+k,N);
      sum += a*b;
    }
    r[k]=sum;
  }
  const out=new Float64Array(order);
  if(!(r[0]>1e-9)) return out;
  let err=r[0];
  const prev=new Float64Array(order);
  for(let m=1;m<=order;m++){
    let acc=r[m];
    for(let j=0;j<m-1;j++) acc -= out[j]*r[m-1-j];
    if(!(err>1e-12)) break;
    const refl=clamp(acc/err,-0.98,0.98);
    for(let j=0;j<m-1;j++) prev[j]=out[j];
    for(let j=0;j<m-1;j++) out[j]=prev[j]-refl*prev[m-2-j];
    out[m-1]=refl;
    err *= 1-refl*refl;
    if(!(err>1e-12)) break;
  }
  return out;
}
function analysisSample(x, coeff, state){
  let y=x;
  for(let k=0;k<coeff.length;k++) y -= coeff[k]*state[k];
  for(let k=state.length-1;k>0;k--) state[k]=state[k-1];
  state[0]=x;
  return Number.isFinite(y)?y:0;
}
function synthesisSample(e, coeff, state){
  let y=e;
  for(let k=0;k<coeff.length;k++) y += coeff[k]*state[k];
  if(!Number.isFinite(y) || Math.abs(y)>32){ state.fill(0); y=0; }
  for(let k=state.length-1;k>0;k--) state[k]=state[k-1];
  state[0]=y;
  return y;
}

class NovaPitchFormantProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(){
    return [
      {name:'pitchSemitones',defaultValue:0,minValue:-12,maxValue:12,automationRate:'k-rate'},
      {name:'formantStrength',defaultValue:1,minValue:0,maxValue:1.5,automationRate:'k-rate'}
    ];
  }
  constructor(){
    super();
    this.ringSize=65536; this.mask=this.ringSize-1;
    this.inL=new Float32Array(this.ringSize); this.inR=new Float32Array(this.ringSize);
    this.olaL=new Float32Array(this.ringSize); this.olaR=new Float32Array(this.ringSize); this.olaN=new Float32Array(this.ringSize);
    this.absIn=0; this.absOut=0; this.nextGrain=0;
    this.grain=1024; this.hop=256; this.latency=4096;
    this.histN=512; this.origHistL=new Float32Array(this.histN); this.origHistR=new Float32Array(this.histN);
    this.shiftHistL=new Float32Array(this.histN); this.shiftHistR=new Float32Array(this.histN); this.histPos=0;
    this.order=16;
    this.aStateL=new Float64Array(this.order); this.aStateR=new Float64Array(this.order);
    this.sStateL=new Float64Array(this.order); this.sStateR=new Float64Array(this.order);
    this.blocks=0; this.lastPitch=0; this.lastFormant=1;
    this.port.onmessage=(e)=>{ if(e.data?.type==='reset') this.reset(); };
  }
  reset(){
    this.inL.fill(0);this.inR.fill(0);this.olaL.fill(0);this.olaR.fill(0);this.olaN.fill(0);
    this.absIn=0;this.absOut=0;this.nextGrain=0;this.histPos=0;
    this.origHistL.fill(0);this.origHistR.fill(0);this.shiftHistL.fill(0);this.shiftHistR.fill(0);
    this.aStateL.fill(0);this.aStateR.fill(0);this.sStateL.fill(0);this.sStateR.fill(0);
  }
  readRing(buf, absolute, inputEnd){
    if(absolute<0 || absolute>=inputEnd-1) return 0;
    const i0=Math.floor(absolute), frac=absolute-i0;
    const a=buf[i0 & this.mask], b=buf[(i0+1)&this.mask];
    return a+(b-a)*frac;
  }
  generateGrains(pitch,inputEnd,targetEnd){
    const span=(this.grain-1)*pitch;
    let guard=0;
    while(this.nextGrain < targetEnd && guard++<32){
      const sourceStart=this.nextGrain-this.latency;
      const sourceMax=sourceStart+span;
      if(sourceMax>=inputEnd-1) break;
      for(let i=0;i<this.grain;i++){
        const phase=(i+0.5)/this.grain;
        const w=Math.sin(Math.PI*phase); const win=w*w;
        const src=sourceStart+i*pitch;
        const dst=(this.nextGrain+i)&this.mask;
        this.olaL[dst]+=this.readRing(this.inL,src,inputEnd)*win;
        this.olaR[dst]+=this.readRing(this.inR,src,inputEnd)*win;
        this.olaN[dst]+=win;
      }
      this.nextGrain+=this.hop;
    }
  }
  ordered(hist){
    const out=new Float32Array(hist.length), p=this.histPos;
    for(let i=0;i<hist.length;i++) out[i]=hist[(p+i)%hist.length];
    return out;
  }
  process(inputs,outputs,parameters){
    const input=inputs[0], output=outputs[0];
    if(!output?.[0]) return true;
    const L=input?.[0]||new Float32Array(output[0].length), R=input?.[1]||L;
    const outL=output[0], outR=output[1]||outL, N=outL.length;
    for(let i=0;i<N;i++){
      const idx=(this.absIn+i)&this.mask; this.inL[idx]=L[i]||0; this.inR[idx]=R[i]||0;
    }
    const inputEnd=this.absIn+N;
    const semi=parameters.pitchSemitones?.[0]??0, pitch=Math.pow(2,semi/12);
    const form=clamp(parameters.formantStrength?.[0]??1,0,1.5);
    this.lastPitch=semi; this.lastFormant=form;
    this.generateGrains(pitch,inputEnd,this.absOut+N+this.grain);

    const rawL=new Float32Array(N), rawR=new Float32Array(N), dryL=new Float32Array(N), dryR=new Float32Array(N);
    for(let i=0;i<N;i++){
      const abs=this.absOut+i, oi=abs&this.mask, n=this.olaN[oi];
      rawL[i]=n>1e-7?this.olaL[oi]/n:0; rawR[i]=n>1e-7?this.olaR[oi]/n:0;
      this.olaL[oi]=0;this.olaR[oi]=0;this.olaN[oi]=0;
      dryL[i]=this.readRing(this.inL,abs-this.latency,inputEnd);
      dryR[i]=this.readRing(this.inR,abs-this.latency,inputEnd);
      const hp=this.histPos;
      this.origHistL[hp]=dryL[i];this.origHistR[hp]=dryR[i];this.shiftHistL[hp]=rawL[i];this.shiftHistR[hp]=rawR[i];
      this.histPos=(hp+1)%this.histN;
    }
    const origCL=computeLpc(this.ordered(this.origHistL),this.order), origCR=computeLpc(this.ordered(this.origHistR),this.order);
    const shCL=computeLpc(this.ordered(this.shiftHistL),this.order), shCR=computeLpc(this.ordered(this.shiftHistR),this.order);
    let sum=0,peak=0;
    for(let i=0;i<N;i++){
      const resL=analysisSample(rawL[i],shCL,this.aStateL), resR=analysisSample(rawR[i],shCR,this.aStateR);
      let corrL=synthesisSample(resL,origCL,this.sStateL), corrR=synthesisSample(resR,origCR,this.sStateR);
      corrL=clamp(corrL,-4,4);corrR=clamp(corrR,-4,4);
      const yL=rawL[i]+form*(corrL-rawL[i]), yR=rawR[i]+form*(corrR-rawR[i]);
      outL[i]=Number.isFinite(yL)?yL:0; outR[i]=Number.isFinite(yR)?yR:0;
      sum+=outL[i]*outL[i]+outR[i]*outR[i];peak=Math.max(peak,Math.abs(outL[i]),Math.abs(outR[i]));
    }
    this.absIn=inputEnd; this.absOut+=N; this.blocks++;
    if((this.blocks&31)===0){
      this.port.postMessage({type:'metrics',blocks:this.blocks,rms:Math.sqrt(sum/(N*2)),peak,pitchSemitones:semi,formantStrength:form,latencyFrames:this.latency});
    }
    return true;
  }
}
registerProcessor('nova-pitch-formant-processor',NovaPitchFormantProcessor);
