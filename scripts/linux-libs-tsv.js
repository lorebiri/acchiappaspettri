// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Elenco delle librerie Ubuntu copiate nell'AppImage (per l'offerta del codice sorgente LGPL/GPL): per ogni libreria
// dentro l'AppImage estratta si chiede a dpkg (`dpkg -S`) da quale pacchetto viene, poi versione e sorgente con dpkg-query.
// Prima si pubblicava l'elenco di TUTTI i pacchetti della macchina di compilazione (migliaia di righe): ora solo quelli inclusi.
// Le librerie che dpkg non conosce (copiate da altrove) restano elencate in un commento, mai tolte in silenzio.
// Uso (Linux, pipeline): node scripts/linux-libs-tsv.js <squashfs-root> > librerie-linux-ubuntu-22.04.tsv
'use strict';
const fs=require('fs'), path=require('path'), {execFileSync}=require('child_process');

// librerie condivise dentro l'albero estratto (file o collegamenti *.so, *.so.N…), senza il programma
function libsFromTree(root){ const out=new Set(), walk=d=>{ for (const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name);
    if (e.isDirectory()) walk(p); else if (/\.so(\.\d+)*$/.test(e.name)) out.add(e.name); } };
  walk(root); return [...out].sort(); }
// «pacchetto[:arch]: /percorso» (anche «p1, p2: /percorso» per i file condivisi fra pacchetti); le diversioni si ignorano
function parseDpkgS(text){ const m=new Map();
  for (const l of String(text).split('\n')){ const r=/^([^:]+(?::[a-z0-9]+)?(?:,\s*[^:]+(?::[a-z0-9]+)?)*):\s+(\/\S+)$/.exec(l.trim()); if (!r || /^diversion /.test(l)) continue;
    const base=path.basename(r[2]); for (const p of r[1].split(/,\s*/)){ if (!m.has(base)) m.set(base,new Set()); m.get(base).add(p.trim()); } }
  return m; }
function tsv(rows, missing, libs){
  const head=['# Pacchetti Ubuntu 22.04 da cui vengono le '+libs+' librerie incluse nell\'AppImage (trovati con dpkg -S). Ubuntu packages providing the libraries bundled in the AppImage.',
    '# pacchetto\tversione\tpacchetto sorgente\tversione sorgente'];
  const tail=missing.length ? ['# Librerie dell\'AppImage non trovate da dpkg (non vengono da pacchetti Ubuntu) · not provided by an Ubuntu package: '+missing.join(', ')] : [];
  return head.concat(rows.map(r=>r.join('\t')), tail).join('\n')+'\n'; }

function main(root){
  const libs=libsFromTree(root); if (!libs.length) throw new Error('nessuna libreria in '+root);
  let out=''; try{ out=execFileSync('dpkg',['-S',...libs.map(n=>'*/'+n)],{encoding:'utf8',maxBuffer:1<<26,stdio:['ignore','pipe','pipe']}); }
  catch(e){ out=String(e.stdout||''); }   // dpkg -S esce con 1 se qualche nome non è di nessun pacchetto: l'uscita resta valida
  const m=parseDpkgS(out), pk=[...new Set([...m.values()].flatMap(s=>[...s]))].sort(), missing=libs.filter(n=>!m.has(n));
  const q=pk.length ? execFileSync('dpkg-query',['-W','-f=${Package}:${Architecture}\t${Version}\t${source:Package}\t${source:Version}\n',...pk],{encoding:'utf8',maxBuffer:1<<26}) : '';
  const rows=q.split('\n').filter(Boolean).map(l=>l.split('\t')).map(([p,...r])=>[p.replace(/:(amd64|all|i386)$/,''),...r]).sort((a,b)=>a[0].localeCompare(b[0]));
  return tsv(rows, missing, libs.length); }

module.exports={libsFromTree, parseDpkgS, tsv};
if (require.main===module){ const root=process.argv[2]; if (!root){ console.error('Uso: node scripts/linux-libs-tsv.js <squashfs-root>'); process.exit(2); } process.stdout.write(main(root)); }
