// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Carica il nucleo scientifico di index.html per i test (come i benchmark)
const fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const names=['XRF_LINES','FP','fpSetup','fpIntensities','fpQuant','fpCalibrate','fpLine','fpLineE','xrfFitLines','xrfFP','fpMeasure','fpLayerSolve','fpMat','fpParseComp','fpTau','fpMu','fpCompton','chromMetrics','eprDoubleIntegral','parseXRF','mixResponse','mixWeights','currie','xrfFWHM','findPeaks','parseText','hiddenBands','xrfAlignFit','xrfCurrie','isCounts','signalQuality','parseXRF','baseDefaults','baseCurve','baseCurveR','baselineArPLS','baselineSNIP','peakWidthPts','BASE_METHODS'];
// moduli puri caricati dalla pagina prima del nucleo (app/<nome>-core.js) che il nucleo usa
const ctx={console, Float64Array, Math, AcchBaseline:require('../../app/baseline-core.js')}; vm.createContext(ctx);
vm.runInContext(src+';globalThis.CORE={'+names.filter(n=>new RegExp('\\b(function|const|let)\\s+'+n+'\\b').test(src)).join(',')+'};', ctx);
module.exports=ctx.CORE; module.exports.src=src;
