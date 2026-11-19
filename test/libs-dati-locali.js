// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Dati atomici del NIST per i test della CF-LIBS. Non sono nel repository né nell'app (permesso di redistribuzione del NIST da chiedere):
// li prepara scripts/gen-libs-data.py, che li scarica dal NIST in scripts/.nist-cache/ (la CI lo fa con la cache, vedi .github/workflows/ci.yml).
const fs=require('fs'), path=require('path');
const file=process.env.LIBS_DATA_OUT || path.join(__dirname,'..','scripts','.nist-cache','libs-data.js');
if (!fs.existsSync(file)) throw new Error('Dati atomici del NIST assenti ('+file+'): esegui una volta «python3 scripts/gen-libs-data.py» (li scarica dal NIST, circa 3 minuti).');
module.exports=require(file); module.exports.__file=file;
