// Estrattore di testo minimo per i PDF di jsPDF (font standard, codifica WinAnsi, flussi Flate). Niente dipendenze esterne:
// pdf.js non è in node_modules. Restituisce le righe di testo nell'ordine dei comandi Tj/TJ di ogni pagina.
'use strict';
const zlib=require('zlib');
const WIN={0x80:'€',0x82:'‚',0x84:'„',0x85:'…',0x86:'†',0x87:'‡',0x89:'‰',0x8a:'Š',0x8b:'‹',0x8c:'Œ',0x8e:'Ž',0x91:'‘',0x92:'’',0x93:'“',0x94:'”',0x95:'•',0x96:'–',0x97:'—',0x99:'™',0x9a:'š',0x9b:'›',0x9c:'œ',0x9e:'ž',0x9f:'Ÿ'};
function unescapePdf(s){
  let out=''; for (let i=0;i<s.length;i++){ const c=s[i]; if (c!=='\\'){ out+=c; continue; } const n=s[++i];
    if (n==='n') out+='\n'; else if (n==='r') out+='\r'; else if (n==='t') out+='\t'; else if (n==='b') out+='\b'; else if (n==='f') out+='\f';
    else if (/[0-7]/.test(n)){ let o=n; while (o.length<3 && /[0-7]/.test(s[i+1])) o+=s[++i]; out+=String.fromCharCode(parseInt(o,8)); }
    else if (n==='\r' || n==='\n'){ if (n==='\r' && s[i+1]==='\n') i++; } else out+=n; }
  return [...out].map(ch=>{ const k=ch.charCodeAt(0); return WIN[k]||ch; }).join('');
}
function strings(content){   // stringhe letterali (...) con parentesi bilanciate
  const out=[]; let i=0;
  while (i<content.length){ const j=content.indexOf('(',i); if (j<0) break; let d=1, k=j+1, buf='';
    while (k<content.length && d>0){ const c=content[k]; if (c==='\\'){ buf+=c+content[k+1]; k+=2; continue; } if (c==='(') d++; else if (c===')'){ d--; if (!d) break; } buf+=c; k++; }
    const after=content.slice(k+1, k+40); out.push({s:unescapePdf(buf), op:/^\s*Tj/.test(after)?'Tj':/^[^)]*?\]\s*TJ/.test(after)?'TJ':'?'}); i=k+1; }
  return out;
}
function pdfText(buf){
  const bin=buf.toString('latin1'), lines=[]; let m; const re=/stream\r?\n/g;
  while ((m=re.exec(bin))){ const start=m.index+m[0].length, end=bin.indexOf('endstream', start); if (end<0) break;
    const dict=bin.slice(Math.max(0,m.index-300), m.index), own=dict.slice(dict.lastIndexOf('<<'));
    // lunghezza dal dizionario (/Length n): togliere «\r?\n» in coda tagliava il dato compresso quando il suo ultimo byte
    // era 0x0D (circa 1 PDF su 1000, secondo la data nel riepilogo): inflate falliva e la pagina «spariva» (R6, fallimenti rari)
    const len=/\/Length\s+(\d+)(?![\d\s]*R)/.exec(own);   // non «/Length 12 0 R» (riferimento indiretto)
    let raw=Buffer.from(len ? bin.slice(start, start+(+len[1])) : bin.slice(start, end).replace(/\r?\n$/,''),'latin1'), txt;
    if (/\/Subtype\s*\/Image/.test(own)) continue;
    try{ txt=zlib.inflateSync(raw).toString('latin1'); }catch(e){ txt=raw.toString('latin1'); }
    if (!/\bBT\b/.test(txt)) continue;
    for (const st of strings(txt)) if (st.op!=='?') lines.push(st.s);
  }
  return lines;
}
// /Title del dizionario Info: stringa letterale in PDFDocEncoding o, se ha il BOM, in UTF-16BE
function pdfInfoTitle(buf){
  const s=buf.toString('latin1'), i=s.lastIndexOf('/Title ('); if (i<0) return null; let k=i+8, d=1, raw='';
  while (k<s.length && d>0){ const c=s[k]; if (c==='\\'){ const n=s[k+1]; if (/[0-7]/.test(n)){ let o=''; while (o.length<3 && /[0-7]/.test(s[k+1])) o+=s[++k]; raw+=String.fromCharCode(parseInt(o,8)); k++; continue; } raw+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'})[n]||n; k+=2; continue; }
    if (c==='(') d++; else if (c===')' && !--d) break; raw+=c; k++; }
  if (raw.startsWith('\xFE\xFF')){ let o=''; for (let j=2;j+1<raw.length;j+=2) o+=String.fromCharCode(raw.charCodeAt(j)*256+raw.charCodeAt(j+1)); return o; }
  return raw; }
module.exports={pdfText, pdfInfoTitle};
