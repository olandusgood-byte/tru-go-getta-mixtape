/* TGG NOVA Pitch/Formant Processor v2.0
 * Original NOVA implementation: dual-read-head time-preserving pitch shift
 * + LPC spectral-envelope transfer for formant preservation.
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
  let err=r[0]; const prev=new Float64Array(order);
  for(let m=1;m<=order;m++){
    let acc=r[m];
    for(let j=0;j<m-1;j++) acc -= out[j]*r[m-1-j];
    if(!(err>1e-12)) break;
    const refl=clamp(acc/err,-0.98,0.98);
    for(let j=0;j<m-1;j++) prev[j]=out[j];
    for(let j=0;j<m-1;j++) out[j]=prev[j]-refl*prev[m-2-j];
    out[m-1]=refl; err*=1-refl*refl;
    if(!(err>1e-12)) break;
  }
  return out;
}
function analysisSample(x, coeff, state){
  let y=x;
  for(let k=0;k<coeff.length;k++) y-=coeff[k]*state[k];
  for(let k=state.length-1;k>0;k--) state[k]=state[k-1];
  state[0]=x;
  return Number.isFinite(y)?y:0;
}
function synthesisSample(e, coeff, state){
  let y=e;
  for(let k=0;k<coeff.length;k++) y+=coeff[k]*state[k];
  if(!Number.isFinite(y)||Math.abs(y)>32){state.fill(0);y=0;}
  for(let k=state.length-1;k>0;k--) state[k]=state[k-1];
  state[0]=y;
  return y;
}
class NovaPitchFormantProcessor extends AudioWorkletProcessor{
  static get parameterDescriptors(){return[
    {name:'pitchSemitones',defaultValue:0,minValue:-12,maxValue:12,automationRate:'k-rate'},
    {name:'formantStrength',defaultValue:1,minValue:0,maxValue:1.5,automationRate:'k-rate'}
  ];}
  constructor(){
    super();
    this.ringSize=65536;this.mask=this.ringSize-1;
    this.inL=new Float32Array(this.ringSize);this.inR=new Float32Array(this.ringSize);
    this.absIn=0;this.phase=0;
    this.baseDelay=2048;this.sweepSpan=2048;this.latency=this.baseDelay+this.sweepSpan;
    this.histN=512;this.order=16;this.histPos=0;
    this.origHistL=new Float32Array(this.histN);this.origHistR=new Float32Array(this.histN);
    this.shiftHistL=new Float32Array(this.histN);this.shiftHistR=new Float32Array(this.histN);
    this.aStateL=new Float64Array(this.order);this.aStateR=new Float64Array(this.order);
    this.sStateL=new Float64Array(this.order);this.sStateR=new Float64Array(this.order);
    this.blocks=0;
    this.port.onmessage=e=>{if(e.data?.type==='reset')this.reset();};
  }
  reset(){
    this.inL.fill(0);this.inR.fill(0);this.absIn=0;this.phase=0;this.histPos=0;
    this.origHistL.fill(0);this.origHistR.fill(0);this.shiftHistL.fill(0);this.shiftHistR.fill(0);
    this.aStateL.fill(0);this.aStateR.fill(0);this.sStateL.fill(0);this.sStateR.fill(0);
  }
  readRing(buf,absolute,inputEnd){
    if(absolute<0||absolute>=inputEnd-1)return 0;
    const i0=Math.floor(absolute),f=absolute-i0;
    return buf[i0&this.mask]+(buf[(i0+1)&this.mask]-buf[i0&this.mask])*f;
  }
  ordered(hist){
    const out=new Float32Array(hist.length),p=this.histPos;
    for(let i=0;i<hist.length;i++)out[i]=hist[(p+i)%hist.length];
    return out;
  }
  shiftedSample(buf,t,inputEnd,ratio){
    if(Math.abs(ratio-1)<1e-7)return this.readRing(buf,t-(this.baseDelay+this.sweepSpan*0.5),inputEnd);
    const p1=this.phase,p2=(p1+0.5)%1;
    let d1,d2;
    if(ratio>=1){d1=this.baseDelay+this.sweepSpan*(1-p1);d2=this.baseDelay+this.sweepSpan*(1-p2);}
    else{d1=this.baseDelay+this.sweepSpan*p1;d2=this.baseDelay+this.sweepSpan*p2;}
    const w1=0.5-0.5*Math.cos(TWO_PI*p1),w2=1-w1;
    return w1*this.readRing(buf,t-d1,inputEnd)+w2*this.readRing(buf,t-d2,inputEnd);
  }
  process(inputs,outputs,parameters){
    const input=inputs[0],output=outputs[0];
    if(!output?.[0])return true;
    const L=input?.[0]||new Float32Array(output[0].length),R=input?.[1]||L;
    const outL=output[0],outR=output[1]||outL,N=outL.length,inputEnd=this.absIn+N;
    for(let i=0;i<N;i++){const q=(this.absIn+i)&this.mask;this.inL[q]=L[i]||0;this.inR[q]=R[i]||0;}
    const semi=parameters.pitchSemitones?.[0]??0,ratio=Math.pow(2,semi/12),form=clamp(parameters.formantStrength?.[0]??1,0,1.5);
    const phaseStep=Math.abs(ratio-1)/this.sweepSpan;
    const rawL=new Float32Array(N),rawR=new Float32Array(N);
    for(let i=0;i<N;i++){
      const t=this.absIn+i;
      rawL[i]=this.shiftedSample(this.inL,t,inputEnd,ratio);rawR[i]=this.shiftedSample(this.inR,t,inputEnd,ratio);
      const dryDelay=this.baseDelay+this.sweepSpan*0.5;
      const dryL=this.readRing(this.inL,t-dryDelay,inputEnd),dryR=this.readRing(this.inR,t-dryDelay,inputEnd);
      const h=this.histPos;this.origHistL[h]=dryL;this.origHistR[h]=dryR;this.shiftHistL[h]=rawL[i];this.shiftHistR[h]=rawR[i];
      this.histPos=(h+1)%this.histN;
      if(phaseStep>0)this.phase=(this.phase+phaseStep)%1;
    }
    const origCL=computeLpc(this.ordered(this.origHistL),this.order),origCR=computeLpc(this.ordered(this.origHistR),this.order);
    const shCL=computeLpc(this.ordered(this.shiftHistL),this.order),shCR=computeLpc(this.ordered(this.shiftHistR),this.order);
    let sum=0,peak=0;
    for(let i=0;i<N;i++){
      const resL=analysisSample(rawL[i],shCL,this.aStateL),resR=analysisSample(rawR[i],shCR,this.aStateR);
      let corrL=synthesisSample(resL,origCL,this.sStateL),corrR=synthesisSample(resR,origCR,this.sStateR);
      corrL=clamp(corrL,-4,4);corrR=clamp(corrR,-4,4);
      const yL=rawL[i]+form*(corrL-rawL[i]),yR=rawR[i]+form*(corrR-rawR[i]);
      outL[i]=Number.isFinite(yL)?yL:0;outR[i]=Number.isFinite(yR)?yR:0;
      sum+=outL[i]*outL[i]+outR[i]*outR[i];peak=Math.max(peak,Math.abs(outL[i]),Math.abs(outR[i]));
    }
    this.absIn=inputEnd;this.blocks++;
    if((this.blocks&31)===0)this.port.postMessage({type:'metrics',blocks:this.blocks,rms:Math.sqrt(sum/(N*2)),peak,pitchSemitones:semi,formantStrength:form,latencyFrames:this.latency});
    return true;
  }
}
registerProcessor('nova-pitch-formant-processor',NovaPitchFormantProcessor);
