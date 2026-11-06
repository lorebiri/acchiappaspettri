# Rapporto finale: Acchiappaspettri 2.2.0

Stato al rilascio della versione 2.2.0 (novembre 2026). Questo documento distingue sempre tra **pacchetto generato**, **test automatico**, **prova dei tester virtuali** e **prova su hardware reale**.

## In breve

| Versione | Pacchetto | Generato | Provato in automatico | Provato a mano su hardware reale |
|---|---|---|---|---|
| Online | pagina web (GitHub Pages) | sì | test di interfaccia (38) e tester virtuali | da fare dopo la pubblicazione |
| Windows 10/11 | `.exe` (NSIS, per l'utente) | sì, in CI | Windows Server 2025: collaudo dentro l'app, installazione, avvio, menu Start, disinstallazione | **no**: lista per Windows 10 in [COLLAUDO.md](COLLAUDO.md) |
| macOS Apple Silicon | `.dmg` | sì, in CI | macOS ARM: collaudo dentro l'app | da fare dopo la pubblicazione |
| macOS Intel | `.dmg` | sì, in CI | Mac Intel nativo: collaudo dentro l'app | da fare dopo la pubblicazione |
| Linux | AppImage e `.deb` | sì, in CI | Ubuntu 22.04: collaudo dentro l'app | da fare dopo la pubblicazione |

Collegamenti: versione online <https://lorebiri.github.io/acchiappaspettri/> · rilasci <https://github.com/lorebiri/acchiappaspettri/releases>. L'elenco dei file scaricabili è in fondo, aggiornato alla pubblicazione.

## Funzionalità completate

- **Due prodotti coordinati.** La versione online è leggera (grafici, confronti, Peak Recognizing, assegnazione dei composti, riferimenti); gli strumenti di studio si aprono con «Mostra qui». La versione desktop ha un proprio spazio di lavoro: menu nativi, barra degli strumenti, pannelli, ispettore e barra di stato. Picchi e assegnazioni danno risultati identici nelle due versioni (verificato su 24 file).
- **Formato `.acchspettri`**: ZIP documentato con schema versionato, migrazioni, impronta SHA-256 e controllo a ogni apertura ([FORMATO-ACCHSPETTRI.md](FORMATO-ACCHSPETTRI.md)).
- **Italiano e inglese**: lingua scelta nell'installer di Windows o al primo avvio, salvata e modificabile.
- **Aggiornamenti firmati**: controllo con consenso, firma verificata, pacchetto adatto all'architettura. Il controllo non invia dati scientifici né nomi di file ([AGGIORNAMENTI.md](AGGIORNAMENTI.md)).
- **Sezione download online**: legge l'ultima release e mostra sistema, architettura e formato.
- **Qualità scientifica**:
  - ipotesi dichiarate con prudenza (inconclusiva, parziale, plausibile, «poche per decidere»);
  - stime XRF senza standard etichettate come tali;
  - tarature con ruoli, pesi, LOD/LOQ, Mandel e stato di ogni stima;
  - andamento nel tempo descritto come solo indicativo;
  - bozza dei metodi con bibliografia fedele a ciò che è stato davvero eseguito;
  - tracciabilità con impronta per ogni spettro;
  - dati originali mai modificati.
- **Controllo del dato**: avvisi di importazione, rumore, saturazione, fondo e coeluizioni HPLC rispetto agli standard; i problemi gravi (⛔) compaiono sotto il grafico, accanto al nome e nella barra di stato.
- **Numeri scritti a mano controllati**: un solo separatore decimale; migliaia, spazi, testo, valori negativi o ambigui («1.000») sono rifiutati con un avviso, mai troncati.

## Come è stato verificato

- **Test automatici**: 82 test unitari, 38 test di interfaccia (oltre 2800 operazioni), benchmark di picchi, aree e analisi, formati binari, collaudo dentro l'app nativa sui quattro sistemi della CI e installazione reale su Windows Server 2025 ([COLLAUDO.md](COLLAUDO.md)).
- **Tester virtuali**: venti cicli di prova, correzione e nuova prova. I tester sono sub-agenti con un profilo, **non persone reali**: non rappresentano i ricercatori a cui si ispirano e non costituiscono una validazione dell'ICCOM. Hanno usato solo dati sintetici.
- **Agente Capo Progetto**: ha rappresentato il committente, valutato le proposte e posto le condizioni di rilascio C1–C7.

## Esiti per agente (ultimo ciclo)

| Agente | Esito finale |
|---|---|
| Agente scientifico (C) | nulla di realizzabile da segnalare |
| NMR/EPR e chimica teorica | nulla di realizzabile da segnalare |
| Beni culturali, XRF senza standard, qualitativa multi-tecnica | nulla di realizzabile da segnalare |
| HPLC | *da completare* |
| Ricercatore generale e chimico analitico | *da completare* |
| Ricercatore senior (Windows simulato) | *da completare* |
| Architetto | *da completare* |
| UI/UX | *da completare* |
| Collaudo web e desktop (D) | *da completare* |
| Agente Capo Progetto | *decisione di rilascio da completare* |

## Problemi trovati e corretti (sintesi)

I dettagli sono nella storia dei commit del ramo `desktop` e in [CHANGELOG.md](../CHANGELOG.md). Tra i più importanti:
- **Importazione**: letture sbagliate in silenzio (separatori, colonne, blocchi, intestazioni con il tempo); riconoscimento della tecnica da intestazioni ambigue (gradiente «B (%)», temperatura del forno, massa in %).
- **Scienza**:
  - falsi allarmi di spalla sulle code HPLC;
  - coeluizioni nascoste quando anche gli standard hanno la coda;
  - cime sature non riconosciute;
  - nota sugli elementi XRF in contrasto con le ipotesi;
  - metodi che citavano test non eseguiti.
- **Uso**:
  - tasti persi e valori vecchi a schermo durante la scrittura;
  - campi che mostravano numeri diversi da quelli usati;
  - avvisi gravi invisibili;
  - pannelli e tabelle tagliati a 1024 px e sul telefono;
  - traduzioni mancanti.

## Limitazioni residue

Sono elencate in [LIMITAZIONI.md](LIMITAZIONI.md). Le principali:
- **Windows 10 reale non provato**, e niente firma Microsoft né Apple: al primo avvio compaiono gli avvisi di SmartScreen e di Gatekeeper.
- **Aggiornamento reale non ancora provato**: si potrà provare solo dalla 2.2.1 in poi.
- **Limiti scientifici dichiarati**: coeluizioni a meno di circa 2σ, cime sature lievi, XRF oltre 50 kV, file binari proprietari non letti.

## Dopo la pubblicazione (condizione C7)

- Entro 48 ore: scaricare i pacchetti dalla pagina online e installarli almeno su un PC Windows e su un Mac reali.
- Entro due settimane: pubblicare una 2.2.1 per provare davvero l'aggiornamento firmato.
- Custodire una copia della chiave di firma fuori dal Mac di sviluppo.

## File scaricabili

*Elenco aggiornato alla pubblicazione della release v2.2.0.*
