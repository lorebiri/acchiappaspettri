// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Estrae dal sorgente i testi italiani visibili (HTML statico e letterali JS) e li confronta col dizionario i18n/en.json.
// Uso: node scripts/i18n-extract.js [--write]   → i18n/_todo.json (testi senza traduzione), i18n/_pairs.json (coppie già presenti nel codice)
const fs=require('fs'), path=require('path'), acorn=require('acorn');
const root=path.join(__dirname,'..'), html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const m=/<script>([\s\S]*?)<\/script>/.exec(html);
let js=m[1]; const staticHtml=html.slice(0,m.index).replace(/<style[\s\S]*?<\/style>/g,'').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<head>[\s\S]*?<\/head>/,'');
const norm=s=>s.replace(/\s+/g,' ').trim();
const decode=s=>s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&hellip;/g,'…');
const out=new Set(), pairs={};
const looksCode=s=>{ const t=s.trim();
  if (t.length<2 || !/\p{L}{2}/u.test(t)) return true;
  if (/^[\w.#\-:\/\[\]=,()'"*>+~%@$^|&!?{}\\]+$/.test(t) && !/[A-ZÀ-Ü]/.test(t[0]) && !/[àèéìòù]/.test(t)) return true;   // identificatori, selettori
  if (/^(https?:|data:|mailto:|image\/|text\/|application\/)/.test(t)) return true;
  if (/[{;]\s*[a-z-]+\s*:/.test(t) || /^[a-z-]+\s*:\s*[^ ]+;/.test(t)) return true;  // CSS
  if (/^\d+(\.\d+)?(px|em|rem|%)/.test(t) || /px [a-z"]/.test(t)) return true;
  if (/^M[\d.]+[ ,]?[\d.]/.test(t)) return true;   // tracciati SVG
  if (/^[A-Z][a-z]?$/.test(t)) return true;   // simbolo chimico
  return false; };
function addFragment(f){ f=norm(decode(f)); f=f.replace(/^[\s·,:;—–-]+(?=\p{L})/u,'').trim(); if (!looksCode(f.replace(/\{\d+\}/g,'x'))) out.add(f); }
// attributi visibili
const ATTR=/\b(title|placeholder|aria-label|alt)\s*=\s*("([^"]*)"|'([^']*)')/g;
function fromMarkup(s){
  let a; ATTR.lastIndex=0; while ((a=ATTR.exec(s))) addFragment(a[3]!=null?a[3]:a[4]);
  s.replace(/<[^>]*>/g,'\u0001').split('\u0001').forEach(addFragment);
}
fromMarkup(staticHtml);
const SKIP_VARS=new Set(['FP_DATA','XRF_LINES','FP_OXIDE','SQZ','SQZn']);
const SKIP_CALLS=/^(\$|\$\$|querySelector|querySelectorAll|getElementById|createElement|addEventListener|getItem|setItem|removeItem|lsGet|lsSet|lsDel|setAttribute|getAttribute|getContext|matchMedia|setFont|toDataURL|split|replace|startsWith|endsWith|includes|indexOf|test|exec|on|openTab|fpLn|download)$/;
const isStr=n=>n && n.type==='Literal' && typeof n.value==='string';
function exprHtmlish(src){ return /</.test(src) || /glBtn|\.join\(|\.map\(|\bhtml\b|Html\(|_html|esc\(.*\)\s*\+/.test(src); }
function fromTemplate(n){
  let s=''; n.quasis.forEach((q,i)=>{ s+=q.value.cooked||''; if (i<n.expressions.length){ const e=n.expressions[i], src=js.slice(e.start,e.end); s+= exprHtmlish(src) ? '<!>' : '\u0002'; } });
  let a; ATTR.lastIndex=0; const seg=s.replace(/\u0002/g,'{#}');
  while ((a=ATTR.exec(seg))) { let k=0; const v=(a[3]!=null?a[3]:a[4]).replace(/\{#\}/g,()=>`{${k++}}`); addFragment(v); }
  seg.replace(/<[^>]*>/g,'\u0001').split('\u0001').forEach(fr=>{ let k=0; addFragment(fr.replace(/\{#\}/g,()=>`{${k++}}`)); });
}
function walk(n, parent){
  if (!n || typeof n.type!=='string') return;
  if (n.type==='VariableDeclarator' && n.id.name && SKIP_VARS.has(n.id.name)) return;
  if (n.type==='CallExpression'){ const c=n.callee, name=c.type==='Identifier'?c.name:(c.type==='MemberExpression'&&c.property.name); 
    if (name==='T' && isStr(n.arguments[0]) && isStr(n.arguments[1])) pairs[norm(n.arguments[0].value)]=norm(n.arguments[1].value);
    if (name && SKIP_CALLS.test(name)) return; }
  if (n.type==='ConditionalExpression' && /^(en|LANG==='en'|S\.lang==='en')$/.test(js.slice(n.test.start,n.test.end)) && isStr(n.consequent) && isStr(n.alternate)) pairs[norm(n.alternate.value)]=norm(n.consequent.value);
  if (n.type==='ObjectExpression'){ const get=k=>n.properties.find(p=>p.key&&(p.key.name===k||p.key.value===k)); const a=get('it'), b=get('en'); if (a&&b&&isStr(a.value)&&isStr(b.value)) pairs[norm(a.value.value)]=norm(b.value.value); }
  if (n.type==='Literal' && typeof n.value==='string'){ if (/</.test(n.value)) fromMarkup(n.value); else addFragment(n.value); return; }
  if (n.type==='TemplateLiteral'){ fromTemplate(n); }
  for (const k in n){ if (k==='type'||k==='start'||k==='end') continue; if (n.type==='Property' && k==='key' && !n.computed) continue; const v=n[k]; if (Array.isArray(v)) v.forEach(x=>x&&walk(x,n)); else if (v&&typeof v.type==='string') walk(v,n); }
}
walk(acorn.parse(js,{ecmaVersion:'latest',sourceType:'script'}));
for (const f of ['app/ui.js','app/project.js','app/desktop.js','app/shell.js','app/web.js']){ js=fs.readFileSync(path.join(root,f),'utf8'); walk(acorn.parse(js,{ecmaVersion:'latest',sourceType:'script'})); }
const dictPath=path.join(root,'i18n/en.json'); const dict=fs.existsSync(dictPath)?JSON.parse(fs.readFileSync(dictPath,'utf8')):{};
const extraPath=path.join(root,'i18n/en-app.json'), extra=fs.existsSync(extraPath)?JSON.parse(fs.readFileSync(extraPath,'utf8')):{}, skipPath=path.join(root,'i18n/not-text.json'), skip=new Set(fs.existsSync(skipPath)?JSON.parse(fs.readFileSync(skipPath,'utf8')):[]);
const all=[...out].sort(), todo=all.filter(s=>!(s in dict) && !(s in pairs) && !(s in extra) && !skip.has(s));
console.log({all:all.length, pairs:Object.keys(pairs).length, dict:Object.keys(dict).length, todo:todo.length, todoChars:todo.join('').length});
fs.writeFileSync(path.join(root,'i18n/_pairs.json'), JSON.stringify(pairs,null,0));
fs.writeFileSync(path.join(root,'i18n/_todo.json'), JSON.stringify(todo,null,0));
