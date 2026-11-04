// Genera app/theme-dark.css dalle regole CSS di index.html: ogni colore fisso viene convertito in uno adatto al fondo scuro,
// con la stessa tinta e la luminosità invertita. I grafici restano su fondo bianco, come nei file esportati.
const fs=require('fs'), path=require('path'), root=path.join(__dirname,'..'); const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=/<style>([\s\S]*?)<\/style>/.exec(html)[1];
function hex2hsl(h){ h=h.replace('#',''); if (h.length===3) h=h.split('').map(c=>c+c).join(''); const r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255, M=Math.max(r,g,b), m=Math.min(r,g,b), l=(M+m)/2, d=M-m; let H=0,S=0; if (d){ S=d/(1-Math.abs(2*l-1)); H= M===r?((g-b)/d+6)%6 : M===g?(b-r)/d+2 : (r-g)/d+4; H*=60; } return [H,S,l]; }
const hsl=([h,s,l])=>`hsl(${h.toFixed(0)} ${(s*100).toFixed(0)}% ${(l*100).toFixed(0)}%)`;
const invert=(hex,kind)=>{ const [h,s,l]=hex2hsl(hex); if (kind==='bg'){ return hsl([h,Math.min(s,0.45), l>0.5 ? 0.09+(1-l)*0.32 : Math.max(0.3,l)]); } return hsl([h,Math.min(s,0.8), l<0.62 ? Math.min(0.9, 1-l*0.62) : l]); };
const out=[]; const re=/([^{}@]+)\{([^{}]*)\}/g; let m;
while ((m=re.exec(css))){ const sel=m[1].trim(); if (!sel || /^(from|to|\d+%)/.test(sel) || /^:root/.test(sel)) continue; const decl=[];
  for (const d of m[2].split(';')){ const q=/^\s*(background|background-color|color|border|border-color|border-top|border-bottom|border-left|border-right|outline|box-shadow|fill|stroke)\s*:\s*(.+)$/.exec(d); if (!q || !/#[0-9a-fA-F]{3,6}\b/.test(q[2]) || /url\(/.test(q[2])) continue;
    const kind=/^(color|fill|stroke)$/.test(q[1])?'fg':/^background/.test(q[1])?'bg':'bg'; const v=q[2].replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g,x=>invert(x,kind)); decl.push(`${q[1]}:${v}`); }
  if (decl.length) out.push(sel.split(',').map(x=>`html[data-theme=dark] ${x.trim()}`).join(',')+`{${decl.join(';')}}`); }
const base=`/* generato da scripts/gen-dark-theme.js: non modificare a mano */
html[data-theme=dark]{color-scheme:dark;--bg:#12161d;--panel:#1b212b;--ink:#e6eaf0;--muted:#a3adbb;--line:#333c49;--accent:#6ea0f0;--accent-soft:#233450;--ok:#58c08b;--danger:#ef7f77;--sun:#ffc84a}
html[data-theme=dark] select,html[data-theme=dark] input,html[data-theme=dark] textarea{background:#12161d;color:var(--ink);border-color:var(--line)}
html[data-theme=dark] dialog{background:var(--panel);color:var(--ink)}
html[data-theme=dark] .btn.primary,html[data-theme=dark] .primary{color:#0c1320}
/* i grafici: carta bianca, come nei file esportati */
html[data-theme=dark] canvas:not(#confetti){background:#fff;border-radius:8px}
html[data-theme=dark] [style*="color:#"]{color:var(--ink)!important}
`;
fs.writeFileSync(path.join(root,'app/theme-dark.css'), base+out.join('\n')+'\n'); console.log('regole',out.length);
