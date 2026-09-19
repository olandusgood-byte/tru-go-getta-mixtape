(function(){
'use strict';
var canvas=document.createElement('canvas'),gl=null,program=null,texture=null,position=null,uv=null;
function shader(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'shader_compile_failed');return s;}
function init(){
  if(gl)return true;
  try{
    gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
    if(!gl)return false;
    var vs=shader(gl.VERTEX_SHADER,`#version 300 es
      in vec2 aPos; in vec2 aUv; out vec2 vUv;
      void main(){vUv=aUv;gl_Position=vec4(aPos,0.0,1.0);}`);
    var fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision highp float;
      uniform sampler2D uTex; uniform vec2 uSize; uniform float uStrength; uniform int uMode;
      in vec2 vUv; out vec4 outColor;
      vec3 sat(vec3 c,float s){float l=dot(c,vec3(.2126,.7152,.0722));return mix(vec3(l),c,s);}
      void main(){
        float k=clamp(uStrength,0.0,1.0); vec2 uv=vUv; vec2 p=uv*2.0-1.0;
        if(uMode==4){float r2=dot(p,p);uv=(p*(1.0-r2*.16*k)+1.0)*.5;}
        vec4 base=texture(uTex,clamp(uv,0.001,.999)); vec3 c=base.rgb;
        if(uMode==1){c=(c-.5)*(1.0+.28*k)+.5;c=sat(c,1.0+.18*k);c*=vec3(1.0+.05*k,1.0,.98);float v=1.0-dot(p,p)*.22*k;c*=v;}
        else if(uMode==2){vec2 px=1.0/uSize;vec3 a=texture(uTex,clamp(uv+vec2(px.x,0),0.001,.999)).rgb;vec3 b=texture(uTex,clamp(uv-vec2(px.x,0),0.001,.999)).rgb;float e=length(a-b);c=mix(c,vec3(e*2.6,e*.65,2.2*e),k);}
        else if(uMode==3){vec2 d=vec2(4.0/uSize.x,0.0)*k;c.r=texture(uTex,clamp(uv+d,0.001,.999)).r;c.b=texture(uTex,clamp(uv-d,0.001,.999)).b;}
        outColor=vec4(clamp(c,0.0,1.0),base.a);
      }`);
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'shader_link_failed');
    var verts=new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, -1,1,0,1, 1,-1,1,0, 1,1,1,1]);
    var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);
    position=gl.getAttribLocation(program,'aPos');uv=gl.getAttribLocation(program,'aUv');
    gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,16,0);
    gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);
    texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return true;
  }catch(e){gl=null;return false;}
}
function process(source,opts){
  if(!opts||opts.enabled===false||!init())return null;
  var w=source.width||source.videoWidth,h=source.height||source.videoHeight;if(!w||!h)return null;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
  var modes={filmic:1,neon:2,prism:3,lens:4},mode=modes[String(opts.mode||'filmic').toLowerCase()]||1;
  gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);}catch(e){return null;}
  gl.uniform1i(gl.getUniformLocation(program,'uTex'),0);
  gl.uniform2f(gl.getUniformLocation(program,'uSize'),w,h);
  gl.uniform1f(gl.getUniformLocation(program,'uStrength'),Math.max(0,Math.min(1,Number(opts.strength==null?60:opts.strength)/100)));
  gl.uniform1i(gl.getUniformLocation(program,'uMode'),mode);
  gl.drawArrays(gl.TRIANGLES,0,6);return canvas;
}
window.TGGVideoGPU={process:process,capabilities:function(){return {webgl2:init(),webgpu:!!navigator.gpu};}};
})();