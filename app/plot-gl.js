// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Tracce del grafico a schermo con WebGL (tappa I6, solo desktop).
   drawPlot (index.html) disegna come sempre assi, griglia, aree, legenda ed etichette con Canvas 2D; a schermo, nel desktop, le tracce
   le disegna questo modulo su un canvas WebGL in mezzo a due canvas 2D («sotto»: sfondo, assi, aree; «sopra»: legenda, riquadro,
   etichette), così l'ordine dei livelli resta quello del disegno su un solo canvas.
   - La geometria è la stessa di Canvas 2D: traceLine scrive su un registratore (recorder) gli stessi punti che darebbe a ctx.lineTo,
     decimati per colonna di pixel (minimo e massimo di ogni colonna: un picco stretto non sparisce).
   - Ogni segmento è un rettangolo con le estremità arrotondate (distanza dal segmento nel frammento, bordo sfumato di un pixel):
     giunzioni rotonde come lineJoin 'round'. Ogni serie si disegna prima in una maschera con fusione MAX (copertura una volta sola,
     come il tratto di Canvas 2D, anche dove i segmenti si sovrappongono), poi si compone sopra le precedenti con il suo colore.
   - Tratteggi: lunghezza percorsa per segmento e schema fino a 4 valori, come setLineDash.
   - Se WebGL non c'è, se manca la fusione MAX o se il contesto si perde, create() dà null o available diventa false:
     drawPlot disegna tutto con Canvas 2D come prima (ripiego).
   Le esportazioni (PNG, SVG, PDF) non passano mai da qui: usano drawPlot su un canvas o un contesto proprio. */
(function(win){
  'use strict';
  const VS=`attribute vec2 q; attribute vec2 sa; attribute vec2 sb; attribute float cum;
uniform vec2 res; uniform float hw;
varying vec2 pa; varying vec2 pb; varying vec2 pp; varying float c0;
void main(){ vec2 a=sa, b=sb, d=b-a; float L=length(d); vec2 t=L>1e-6 ? d/L : vec2(1.0,0.0); vec2 n=vec2(-t.y,t.x); float e=hw+1.0;
  vec2 p=(q.x<0.5 ? a-t*e : b+t*e) + n*(q.y<0.5 ? -e : e);
  pa=a; pb=b; pp=p; c0=cum; gl_Position=vec4(p.x/res.x*2.0-1.0, 1.0-p.y/res.y*2.0, 0.0, 1.0); }`;
  const FS=`precision highp float; varying vec2 pa; varying vec2 pb; varying vec2 pp; varying float c0;
uniform float hw; uniform vec4 clip; uniform vec4 dash; uniform float dashN; uniform float dashT;
void main(){ if (pp.x<clip.x || pp.y<clip.y || pp.x>clip.z || pp.y>clip.w) discard;
  vec2 d=pb-pa; float L2=dot(d,d); float h=L2>0.0 ? clamp(dot(pp-pa,d)/L2,0.0,1.0) : 0.0; float dist=length(pp-pa-d*h);
  float cov=clamp(hw+0.5-dist,0.0,1.0); if (cov<=0.0) discard;
  if (dashN>0.0){ float s=mod(c0+h*sqrt(L2), dashT); float acc=0.0; bool on=true;
    for (int i=0;i<4;i++){ if (float(i)>=dashN) break; float v=dash[i]; if (s<acc+v) break; acc+=v; on=!on; }
    if (!on) discard; }
  gl_FragColor=vec4(cov,0.0,0.0,cov); }`;
  const VQ=`attribute vec2 q; varying vec2 uv; void main(){ uv=q; gl_Position=vec4(q*2.0-1.0,0.0,1.0); }`;
  const FQ=`precision mediump float; varying vec2 uv; uniform sampler2D m; uniform vec4 col; void main(){ float c=texture2D(m,uv).r*col.a; gl_FragColor=vec4(col.rgb*c,c); }`;

  function sh(gl, type, src){ const s=gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function prog(gl, vs, fs){ const p=gl.createProgram(); gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
  // colore CSS → [r,g,b,a] tra 0 e 1, con il parser del browser (stessi colori di Canvas 2D)
  const cc=document.createElement('canvas').getContext('2d'), colors=new Map();
  function rgba(css){ if (colors.has(css)) return colors.get(css); cc.fillStyle='#000'; cc.fillStyle=css; const v=cc.fillStyle; let r;
    if (v[0]==='#'){ const n=parseInt(v.slice(1),16); r=[(n>>16&255)/255, (n>>8&255)/255, (n&255)/255, 1]; }
    else { const m=v.match(/[\d.]+/g).map(Number); r=[m[0]/255, m[1]/255, m[2]/255, m.length>3 ? m[3] : 1]; }
    colors.set(css, r); return r; }

  /* registratore con l'interfaccia di Canvas 2D che traceLine usa: raccoglie le spezzate in pixel del canvas (unità × k) */
  function recorder(k){ const list=[]; let buf=new Float32Array(4096), n=0, start=-1;
    const put=(x,y)=>{ if (n+2>buf.length){ const b=new Float32Array(buf.length*2); b.set(buf); buf=b; } buf[n++]=x*k; buf[n++]=y*k; };
    const R={ strokeStyle:'#000', lineWidth:1, lineJoin:'round', lineCap:'round', _dash:[], _runs:[],
      setLineDash(a){ this._dash=(a||[]).slice(); }, beginPath(){ this._runs=[]; start=-1; },
      moveTo(x,y){ start=n; this._runs.push([n,0]); put(x,y); this._runs[this._runs.length-1][1]=n; },
      lineTo(x,y){ if (start<0){ this.moveTo(x,y); return; } put(x,y); this._runs[this._runs.length-1][1]=n; },
      stroke(){ for (const [a,b] of this._runs){ let pts=buf.subarray(a,b); if (pts.length<2) continue; if (pts.length===2) pts=Float32Array.from([pts[0],pts[1],pts[0],pts[1]]);
          list.push({pts, color:this.strokeStyle, w:this.lineWidth*k, dash:this._dash.map(v=>v*k)}); } this._runs=[]; start=-1; },
      list };
    return R; }

  function create(host){
    let cv=null, gl=null, ok=false, over=null;
    const st={available:false, frames:0, lost:0, reason:''};
    try{
      cv=document.createElement('canvas'); cv.className='pvlayer'; cv.id='pvgl'; cv.setAttribute('aria-hidden','true');
      over=document.createElement('canvas'); over.className='pvlayer'; over.id='pvt'; over.setAttribute('aria-hidden','true');
      const opt={alpha:true, premultipliedAlpha:true, antialias:false, preserveDrawingBuffer:false, depth:false, stencil:false};
      gl=cv.getContext('webgl2', opt) || cv.getContext('webgl', opt);
      if (!gl){ st.reason='WebGL non disponibile'; return st; }
      const isGL2=typeof WebGL2RenderingContext!=='undefined' && gl instanceof WebGL2RenderingContext;
      const minmax=isGL2 ? {MAX:gl.MAX} : (()=>{ const e=gl.getExtension('EXT_blend_minmax'); return e ? {MAX:e.MAX_EXT} : null; })();
      const inst=isGL2 ? {draw:(m,f,c,n)=>gl.drawArraysInstanced(m,f,c,n), div:(l,d)=>gl.vertexAttribDivisor(l,d)} : (()=>{ const e=gl.getExtension('ANGLE_instanced_arrays'); return e ? {draw:(m,f,c,n)=>e.drawArraysInstancedANGLE(m,f,c,n), div:(l,d)=>e.vertexAttribDivisorANGLE(l,d)} : null; })();
      if (!minmax || !inst){ st.reason='WebGL senza fusione MAX o istanze'; return st; }
      const P=prog(gl, VS, FS), Q=prog(gl, VQ, FQ);
      const L={q:gl.getAttribLocation(P,'q'), sa:gl.getAttribLocation(P,'sa'), sb:gl.getAttribLocation(P,'sb'), cum:gl.getAttribLocation(P,'cum'), res:gl.getUniformLocation(P,'res'), hw:gl.getUniformLocation(P,'hw'), clip:gl.getUniformLocation(P,'clip'), dash:gl.getUniformLocation(P,'dash'), dashN:gl.getUniformLocation(P,'dashN'), dashT:gl.getUniformLocation(P,'dashT'),
        qq:gl.getAttribLocation(Q,'q'), m:gl.getUniformLocation(Q,'m'), col:gl.getUniformLocation(Q,'col')};
      const quad=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW);
      const segB=gl.createBuffer(), cumB=gl.createBuffer();
      let tex=null, fbo=null, tw=0, th=0;
      function target(w,h){ if (tex && tw===w && th===h) return; if (tex){ gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); }
        tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        for (const [p,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
        fbo=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer'); tw=w; th=h; }
      cv.addEventListener('webglcontextlost', e=>{ e.preventDefault(); ok=false; st.lost++; st.reason='contesto WebGL perso'; console.warn('[grafico] contesto WebGL perso: disegno con Canvas 2D'); if (st.onLost) try{ st.onLost(); }catch(_){ } });
      cv.addEventListener('webglcontextrestored', ()=>{ console.warn('[grafico] contesto WebGL ripristinato: alla prossima apertura dell\'app si torna a WebGL'); });
      let W=0, H=0, clipR=null, todo=[], Z=new Float32Array(0);
      const zeros=n=>{ if (Z.length<n) Z=new Float32Array(Math.max(n, Z.length*2)); return Z.subarray(0,n); };
      Object.assign(st, {
        canvas:cv, over, recorder,
        size(w,h){ for (const c of [cv, over]) if (c.width!==w || c.height!==h){ c.width=w; c.height=h; } },
        begin(w, h, clip){ W=w; H=h; clipR=clip; todo=[]; },
        add(list){ todo=todo.concat(list); },
        end(){ if (!ok) return false; gl.viewport(0,0,W,H); target(W,H);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND);
          for (const t of todo){ const p=t.pts, n=p.length/2-1; if (n<1) continue;
            let D=t.dash.filter(v=>v>=0); if (D.length%2) D=D.concat(D); const dn=D.length && D.length<=4 && D.some(v=>v>0) ? D.length : 0;
            // lunghezza percorsa all'inizio di ogni segmento: serve solo ai tratteggi
            let cum=zeros(n); if (dn){ cum=new Float32Array(n); let s=0; for (let i=0;i<n;i++){ cum[i]=s; s+=Math.hypot(p[2*i+2]-p[2*i], p[2*i+3]-p[2*i+1]); } }
            // maschera della serie: copertura massima dei suoi segmenti
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.clear(gl.COLOR_BUFFER_BIT); gl.blendEquation(minmax.MAX); gl.blendFunc(gl.ONE, gl.ONE);
            gl.useProgram(P); gl.uniform2f(L.res, W, H); gl.uniform1f(L.hw, Math.max(0.05, t.w/2)); gl.uniform4f(L.clip, clipR.x, clipR.y, clipR.x+clipR.w, clipR.y+clipR.h);
            gl.uniform4f(L.dash, D[0]||0, D[1]||0, D[2]||0, D[3]||0); gl.uniform1f(L.dashN, dn); gl.uniform1f(L.dashT, dn ? D.slice(0,dn).reduce((a,b)=>a+b,0) : 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(L.q); gl.vertexAttribPointer(L.q, 2, gl.FLOAT, false, 0, 0); inst.div(L.q, 0);
            // i due estremi di ogni segmento vengono dallo stesso vettore dei punti (nessuna copia): sb è sa spostato di un punto
            gl.bindBuffer(gl.ARRAY_BUFFER, segB); gl.bufferData(gl.ARRAY_BUFFER, p, gl.STREAM_DRAW);
            gl.enableVertexAttribArray(L.sa); gl.vertexAttribPointer(L.sa, 2, gl.FLOAT, false, 8, 0); inst.div(L.sa, 1);
            gl.enableVertexAttribArray(L.sb); gl.vertexAttribPointer(L.sb, 2, gl.FLOAT, false, 8, 8); inst.div(L.sb, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, cumB); gl.bufferData(gl.ARRAY_BUFFER, cum, gl.STREAM_DRAW); gl.enableVertexAttribArray(L.cum); gl.vertexAttribPointer(L.cum, 1, gl.FLOAT, false, 0, 0); inst.div(L.cum, 1);
            inst.draw(gl.TRIANGLE_STRIP, 0, 4, n);
            inst.div(L.sa, 0); inst.div(L.sb, 0); inst.div(L.cum, 0); gl.disableVertexAttribArray(L.sa); gl.disableVertexAttribArray(L.sb); gl.disableVertexAttribArray(L.cum);
            // composizione con il colore della serie
            gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(Q); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(L.m, 0); const c=rgba(t.color); gl.uniform4f(L.col, c[0], c[1], c[2], c[3]);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(L.qq); gl.vertexAttribPointer(L.qq, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
          st.frames++; return true; },
        clear(){ if (ok){ gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); } const c=over.getContext('2d'); c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,over.width,over.height); },
        // prova: un segmento disegnato e riletto (alcuni driver danno un contesto che non disegna)
        selfTest(){ try{ cv.width=8; cv.height=8; ok=true; st.begin(8,8,{x:0,y:0,w:8,h:8}); st.add([{pts:new Float32Array([0,4,8,4]), color:'#ff0000', w:4, dash:[]}]); st.end();
            const px=new Uint8Array(4); gl.readPixels(4,4,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); ok=px[0]>200 && px[3]>200; if (!ok) st.reason='WebGL non disegna'; return ok; }catch(e){ ok=false; st.reason=String(e); return false; } }
      });
      delete st.available; Object.defineProperty(st, 'available', {get:()=>ok, set:v=>{ ok=!!v; }, enumerable:true});
      if (!st.selfTest()) return st;
      ok=true;
      if (host){ host.parentNode.insertBefore(cv, host.nextSibling); host.parentNode.insertBefore(over, cv.nextSibling); }
      return st;
    }catch(e){ console.warn('[grafico] WebGL non usato: '+e); st.reason=String(e); return st; }
  }
  win.AcchPlotGL={create, recorder, rgba};
})(window);
