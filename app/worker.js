// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Worker del nucleo (desktop, tappa I5): core-worker.js carica i moduli app/*-core.js e core.js (il nucleo estratto, identico a quello
   della pagina) e poi questo file. Qui girano le letture dei file, così la finestra non si blocca; i risultati tornano alla pagina
   per copia strutturata (numeri identici bit per bit) con i vettori trasferiti, senza copiarli. */
(function(){
  'use strict';
  // buffer dei vettori tipizzati del risultato, una volta sola: si trasferiscono invece di copiarli
  function transferOf(r){ const out=new Set(), seen=new Set(), walk=v=>{ if (!v || typeof v!=='object' || seen.has(v)) return; seen.add(v);
      if (ArrayBuffer.isView(v)){ if (v.buffer instanceof ArrayBuffer) out.add(v.buffer); return; }
      if (v instanceof Map){ v.forEach((x,k)=>{ walk(k); walk(x); }); return; }
      for (const k of Object.keys(v)) walk(v[k]); };
    walk(r); return [...out]; }
  // spettri DAD del .uv: gli Array dei valori diventano viste di un solo Float64Array (stessi numeri), così la pagina li riceve
  // senza ricostruire milioni di numeri sul suo thread
  function packUv(r){ if (!r || r.kind!=='uv' || !r.uv.scans.length || ArrayBuffer.isView(r.uv.scans[0].v)) return r;
    let n=0; for (const q of r.uv.scans) n+=q.v.length; const all=new Float64Array(n); let o=0;
    for (const q of r.uv.scans){ all.set(q.v, o); q.v=all.subarray(o, o+q.v.length); o+=q.v.length; }
    return r; }
  self.onmessage=e=>{ const m=e.data; let out;
    try{
      if (m.op==='read'){ const opt=m.opt||{}; let r=null, why=null, js=null, dual=null;
        if (m.wire) r=AcchRead.fromWire(m.wire, m.buf, m.name, opt, w=>{ why=w; return null; });
        if (!r || m.dual) js=AcchRead.read(m.buf, m.name, opt);
        if (m.dual && r) dual=AcchRead.same(r, js) || 'identici';   // ACCH_DUAL=1: i due motori sullo stesso file
        const use=dual && dual!=='identici' ? js : (r || js);   // con una differenza vale il JS di riferimento
        out={id:m.id, ok:true, r:packUv(use), engine:use===r?'rust':'js', why, dual, fnv:AcchRead.fnv(m.buf)};   // l'impronta del file (quickHash della pagina), fuori dalla finestra
      } else if (m.op==='call'){ const f=self[m.fn]; if (typeof f!=='function') throw new Error('funzione del nucleo sconosciuta: '+m.fn); out={id:m.id, ok:true, r:f.apply(null, m.args||[])}; }
      // I10: una funzione di un modulo puro (per esempio McrCore.alsGen per MCR-ALS sulle mappe); un generatore si esaurisce qui, nel worker
      else if (m.op==='mod'){ const M=self[m.mod], f=M && M[m.fn]; if (!/^(McrCore|AcchMap|KinCore)$/.test(m.mod) || typeof f!=='function') throw new Error('funzione sconosciuta: '+m.mod+'.'+m.fn);
        let r=f.apply(M, m.args||[]); if (r && typeof r.next==='function'){ let q; do { q=r.next(); } while (!q.done); r=q.value; } out={id:m.id, ok:true, r}; }
      else if (m.op==='ping') out={id:m.id, ok:true, r:{modules:Object.keys(self).filter(k=>/^Acch|^SorpCore$/.test(k))}};
      else throw new Error('operazione sconosciuta: '+m.op);
    }catch(err){ out={id:m.id, ok:false, err:String(err && err.stack || err)}; }
    try{ self.postMessage(out, transferOf(out.r)); }catch(err){ self.postMessage({id:m.id, ok:false, err:'copia del risultato: '+err}); }
  };
})();
