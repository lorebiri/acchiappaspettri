# Dipendenze e licenze

| Componente | Uso | Licenza | Dove |
|---|---|---|---|
| jsPDF 2.5.1 | esportazione PDF | MIT | `vendor/` (distribuita) |
| JSZip 3.10.1 | ZIP, progetti, Excel | MIT o GPLv3 (si usa MIT) | `vendor/` (distribuita) |
| Nunito | carattere | SIL OFL 1.1 (`vendor/fonts/OFL-LICENSE.txt`) | `vendor/fonts/` (distribuito) |
| xraylib 4.x | genera le tabelle `FP_DATA` (non è distribuito il programma, solo dati calcolati) | BSD (da citare: Schoonjans et al. 2011) | solo `scripts/gen-fp-data.py` |
| Tauri 2 e plugin | app desktop | MIT o Apache-2.0 | binario |
| Dipendenze Rust | vedi `src-tauri/Cargo.lock` | in prevalenza MIT/Apache-2.0; elenco verificabile con `cargo metadata` | binario |
| Playwright, acorn, @tauri-apps/cli | solo sviluppo e test | Apache-2.0, MIT, MIT o Apache-2.0 | non distribuiti |

**Obblighi**: conservare gli avvisi di licenza MIT/Apache/OFL nei pacchetti distribuiti, citare xraylib.

**Attenzione**: il repository **non ha un file di licenza**. Senza licenza, per legge nessuno ha il diritto di riutilizzare il codice. Non ne ho aggiunta una perché è una decisione dell'autore (e forse del CNR).
