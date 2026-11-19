# Validazione numerica di Acchiappaspettri

Documento generato da `scripts/gen-validazione.js` il 2026-11-19. **Non modificare a mano**: rigenerarlo.

- Versione dell'app: **3.1.0-rc.1** (nucleo scientifico di `index.html`, righe tra `/*CORE-START*/` e `/*CORE-END*/`)
- Motore: Node v22.23.5 (V8 12.4.254.21-node.57), linux x64
- LRE (log relative error) = −log10(|calcolato − certificato| / |certificato|), al massimo 15; se il certificato è 0 si usa l'errore assoluto. LRE 10 = 10 cifre corrette.
- Ogni tabella si riproduce con `node --test test/validation/` (i test falliscono sotto soglia).

## R1. NIST Statistical Reference Datasets

Fonte: https://www.itl.nist.gov/div898/strd/ (file scaricati il 2026-11-06, copie integrali in `test/strd/`, URL in `test/strd/fonti.json`).

### Statistica univariata

Il nucleo **non ha una funzione unica** per media e deviazione standard: la formula (media, poi Σ(x−media)²/(n−1)) è scritta in linea in `mixResponse` e `fpCalibrate`; il test la estrae dal testo di `mixResponse`. La media interna di `linReg` (ym) è controllata a parte.

| Dati | n | Difficoltà | Media certificata | Media calcolata | LRE | Soglia | s certificata | s calcolata | LRE | Soglia | Esito |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Lew | 200 | bassa | -177.435 | -177.435 | 15.0 | 14 | 277.332168044316 | 277.332168044316 | 15.0 | 13 | ✓ |
| Lottery | 218 | bassa | 518.95871559633 | 518.95871559633 | 15.0 | 14 | 291.699727470969 | 291.699727470969 | 15.0 | 13 | ✓ |
| Mavro | 50 | bassa | 2.001856 | 2.001856 | 15.0 | 14 | 4.29123454003053e-4 | 4.29123454003085e-4 | 13.1 | 13 | ✓ |
| Michelso | 100 | bassa | 299.8524 | 299.8524 | 15.0 | 14 | 0.0790105478190518 | 0.0790105478190506 | 13.8 | 13 | ✓ |
| PiDigits | 5000 | bassa | 4.5348 | 4.5348 | 15.0 | 14 | 2.86733906028871 | 2.86733906028871 | 14.9 | 13 | ✓ |
| NumAcc1 | 3 | bassa | 1.00000020000000e+7 | 1.00000020000000e+7 | 15.0 | 14 | 1 | 1 | 15.0 | 13 | ✓ |
| NumAcc2 | 1001 | media | 1.2 | 1.19999999999999 | 14.0 | 13 | 0.1 | 0.1 | 14.6 | 9 | ✓ |
| NumAcc3 | 1001 | media | 1.00000020000000e+6 | 1.00000020000000e+6 | 15.0 | 13 | 0.1 | 0.100000000034925 | 9.5 | 9 | ✓ |
| NumAcc4 | 1001 | alta | 1.00000002000000e+7 | 1.00000002000001e+7 | 14.0 | 13 | 0.1 | 0.100000000558841 | 8.3 | 8 | ✓ |

### Regressione lineare

| Dati | Funzione | Parametro | Certificato | Calcolato | LRE | Soglia | Esito |
|---|---|---|---|---|---|---|---|
| Norris | `linReg` | a (intercetta) | -0.262323073774029 | -0.262323073773985 | 12.8 | 12 | ✓ |
| Norris | `linReg` | b (pendenza) | 1.00211681802045 | 1.00211681802045 | 14.4 | 12 | ✓ |
| Norris | `linReg` | sa | 0.232818234301152 | 0.232818234301159 | 13.5 | 12 | ✓ |
| Norris | `linReg` | sb | 4.29796848199937e-4 | 4.29796848199949e-4 | 13.5 | 12 | ✓ |
| Norris | `linReg` | s residua | 0.884796396144373 | 0.884796396144398 | 13.6 | 12 | ✓ |
| Norris | `linReg` | R² | 0.999993745883712 | 0.999993745883712 | 15.0 | 12 | ✓ |
| Pontius | `quadReg` | B0 | 6.73565789473684e-4 | 6.73565789474928e-4 | 11.7 | 9 | ✓ |
| Pontius | `quadReg` | B1 | 7.32059160401003e-7 | 7.32059160401001e-7 | 14.5 | 9 | ✓ |
| Pontius | `quadReg` | B2 | -3.16081871345029e-15 | -3.16081871344976e-15 | 12.8 | 9 | ✓ |
| Pontius | `quadReg` | s residua | 2.05177424076185e-4 | 2.05177424076189e-4 | 13.7 | 9 | ✓ |

Non applicabili (modello non offerto dal programma): NoInt1, NoInt2 (retta per l'origine: il menu del modello di taratura offre solo «nessuno», 1/x, 1/x²; il test fallisce se compare un modello nuovo), Filip (grado 10), Wampler1–5 (grado 5), Longley (regressione multipla).

## R2. Distribuzioni, retta pesata, test di Mandel

Riferimenti: `test/fixtures/validazione/gen_fixtures.py` (Python 3.14.3, numpy 2.5.4, scipy 1.18.1, mpmath 1.4.1; generati 2026-11-06T13:29:38Z). Tutti i dati di taratura sono **sintetici** (seme fisso), salvo Pontius (NIST).

| Funzione | Casi | Errore relativo massimo | Dove | Soglia | Esito |
|---|---|---|---|---|---|
| `tInv` (t di Student, df 1–200, p 0,90–0,995) | 1000 | 4.83e-11 | {"df":194,"p":0.99,"ref":2.3457228057845403,"calc":2.3457228056713575} | 1e-8 | ✓ |
| `fInv` (F, d1 in 19 valori, d2 1–200, p 0,90–0,995) | 19000 | 1.07e-10 | {"d1":120,"d2":1,"p":0.995,"ref":25358.573451573233,"calc":25358.57345428667} | 1e-8 | ✓ |

### Retta pesata (`calibrateW`)

| Caso | Peso | n | Parametro | Riferimento | Calcolato | LRE | Soglia | Esito |
|---|---|---|---|---|---|---|---|---|
| sette_livelli | 1/x | 7 | a | 0.0417336922264435 | 0.0417336922264426 | 13.7 | 10 | ✓ |
| sette_livelli | 1/x | 7 | b | 1.50686551586909 | 1.50686551586909 | 15.0 | 10 | ✓ |
| sette_livelli | 1/x | 7 | sa | 0.0423814396526723 | 0.0423814396526722 | 14.6 | 10 | ✓ |
| sette_livelli | 1/x | 7 | sb | 0.00886256742628881 | 0.00886256742628879 | 14.6 | 10 | ✓ |
| sette_livelli | 1/x | 7 | syx | 0.103800145143778 | 0.103800145143777 | 14.6 | 10 | ✓ |
| sette_livelli | 1/x | 7 | lod | 0.119516776446558 | 0.119516776446557 | 14.6 | 10 | ✓ |
| sette_livelli | 1/x | 7 | loq | 0.362172049838054 | 0.362172049838053 | 14.6 | 10 | ✓ |
| sette_livelli | 1/x | 7 | t | 2.57058183563631 | 2.57058183558456 | 10.7 | 10 | ✓ |
| sette_livelli | 1/x | 7 | IC a (basso) | -0.0672112667128326 | -0.0672112667106399 | 10.5 | 10 | ✓ |
| sette_livelli | 1/x | 7 | IC a (alto) | 0.15067865116572 | 0.150678651163525 | 10.8 | 10 | ✓ |
| sette_livelli | 1/x | 7 | IC b (basso) | 1.48408356102597 | 1.48408356102643 | 12.5 | 10 | ✓ |
| sette_livelli | 1/x | 7 | IC b (alto) | 1.52964747071221 | 1.52964747071176 | 12.5 | 10 | ✓ |
| sette_livelli | 1/x | 7 | x0(y0=2.97348) | 1.94559254087293 | 1.94559254087293 | 15.0 | 10 | ✓ |
| sette_livelli | 1/x | 7 | s x0(y0=2.97348) | 0.0760429749522997 | 0.0760429749522996 | 14.7 | 10 | ✓ |
| sette_livelli | 1/x | 7 | IC x0(y0=2.97348) | 0.195474690140129 | 0.195474690136193 | 10.7 | 10 | ✓ |
| sette_livelli | 1/x | 7 | x0(y0=15.004) | 9.929397248927 | 9.929397248927 | 15.0 | 10 | ✓ |
| sette_livelli | 1/x | 7 | s x0(y0=15.004) | 0.170315861199295 | 0.170315861199295 | 14.7 | 10 | ✓ |
| sette_livelli | 1/x | 7 | IC x0(y0=15.004) | 0.437810859119664 | 0.437810859110849 | 10.7 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | a | 0.0511064028107698 | 0.0511064028107697 | 14.9 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | b | 1.50168374587462 | 1.50168374587462 | 15.0 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | sa | 0.0160432241792006 | 0.0160432241792006 | 14.8 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | sb | 0.0139636627387027 | 0.0139636627387028 | 14.8 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | syx | 0.032783633506551 | 0.0327836335065511 | 14.8 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | lod | 0.0313523608454744 | 0.0313523608454744 | 14.8 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | loq | 0.0950071540771951 | 0.0950071540771952 | 14.8 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | t | 2.57058183563631 | 2.57058183558456 | 10.7 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | IC a (basso) | 0.00986598215067538 | 0.00986598215150551 | 10.1 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | IC a (alto) | 0.0923468234708642 | 0.0923468234700339 | 11.0 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | IC b (basso) | 1.46578900807956 | 1.46578900808028 | 12.3 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | IC b (alto) | 1.53757848366968 | 1.53757848366896 | 12.3 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | x0(y0=2.97348) | 1.94606461261733 | 1.94606461261733 | 15.0 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | s x0(y0=2.97348) | 0.0395394724318447 | 0.0395394724318448 | 14.8 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | IC x0(y0=2.97348) | 0.101639449623943 | 0.101639449621897 | 10.7 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | x0(y0=15.004) | 9.95741855651524 | 9.95741855651524 | 15.0 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | s x0(y0=15.004) | 0.207916180100273 | 0.207916180100274 | 14.8 | 10 | ✓ |
| sette_livelli | 1/x2 | 7 | IC x0(y0=15.004) | 0.534465555900651 | 0.534465555889892 | 10.7 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | a | -6.33284274338190e-4 | -6.33284274338231e-4 | 13.2 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | b | 0.824518290444078 | 0.824518290444078 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | sa | 0.00669118730367339 | 0.00669118730367339 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | sb | 0.00702545874611986 | 0.00702545874611986 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | syx | 0.0212593874830387 | 0.0212593874830387 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | lod | 0.0490804565057549 | 0.049080456505755 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | loq | 0.148728656078045 | 0.148728656078045 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | t | 2.2621571627982 | 2.26215716276101 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | IC a (basso) | -0.0157698015609674 | -0.0157698015607186 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | IC a (alto) | 0.014503233012291 | 0.0145032330120421 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | IC b (basso) | 0.808625598619599 | 0.808625598619861 | 12.5 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | IC b (alto) | 0.840410982268556 | 0.840410982268295 | 12.5 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | x0(y0=0.403596) | 0.490261148793466 | 0.490261148793466 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | s x0(y0=0.403596) | 0.0338869558642326 | 0.0338869558642326 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | IC x0(y0=0.403596) | 0.0766576199337004 | 0.0766576199324401 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | x0(y0=4.00865) | 4.86257652588274 | 4.86257652588274 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | s x0(y0=4.00865) | 0.111111277718031 | 0.111111277718031 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x | 11 | IC x0(y0=4.00865) | 0.251351172757505 | 0.251351172753373 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | a | 1.09183016912891e-4 | 1.09183016912887e-4 | 13.4 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | b | 0.817162073175012 | 0.817162073175012 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | sa | 0.00236581292869371 | 0.00236581292869371 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | sb | 0.0131744133049233 | 0.0131744133049233 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | syx | 0.00689345798063743 | 0.00689345798063743 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | lod | 0.0147807819940586 | 0.0147807819940586 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | loq | 0.0447902484668443 | 0.0447902484668443 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | t | 2.2621571627982 | 2.26215716276101 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | IC a (basso) | -0.00524265764557218 | -0.00524265764548419 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | IC a (alto) | 0.00546102367939796 | 0.00546102367930997 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | IC b (basso) | 0.787359479751616 | 0.787359479752106 | 12.2 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | IC b (alto) | 0.846964666598408 | 0.846964666597918 | 12.2 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | x0(y0=0.403596) | 0.493765961769829 | 0.493765961769829 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | s x0(y0=0.403596) | 0.0232130933623233 | 0.0232130933623233 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | IC x0(y0=0.403596) | 0.0525116654202831 | 0.0525116654194197 | 10.8 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | x0(y0=4.00865) | 4.90544158689139 | 4.90544158689139 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | s x0(y0=4.00865) | 0.233065178571689 | 0.233065178571689 | 15.0 | 10 | ✓ |
| bianco_e_repliche | 1/x2 | 11 | IC x0(y0=4.00865) | 0.527230063104789 | 0.527230063096121 | 10.8 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | a | -0.268510896792574 | -0.268510896792577 | 13.9 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | b | 2430.15902681915 | 2430.15902681915 | 15.0 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | sa | 1.55107957617781 | 1.55107957617781 | 14.8 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | sb | 4.96742974888749 | 4.9674297488875 | 14.8 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | syx | 5.14289434302762 | 5.14289434302762 | 14.9 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | lod | 0.00256293689494457 | 0.00256293689494457 | 14.9 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | loq | 0.00776647543922596 | 0.00776647543922597 | 15.0 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | t | 2.2621571627982 | 2.26215716276101 | 10.8 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | IC a (basso) | -3.77729667011321 | -3.77729667005554 | 10.8 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | IC a (alto) | 3.24027487652807 | 3.24027487647038 | 10.7 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | IC b (basso) | 2418.921920032 | 2418.92192003219 | 13.1 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | IC b (alto) | 2441.39613360629 | 2441.3961336061 | 13.1 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | x0(y0=70.9293) | 0.0292975933307476 | 0.0292975933307476 | 15.0 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | s x0(y0=70.9293) | 0.00425216547965162 | 0.00425216547965162 | 15.0 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | IC x0(y0=70.9293) | 0.00961906659719717 | 0.00961906659703904 | 10.8 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | x0(y0=7143.07) | 2.93945311070723 | 2.93945311070723 | 15.0 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | s x0(y0=7143.07) | 0.0425364563329555 | 0.0425364563329556 | 14.9 | 10 | ✓ |
| cinque_decadi | 1/x | 11 | IC x0(y0=7143.07) | 0.0962241493736484 | 0.0962241493720666 | 10.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | a | -0.0101137187092689 | -0.0101137187092677 | 12.9 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | b | 2395.35817317706 | 2395.35817317706 | 15.0 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | sa | 0.0368905629599331 | 0.0368905629599332 | 14.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | sb | 11.7836568806662 | 11.7836568806663 | 14.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | syx | 0.110944693738101 | 0.110944693738102 | 14.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | lod | 4.88219159941577e-5 | 4.88219159941578e-5 | 14.7 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | loq | 1.47945199982296e-4 | 1.47945199982296e-4 | 14.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | t | 2.2621571627982 | 2.26215716276101 | 10.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | IC a (basso) | -0.0935659699487398 | -0.0935659699473666 | 10.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | IC a (alto) | 0.0733385325302019 | 0.0733385325288313 | 10.7 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | IC b (basso) | 2368.70168936051 | 2368.70168936094 | 12.7 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | IC b (alto) | 2422.01465699362 | 2422.01465699318 | 12.7 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | x0(y0=70.9293) | 0.0296153679700516 | 0.0296153679700516 | 15.0 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | s x0(y0=70.9293) | 4.59936483709275e-4 | 4.59936483709276e-4 | 14.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | IC x0(y0=70.9293) | 0.00104044861105516 | 0.00104044861103805 | 10.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | x0(y0=7143.07) | 2.98205094908397 | 2.98205094908397 | 15.0 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | s x0(y0=7143.07) | 0.0464909911417696 | 0.0464909911417697 | 14.8 | 10 | ✓ |
| cinque_decadi | 1/x2 | 11 | IC x0(y0=7143.07) | 0.105169928616942 | 0.105169928615213 | 10.8 | 10 | ✓ |

### Test di linearità di Mandel (`calibrate`)

| Caso | n | Grandezza | Riferimento | Calcolato | LRE | Soglia | Esito |
|---|---|---|---|---|---|---|---|
| curva_di_saturazione | 8 | PG | 281.014089188669 | 281.014089188671 | 14.3 | 9 | ✓ |
| curva_di_saturazione | 8 | F(0,99; 1; n−3) | 16.2581770398337 | 16.2581770397082 | 11.1 | 9 | ✓ |
| curva_di_saturazione | 8 | decisione non lineare | sì | sì | — | uguale | ✓ |
| quasi_lineare | 9 | PG | 0.561302445948614 | 0.561302445948734 | 12.7 | 9 | ✓ |
| quasi_lineare | 9 | F(0,99; 1; n−3) | 13.7450225333042 | 13.745022533476 | 10.9 | 9 | ✓ |
| quasi_lineare | 9 | decisione non lineare | no | no | — | uguale | ✓ |
| pontius_nist | 40 | PG | 4218.52506257132 | 4218.52506257095 | 13.1 | 9 | ✓ |
| pontius_nist | 40 | F(0,99; 1; n−3) | 7.37344452506974 | 7.3734445250011 | 11.0 | 9 | ✓ |
| pontius_nist | 40 | decisione non lineare | sì | sì | — | uguale | ✓ |

## R3. Deconvoluzione (`deconvolve`, `fitPeaks`)

### Senza rumore, semi automatici (dati sintetici, 1001 punti, passo 0,1)

| Profilo | Caso | Componenti attese / trovate | LRE min centro | LRE min FWHM | LRE min area | Soglia | Esito |
|---|---|---|---|---|---|---|---|
| gauss | 2 separati | 2 / 2 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| gauss | 2 sovrapposti | 2 / 2 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| gauss | 4 separati | 4 / 4 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| gauss | 4 sovrapposti | 4 / 4 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| lor | 2 separati | 2 / 2 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| lor | 2 sovrapposti | 2 / 2 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| lor | 4 separati | 4 / 4 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| lor | 4 sovrapposti | 4 / 4 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| pv | 2 separati | 2 / 2 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| pv | 2 sovrapposti | 2 / 2 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| pv | 4 separati | 4 / 4 | 15.0 | 15.0 | 15.0 | 6 | ✓ |
| pv | 4 sovrapposti | 4 / 4 | 15.0 | 15.0 | 15.0 | 6 | ✓ |

### Con rumore: errori standard contro scipy `curve_fit` (stesso modello, stessi dati)

| Caso | Comp. | Grandezza | scipy | Acchiappaspettri (semi) | LRE | Soglia | Esito |
|---|---|---|---|---|---|---|---|
| pv_2_rumore | 1 | σ centro | 0.00465503749554017 | 0.00465503726044913 | 7.3 | 2 | ✓ |
| pv_2_rumore | 1 | σ FWHM | 0.0141347661659721 | 0.0141347660934436 | 8.3 | 2 | ✓ |
| pv_2_rumore | 1 | σ area | 1.24272609114294 | 1.24272615877817 | 7.3 | 2 | ✓ |
| pv_2_rumore | 1 | σ η | 0.0102392972797034 | 0.0102392979082619 | 7.2 | 2 | ✓ |
| pv_2_rumore | 2 | σ centro | 0.0121869410949872 | 0.0121869412283304 | 8.0 | 2 | ✓ |
| pv_2_rumore | 2 | σ FWHM | 0.0390353810066959 | 0.0390353801580877 | 7.7 | 2 | ✓ |
| pv_2_rumore | 2 | σ area | 1.5399131637049 | 1.53991318417431 | 7.9 | 2 | ✓ |
| pv_2_rumore | 2 | σ η | 0.0181077559651448 | 0.018107756213679 | 7.9 | 2 | ✓ |
| gauss_4_rumore | 1 | σ centro | 0.00693678089249593 | 0.00693678099630622 | 7.8 | 2 | ✓ |
| gauss_4_rumore | 1 | σ FWHM | 0.0171226086444523 | 0.0171226037526856 | 6.5 | 2 | ✓ |
| gauss_4_rumore | 1 | σ area | 0.809170564198389 | 0.80917022334424 | 6.4 | 2 | ✓ |
| gauss_4_rumore | 2 | σ centro | 0.0151753299062841 | 0.0151753298527879 | 8.5 | 2 | ✓ |
| gauss_4_rumore | 2 | σ FWHM | 0.0372906331017757 | 0.0372906343115464 | 7.5 | 2 | ✓ |
| gauss_4_rumore | 2 | σ area | 0.876277787120791 | 0.876278464403157 | 6.1 | 2 | ✓ |
| gauss_4_rumore | 3 | σ centro | 0.00738410747584626 | 0.00738410733449798 | 7.7 | 2 | ✓ |
| gauss_4_rumore | 3 | σ FWHM | 0.0178923597788373 | 0.0178923604864106 | 7.4 | 2 | ✓ |
| gauss_4_rumore | 3 | σ area | 0.730967048991053 | 0.730967016078147 | 7.3 | 2 | ✓ |
| gauss_4_rumore | 4 | σ centro | 0.0106182166345046 | 0.0106182167165787 | 8.1 | 2 | ✓ |
| gauss_4_rumore | 4 | σ FWHM | 0.0267220880834444 | 0.0267220883911949 | 7.9 | 2 | ✓ |
| gauss_4_rumore | 4 | σ area | 1.04105185165695 | 1.04105113760345 | 6.2 | 2 | ✓ |
| lor_2_rumore | 1 | σ centro | 0.0150000168725255 | 0.0150000203717104 | 6.6 | 2 | ✓ |
| lor_2_rumore | 1 | σ FWHM | 0.0478212260800475 | 0.0478212314885391 | 6.9 | 2 | ✓ |
| lor_2_rumore | 1 | σ area | 2.82458100651322 | 2.82457976916976 | 6.4 | 2 | ✓ |
| lor_2_rumore | 2 | σ centro | 0.0146116566446597 | 0.0146116557764119 | 7.2 | 2 | ✓ |
| lor_2_rumore | 2 | σ FWHM | 0.0454436959245693 | 0.0454436985607286 | 7.2 | 2 | ✓ |
| lor_2_rumore | 2 | σ area | 2.45439071543192 | 2.45439132015333 | 6.6 | 2 | ✓ |

Limiti noti (test che falliscono sul codice attuale, vedi `test/validation/r3-deconvoluzione.test.js`): quando una componente va a area 0 o due componenti coincidono, la matrice JᵀJ è singolare e `fitPeaks` restituisce errore standard 0 per **tutte** le componenti (mostrato come «± 0»).

## R10. Fisisorbimento (`app/sorption-core.js`)

Riferimenti: soluzioni analitiche su isoterme sintetiche (parametri noti) e il report **pubblico** di Kaomi for Autosorb 2.02 «Mesopore example» (Particle Technology Labs, 2025; numeri in `test/validation/sorption/kaomi-mesopore-pubblico.json`, con la fonte). Nessun file reale del laboratorio. Test: `test/validation/r10-fisisorbimento.test.js`.

| Calcolo | Riferimento | Valore di riferimento | Calcolato | LRE o scarto | Esito |
|---|---|---|---|---|---|
| BET, isoterma BET esatta | C (analitico) | 120 | 120 | LRE 14.9 | ✓ |
| BET, isoterma BET esatta | pendenza (analitica) | 0.022037037037037 | 0.022037037037037 | LRE 15.0 | ✓ |
| BET, stessi 7 punti: area (m²/g) | report Kaomi | 198.568 | 198.569211112851 | 0.0006 % (≤ 0.01 %) | ✓ |
| BET: C | report Kaomi | 133.714 | 133.715247388166 | 0.0009 % (≤ 0.01 %) | ✓ |
| Volume totale dei pori (cm³/g) | report Kaomi | 0.5916 | 0.591571296907441 | -0.0049 % (≤ 0.01 %) | ✓ |
| Diametro medio 4V/S (Å) | report Kaomi | 119.17 | 119.16677184586 | -0.0027 % (≤ 0.05 %) | ✓ |
| BJH ads: volume cumulato (cm³/g) | report Kaomi | 0.600879 | 0.600683713281717 | -0.0325 % (≤ 0.2 %) | ✓ |
| BJH ads: area cumulata (m²/g) | report Kaomi | 226.038 | 225.87492517526 | -0.0721 % (≤ 0.2 %) | ✓ |
| BJH ads: moda (Å) | report Kaomi | 95.972 | 95.971306417485 | -0.0007 % (≤ 0.1 %) | ✓ |
| BJH des: volume cumulato (cm³/g) | report Kaomi | 0.642049 | 0.641849971444272 | -0.0310 % (≤ 0.2 %) | ✓ |
| BJH des: area cumulata (m²/g) | report Kaomi | 302.698 | 302.551371729235 | -0.0484 % (≤ 0.2 %) | ✓ |
| BJH des: moda (Å) | report Kaomi | 80.3851 | 80.3847458062765 | -0.0004 % (≤ 0.1 %) | ✓ |
| Langmuir lineare: nₘ | analitico | 180 | 180 | LRE 15.0 | ✓ |
| Dubinin–Astakhov: E (kJ/mol) | analitico | 14 | 14.0000000000029 | 2.1e-13 relativo | ✓ |
| Calore isosterico (2 T): massimo scarto di Qst da 28 kJ/mol | Langmuir–Freundlich, ΔH noto | 28 | 28.0014423845114 | 0.001 kJ/mol (≤ 0,5) | ✓ |

La scelta automatica dell'intervallo BET (criteri di Rouquerol a–d, la finestra più ampia, a pari merito r maggiore) coincide con un riferimento indipendente scritto nel test su 20 isoterme sintetiche, scelte in modo che ogni criterio cambi la finestra in almeno un caso. pyGAPS e BETSI non sono stati eseguiti (non installati, nessun download senza permesso): NON VERIFICATO contro di loro.

## R11. Chemisorbimento (`app/sorption-core.js`, SPEC §6)

Dati sintetici con parametri noti e formule pubblicate; formati Kaomi per il chemisorbimento non disponibili. Test: `test/validation/r11-chemisorbimento.test.js`.

| Calcolo | Riferimento | Valore di riferimento | Calcolato | LRE o scarto | Esito |
|---|---|---|---|---|---|
| Pt, aₘ 0,08 nm²: d·D (nm) | 1,13 (Bergeret e Gallezot) | 1.13 | 1.13267343839351 | 0.24 % | ✓ |
| Kissinger, 4 rampe: E (kJ/mol) | Polanyi–Wigner simulato | 90 | 89.9846610498687 | -0.017 % (≤ 1 %) | ✓ |
| Kissinger, 4 rampe: E (kJ/mol) | Polanyi–Wigner simulato | 140 | 139.977136508864 | -0.016 % (≤ 1 %) | ✓ |
| Redhead, primo ordine: E (kJ/mol) | Polanyi–Wigner simulato | 100 | 99.6720606307535 | -0.328 % (≤ 2 %) | ✓ |

## R12. Rimozione del fondo (`app/baseline-core.js`, `baseDefaults` in `index.html`)

Spettri Raman **sintetici** con verità nota (`test/fixtures/raman-sintetici.js`): 1500 punti tra 200 e 3200 cm⁻¹, da 4 a 9 picchi lorentziani, gaussiani o misti (FWHM 6–36 cm⁻¹), sopra un fondo di fluorescenza alto da 2 a 8 volte il picco più alto (gobba gaussiana, polinomio di 3° grado o decadimento esponenziale), più rumore gaussiano. Parametri: quelli preimpostati dal programma. Errore del fondo = fondo stimato − fondo vero, in % del picco più alto; «ritrovati» = picchi veri trovati dalla ricerca automatica entro 3 cm⁻¹ dopo la correzione. Nessuno spettro Raman reale disponibile (né in `examples/` né raggiungibile): la prova su spettri reali resta da fare. Test: `test/validation/fondo-sintetici.test.js`.

Rumore 1 % del picco più alto, 100 spettri:

| Metodo | RMS mediano | RMS 95° perc. | massimo mediano | massimo 95° perc. | ritrovati | falsi per spettro | ms per spettro | Soglia (RMS med / 95°) | Esito |
|---|---|---|---|---|---|---|---|---|---|
| arPLS (Baek 2015) | 0,65 % | 3,10 % | 2,01 % | 22,15 % | 98,1 % | 0,00 | 1,5 | 1,5 / 4,0 % | ✓ |
| ALS (Eilers & Boelens 2005) | 1,53 % | 2,30 % | 5,08 % | 8,60 % | 98,1 % | 0,09 | 0,4 | 2,5 / 4,5 % | ✓ |
| IModPoly (Zhao 2007) | 0,56 % | 1,50 % | 1,21 % | 4,31 % | 98,1 % | 0,03 | 1,3 | 1,5 / 8,0 % | ✓ |
| ModPoly (Lieber 2003) | 1,03 % | 2,24 % | 3,05 % | 10,40 % | 98,1 % | 0,11 | 0,5 | 2,0 / 10,0 % | ✓ |
| SNIP (Ryan 1988) | 1,16 % | 4,29 % | 3,12 % | 12,02 % | 98,1 % | 0,01 | 0,5 | 2,5 / 6,0 % | ✓ |
| rolling ball (Kneen & Annegarn 1996) | 3,18 % | 5,55 % | 17,82 % | 34,80 % | 97,9 % | 0,28 | 0,1 | 4,5 / 8,0 % | ✓ |

Rumore 0,2 % del picco più alto, 40 spettri:

| Metodo | RMS mediano | RMS 95° perc. | massimo mediano | massimo 95° perc. | ritrovati | falsi per spettro | ms per spettro | Soglia (RMS med / 95°) | Esito |
|---|---|---|---|---|---|---|---|---|---|
| arPLS (Baek 2015) | 9,62 % | 281,44 % | 28,96 % | 493,29 % | 97,9 % | 0,05 | 3,4 | — | — |
| ALS (Eilers & Boelens 2005) | 1,58 % | 2,38 % | 5,52 % | 9,15 % | 98,4 % | 0,00 | 0,4 | — | — |
| IModPoly (Zhao 2007) | 0,44 % | 4,14 % | 0,97 % | 13,74 % | 98,4 % | 0,07 | 1,6 | — | — |
| ModPoly (Lieber 2003) | 0,95 % | 5,82 % | 4,22 % | 15,27 % | 98,4 % | 0,10 | 0,4 | — | — |
| SNIP (Ryan 1988) | 1,24 % | 9,50 % | 3,34 % | 22,34 % | 98,4 % | 0,03 | 0,4 | — | — |
| rolling ball (Kneen & Annegarn 1996) | 3,31 % | 6,58 % | 17,59 % | 38,19 % | 98,4 % | 0,15 | 0,1 | — | — |

Rumore 0,05 % del picco più alto, 40 spettri:

| Metodo | RMS mediano | RMS 95° perc. | massimo mediano | massimo 95° perc. | ritrovati | falsi per spettro | ms per spettro | Soglia (RMS med / 95°) | Esito |
|---|---|---|---|---|---|---|---|---|---|
| arPLS (Baek 2015) | 67,24 % | 190,10 % | 163,07 % | 507,85 % | 98,4 % | 0,00 | 5,0 | — | — |
| ALS (Eilers & Boelens 2005) | 1,46 % | 2,63 % | 5,35 % | 10,35 % | 99,0 % | 0,00 | 0,4 | — | — |
| IModPoly (Zhao 2007) | 0,30 % | 2,39 % | 0,68 % | 7,71 % | 99,0 % | 0,05 | 2,5 | — | — |
| ModPoly (Lieber 2003) | 1,03 % | 3,09 % | 4,48 % | 12,37 % | 99,0 % | 0,10 | 0,4 | — | — |
| SNIP (Ryan 1988) | 1,39 % | 7,67 % | 4,09 % | 13,90 % | 99,0 % | 0,00 | 0,4 | — | — |
| rolling ball (Kneen & Annegarn 1996) | 3,33 % | 5,38 % | 17,32 % | 36,47 % | 99,0 % | 0,17 | 0,1 | — | — |

Rumore 3 % del picco più alto, 40 spettri:

| Metodo | RMS mediano | RMS 95° perc. | massimo mediano | massimo 95° perc. | ritrovati | falsi per spettro | ms per spettro | Soglia (RMS med / 95°) | Esito |
|---|---|---|---|---|---|---|---|---|---|
| arPLS (Baek 2015) | 0,84 % | 1,43 % | 2,63 % | 5,18 % | 96,9 % | 0,00 | 0,7 | — | — |
| ALS (Eilers & Boelens 2005) | 2,89 % | 3,38 % | 6,40 % | 9,82 % | 96,9 % | 0,00 | 0,4 | — | — |
| IModPoly (Zhao 2007) | 0,85 % | 3,59 % | 1,88 % | 9,54 % | 96,9 % | 0,03 | 0,9 | — | — |
| ModPoly (Lieber 2003) | 3,10 % | 4,94 % | 4,72 % | 16,85 % | 96,9 % | 0,03 | 0,5 | — | — |
| SNIP (Ryan 1988) | 1,79 % | 7,05 % | 4,14 % | 14,60 % | 96,9 % | 0,00 | 0,4 | — | — |
| rolling ball (Kneen & Annegarn 1996) | 3,53 % | 6,21 % | 20,10 % | 40,48 % | 96,4 % | 0,03 | 0,1 | — | — |

Limite noto: arPLS con la rigidità automatica storica (λ = (n/(2π·8))⁴, come nella 2.x) non segue una fluorescenza ripida sugli spettri molto puliti (rumore ≤ 0,2 % del picco): il fondo resta sotto la fluorescenza e l'errore cresce. Con un λ più basso, o con IModPoly e ALS, l'errore resta sotto il 2–3 %. Vedi `docs/LIMITAZIONI.md`.

## R13. MCR-ALS (`app/mcr-core.js`, SPEC-AVANZATE §2)

Dati **sintetici** con soluzione nota (il committente non ha esperimenti reali di riferimento): picchi cromatografici coeluiti con zone selettive in tempo e in λ (soluzione unica), ordine zero con chiusura, A → B → C con spettri sovrapposti (soluzione non unica). pyMCR non è eseguito: due iterazioni del suo algoritmo pubblicato (Camp, J. Res. NIST 124, 2019: regressione ordinaria e negativi a zero) sono calcolate a mano in frazioni esatte nel test. Test: `test/validation/r13-mcr.test.js`.

| Prova | Riferimento | Atteso | Ottenuto | Soglia | Esito |
|---|---|---|---|---|---|
| Profili C e S senza rumore, partenza SIMPLISMA | C, S sintetici | 0 | 8.88178419700125e-16 · 7.77156117237610e-16 | ≤ 1 % | ✓ |
| Profili C e S senza rumore, partenza EFA | C, S sintetici | 0 | 2.71162085840881e-12 · 5.74088519778027e-13 | ≤ 1 % | ✓ |
| Chiusura (concentrazioni assolute) | C sintetico | 0 | 1.49857903863904e-12 | ≤ 1 % | ✓ |
| Mancanza di adattamento con rumore 0,002 | rumore e PCA | 0.760916234907204 % (rumore), 0.739528792102405 % (PCA) | 0.747263765888415 % | entro ±20 % del rumore, ≥ PCA | ✓ |
| Algoritmo di pyMCR, 2 iterazioni | calcolo a mano: C = [1271, 0, 451]/621 | 2.04669887278583, 0, 0.726247987117552 | 2.04669887278583, 0, 0.726247987117552 | ≤ 1e-14 | ✓ |
| MCR-BANDS, soluzione unica | larghezza ≈ 0 | — | 1.75916837391599e-5 | < 1e-3 | ✓ |
| MCR-BANDS, A → B → C ambiguo | ambiguità rotazionale | — | 0.0741293878288122 | > 0,02 | ✓ |

La soluzione MCR-ALS in generale non è unica: l'app lo scrive sempre e MCR-BANDS (ottimizzazione locale) ne dà un'ampiezza minima. Confronto con MCR-ALS GUI 2.0 e con i dataset del gruppo Tauler non eseguito (MATLAB; licenza dei dati da chiedere).

## R14. Fit globale delle cinetiche (`app/kinetics-core.js`, SPEC-AVANZATE §3)

Levenberg–Marquardt di `kinetics-core.js` sui NIST StRD non lineari (https://www.itl.nist.gov/div898/strd/nls/nls_main.shtml), dati **trascritti a mano** in `test/validation/chemo/strd-nls.js`: la trascrizione è verificata dal fit stesso, che ritrova i valori certificati. Jacobiano analitico. LRE minimo fra i parametri e fra gli errori standard. Con un pianoro (un parametro che cresce senza limite) si riparte una volta con quel parametro al valore iniziale; se resta, il risultato è dichiarato non determinato. Test: `test/validation/r14-cinetiche.test.js`.

| Dataset | Partenza | LRE parametri | LRE errori standard | LRE somma dei quadrati | Ripartenze | Esito |
|---|---|---|---|---|---|---|
| Misra1a (difficoltà bassa) | 1 | 11.1 | 10.8 | 10.5 | 0 | ✓ |
| Misra1a (difficoltà bassa) | 2 | 11.1 | 10.8 | 10.5 | 0 | ✓ |
| BoxBOD (difficoltà alta) | 1 | 9.0 | 8.9 | 10.4 | 1 | ✓ |
| BoxBOD (difficoltà alta) | 2 | 8.5 | 8.4 | 10.4 | 0 | ✓ |
| MGH09 (difficoltà alta) | 1 | 7.0 | 7.1 | 11.6 | 0 | ✓ |
| MGH09 (difficoltà alta) | 2 | 7.7 | 7.8 | 11.6 | 0 | ✓ |
| Thurber (difficoltà alta) | 1 | 8.2 | 7.6 | 11.2 | 0 | ✓ |
| Thurber (difficoltà alta) | 2 | 8.6 | 7.9 | 11.2 | 0 | ✓ |

Senza ripartenza BoxBOD dalla partenza 1 si ferma sul pianoro b₂ = 114.809633306553 (somma dei quadrati 9771.5, modello costante), come molti programmi: `fitCurve` lo riconosce (`plateau`) e non restituisce errori standard.

| Prova (sintetici, k note) | Atteso | Ottenuto | Soglia | Esito |
|---|---|---|---|---|
| ord1, senza rumore | 0.3 | 0.3 | errore relativo ≤ 1e-6 | ✓ |
| consec, senza rumore | 0.5, 0.12 | 0.5, 0.12 | errore relativo ≤ 1e-6 | ✓ |
| ord2, senza rumore | 0.4 | 0.4 | errore relativo ≤ 1e-6 | ✓ |
| ord0, senza rumore | 0.1 | 0.1 | errore relativo ≤ 1e-6 | ✓ |
| par {"nExp":2}, senza rumore | 0.8, 0.1 | 0.8, 0.1 | errore relativo ≤ 1e-6 | ✓ |
| par {"nExp":3,"offset":true}, senza rumore | 0.8, 0.1, 0.02 | 0.8, 0.100000000000017, 0.020000000000064 | errore relativo ≤ 1e-6 | ✓ |
| rev {"K":2}, senza rumore | 0.3 | 0.3 | errore relativo ≤ 1e-6 | ✓ |
| Copertura dell'IC 95 %, ord1, 1000 ripetizioni (σ = 0,01) | 95 % | 93.5 % | 93–97 % | ✓ |
| Copertura dell'IC 95 %, consec, 1000 ripetizioni (σ = 0,01) | 95 % | 94.5 % | 93–97 % | ✓ |
| Confronto dei modelli su dati A → B → C | consec | consec (AIC) | il modello vero | ✓ |

Non eseguiti qui (codice esterno): `scipy.optimize.least_squares` e pyglotaran. La copertura vale con rumore gaussiano indipendente; la funzione di risposta dello strumento (ultraveloce) è fuori dalla 3.0.0.

## R15. XRF: confronto con PyMca (`scripts/confronto-pymca.js`)

*Generato da `node scripts/confronto-pymca.js` (risultati di PyMca 5.9.7 con fisx 1.3.2 in `test/fixtures/pymca/confronto-pymca.json`, scritti da `scripts/confronto-pymca.py`). Il test `test/unit/xrf-pymca-confronto.test.js` controlla gli stessi numeri in CI.*

Area di Acchiappaspettri: gaussiana più code (con il `.cfg` di PyMca, a sola gaussiana, l'area gaussiana comprende anche le code). Criteri su Steel.spe: aree dei gruppi principali entro il 3% (15% per i gruppi sovrapposti ad altri, come Mn Kα sotto Cr Kβ); concentrazioni entro il 6% del certificato e il 10% di PyMca (Mn escluso: PyMca divide diversamente l'area con Cr Kβ). Su XRFSpectrum.mca: χ² non peggiore e aree dei gruppi K e L entro il 15% (le righe M sotto 2,5 keV, sovrapposte fra loro, sono solo riportate), perché lì le aree dipendono molto dal fondo (con SNIP, invece del fondo a B-spline, gli scarti cambiano segno: da +8% a −3/−8%).  Sul bronzo sintetico: entro il 10% della verità e il 20% di PyMca (geometrie solo approssimativamente uguali). χ² ridotto del modello 3.1 non peggiore di quello di PyMca.

### R15.1 Steel.spe (acciaio NIST SRM 1155, eccitazione monocromatica 16 keV)

Condizioni lette da `Steel.cfg`; elementi: Ni, Mn, Pb, As, Fe, W, V, Cr, Cu; intervallo di PyMca (canali 200–1432).

| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto |
|---|---|---|---|
| Cr K | 1184846 | 1196016 | -0,9% |
| Mn K | 96711 | 109608 | -11,8% |
| Fe Ka+Fe Kb | 3547527 | 3566386 | -0,5% |
| Ni K | 511214 | 512385 | -0,2% |
| Cu K | 10158 | 10058 | +1,0% |

| % in peso (normalizzato su Cr+Mn+Fe+Ni+Cu) | Acchiappaspettri 3.1 | PyMca (secondaria + terziaria, Fe di riferimento) | Certificato NIST |
|---|---|---|---|
| Cr | 18,264 | 20,024 | 18,971 |
| Mn | 1,630 | 1,895 | 1,672 |
| Fe | 67,756 | 66,005 | per differenza |
| Ni | 12,167 | 11,897 | 12,754 |
| Cu | 0,183 | 0,179 | 0,179 |

χ² ridotto sullo stesso intervallo: Acchiappaspettri 3.1 **7,90**, 3.0 15,15; PyMca con `Steel.cfg` (sola gaussiana) **13,09**, PyMca con l'ipermetro completo 19,16. Noise/Fano: Acchiappaspettri 105 eV / 0,130, PyMca 105 eV / 0,137. I fondi sono diversi (B-spline nel fit contro SNIP), quindi il χ² dice soprattutto quanto bene è descritta la forma dei picchi.

### R15.2 XRFSpectrum.mca (standard sottile multielemento distribuito con PyMca)

Condizioni dal `.cfg` di `PyMca5/tests/XrfTest.py`; aree in unità dello spettro (conteggi normalizzati). La concentrazione non si confronta: PyMca usa uno standard interno (Co) e uno strato sottile, che l'app non prevede.

| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto | Nel criterio |
|---|---|---|---|---|
| Ar K | 7670,9154 | 7284,5606 | +5,3% | no (< 1% del totale) |
| Ca K | 9487,5065 | 9397,0349 | +1,0% | no (< 1% del totale) |
| Ti K | 15429,9838 | 14836,3565 | +4,0% | sì |
| V K | 19860,8552 | 18856,2495 | +5,3% | sì |
| Cr K | 26582,5911 | 25084,0118 | +6,0% | sì |
| Mn K | 33671,0088 | 31587,5719 | +6,6% | sì |
| Fe K | 43027,1585 | 39996,6964 | +7,6% | sì |
| Co K | 50875,1211 | 46933,8383 | +8,4% | sì |
| Ni K | 62772,0963 | 58119,2601 | +8,0% | sì |
| Cu K | 70121,9707 | 64988,5373 | +7,9% | sì |
| Zn K | 80339,1473 | 75169,8951 | +6,9% | sì |
| Zn L | 0,0000 | 452,5626 | -100,0% | no (< 1% del totale) |
| As K | 108080,6427 | 100762,3329 | +7,3% | sì |
| As L | 1042,9059 | 447,4769 | +133,1% | no (< 1% del totale) |
| Se K | 115285,8519 | 108113,0960 | +6,6% | sì |
| Se L | 1340,9498 | 971,9866 | +38,0% | no (< 1% del totale) |
| Sr K | 137607,4666 | 123927,7256 | +11,0% | sì |
| Sr L | 3861,0405 | 3093,3100 | +24,8% | no (< 1% del totale) |
| Cd L | 2658,2897 | 3113,6104 | -14,6% | no (< 1% del totale) |
| Sb L | 5064,1006 | 6205,6459 | -18,4% | no (< 1% del totale) |
| Tl L | 96167,1246 | 98831,5287 | -2,7% | sì |
| Tl M | 11135,1057 | 15018,4209 | -25,9% | no (righe M) |
| Pb L | 98153,9538 | 99445,3070 | -1,3% | sì |
| Pb M | 13667,2505 | 13455,3309 | +1,6% | no (righe M) |

### R15.3 Bronzo SINTETICO di `examples/` (tubo Rh 40 kV)

Tubo di Ebel in entrambi i programmi, matrice iterata e normalizzata a 100%. Lo spettro è generato col modello 3.0 dell'app (tubo di Kramers): la «verità» vale per quel modello.

| % in peso | Verità | Acchiappaspettri 3.1 | PyMca |
|---|---|---|---|
| Cu | 84,00 | 83,60 | 82,26 |
| Sn | 8,00 | 8,41 | 8,82 |
| Pb | 5,00 | 4,95 | 5,91 |
| Zn | 2,50 | 2,51 | 2,56 |
| As | 0,50 | 0,53 | 0,45 |


