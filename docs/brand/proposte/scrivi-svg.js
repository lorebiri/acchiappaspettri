'use strict';
// node docs/brand/proposte/scrivi-svg.js : riscrive gli SVG delle proposte a partire da varianti.js
const fs=require('fs'), path=require('path'); const { V, svg } = require('./varianti.js');
for (const k of Object.keys(V)) {
  const p = n => path.join(__dirname, `ibrida-${k.toLowerCase()}${n}.svg`);
  fs.writeFileSync(p(''), svg(k,'quadrato'));
  fs.writeFileSync(p('-tondo'), svg(k,'tondo'));
  fs.writeFileSync(p('-piccola'), svg(k,'quadrato',true));
}
console.log('SVG scritti in', __dirname);
