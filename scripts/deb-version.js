// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Versione Debian delle prove: per dpkg «3.0.0-rc.1» è PIÙ NUOVA di «3.0.0» (il trattino separa la revisione Debian), quindi
// chi installa una rc dal .deb vedrebbe la stabile come una retrocessione. Con «3.0.0~rc.1» la tilde ordina la prova prima
// della stabile. Tauri scrive nel .deb la versione semver: qui si riscrive il campo Version del file control, in JS puro
// (ar + tar + gzip), così funziona anche dove dpkg-deb non c'è e si prova in `npm test`. Il nome del file non cambia.
// Uso: node scripts/deb-version.js <pacchetto.deb> <versione semver>           riscrive Version se serve
//      node scripts/deb-version.js --check <pacchetto.deb> <versione semver>   esce con 1 se Version non è quella attesa
'use strict';
const fs=require('fs'), zlib=require('zlib');

const debVersion=v=>String(v).replace(/^v/,'').replace('-','~');   // solo il primo trattino: 3.0.0-rc.1 → 3.0.0~rc.1

// confronto di dpkg (deb-version(7)): epoch, versione a monte, revisione; la tilde viene prima di tutto, anche della fine
function dpkgCompare(a, b){
  const split=v=>{ let e=0, s=String(v); const i=s.indexOf(':'); if (i>=0){ e=+s.slice(0,i); s=s.slice(i+1); } const j=s.lastIndexOf('-'); return j>=0 ? [e, s.slice(0,j), s.slice(j+1)] : [e, s, '']; };
  // verrevcmp di dpkg: tratti non numerici confrontati carattere per carattere (tilde < fine < lettere < altri), poi numeri
  const dig=c=>c!=null && c>='0' && c<='9', order=c=>c==null||dig(c) ? 0 : c==='~' ? -1 : /[A-Za-z]/.test(c) ? c.charCodeAt(0) : c.charCodeAt(0)+256;
  const part=(x, y)=>{ let i=0, j=0;
    while (i<x.length || j<y.length){ let first=0;
      while ((i<x.length && !dig(x[i])) || (j<y.length && !dig(y[j]))){ const c=order(x[i]), d=order(y[j]); if (c!==d) return c-d; i++; j++; }
      while (x[i]==='0') i++; while (y[j]==='0') j++;
      while (dig(x[i]) && dig(y[j])){ if (!first) first=x.charCodeAt(i)-y.charCodeAt(j); i++; j++; }
      if (dig(x[i])) return 1; if (dig(y[j])) return -1; if (first) return first; }
    return 0; };
  const [ea, ua, ra]=split(a), [eb, ub, rb]=split(b); return (ea-eb) || part(ua, ub) || part(ra, rb);
}

// archivio ar (formato dei .deb)
function readAr(buf){ if (buf.toString('latin1',0,8)!=='!<arch>\n') throw new Error('non è un pacchetto .deb (manca !<arch>)');
  const out=[]; let o=8; while (o+60<=buf.length){ const h=buf.subarray(o,o+60), size=parseInt(h.toString('latin1',48,58).trim(),10); if (!(size>=0)) throw new Error('intestazione ar non valida');
    out.push({h:Buffer.from(h), name:h.toString('latin1',0,16).trim().replace(/\/$/,''), data:buf.subarray(o+60,o+60+size)}); o+=60+size+(size%2); }
  return out; }
function writeAr(members){ const parts=[Buffer.from('!<arch>\n','latin1')];
  for (const m of members){ const h=Buffer.from(m.h); h.write(String(m.data.length).padEnd(10,' '),48,10,'latin1'); parts.push(h, m.data); if (m.data.length%2) parts.push(Buffer.from('\n')); }
  return Buffer.concat(parts); }
// tar (ustar/GNU): blocchi da 512 byte; si cambiano solo dimensione e somma di controllo dell'elemento modificato
function readTar(buf){ const out=[]; let o=0; while (o+512<=buf.length){ const h=buf.subarray(o,o+512); if (h.every(x=>x===0)) break;
    const size=parseInt(h.toString('latin1',124,136).replace(/\0.*$/,'').trim()||'0',8); out.push({h:Buffer.from(h), name:h.toString('latin1',0,100).replace(/\0.*$/,''), data:buf.subarray(o+512,o+512+size)}); o+=512+Math.ceil(size/512)*512; }
  return out; }
function tarHeader(h, size){ h=Buffer.from(h); h.write(size.toString(8).padStart(11,'0')+'\0',124,12,'latin1'); h.fill(0x20,148,156);
  let s=0; for (const x of h) s+=x; h.write(s.toString(8).padStart(6,'0')+'\0 ',148,8,'latin1'); return h; }
function writeTar(entries){ const parts=[]; for (const e of entries){ parts.push(tarHeader(e.h, e.data.length), e.data, Buffer.alloc((512-e.data.length%512)%512)); } parts.push(Buffer.alloc(1024)); return Buffer.concat(parts); }

function controlOf(deb){ const ar=readAr(deb), m=ar.find(x=>/^control\.tar(\.gz)?$/.test(x.name)); if (!m) throw new Error('control.tar.gz non trovato (formato non gestito: '+ar.map(x=>x.name).join(', ')+')');
  const tar=readTar(/\.gz$/.test(m.name) ? zlib.gunzipSync(m.data) : m.data), c=tar.find(e=>/^(\.\/)?control$/.test(e.name)); if (!c) throw new Error('file control assente');
  return {ar, m, tar, c, text:c.data.toString('utf8')}; }
const field=(deb, k)=>{ const r=new RegExp('^'+k+':\\s*(.*)$','m').exec(controlOf(deb).text); return r ? r[1].trim() : null; };
function setVersion(deb, version){ const o=controlOf(deb); if (!/^Version:/m.test(o.text)) throw new Error('campo Version assente');
  o.c.data=Buffer.from(o.text.replace(/^Version:.*$/m, 'Version: '+version),'utf8');
  const tar=writeTar(o.tar); o.m.data=/\.gz$/.test(o.m.name) ? zlib.gzipSync(tar,{level:9}) : tar; return writeAr(o.ar); }

module.exports={debVersion, dpkgCompare, readAr, writeAr, readTar, writeTar, tarHeader, field, setVersion};

if (require.main===module){ const a=process.argv.slice(2), check=a[0]==='--check', [file, ver]=check?a.slice(1):a;
  if (!file || !ver){ console.error('Uso: node scripts/deb-version.js [--check] <pacchetto.deb> <versione semver>'); process.exit(2); }
  const deb=fs.readFileSync(file), want=debVersion(ver), now=field(deb,'Version');
  if (check){ if (now!==want){ console.error(`✗ ${file}: Version «${now}», attesa «${want}»`); process.exit(1); } console.log(`✓ ${file}: Version ${now}`); process.exit(0); }
  if (now===want){ console.log(`· ${file}: Version già ${now}`); process.exit(0); }
  const out=setVersion(deb, want); if (field(out,'Version')!==want) throw new Error('riscrittura non riuscita');
  fs.writeFileSync(file, out); console.log(`✓ ${file}: Version ${now} → ${want} (dpkg: ${dpkgCompare(want, want.split('~')[0])<0?'prima':'dopo'} della ${want.split('~')[0]})`); }
