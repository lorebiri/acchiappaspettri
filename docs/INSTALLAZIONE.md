# Installazione · Installation

Scarica il pacchetto dalla pagina dell'ultima versione: <https://github.com/lorebiri/acchiappaspettri/releases/latest> oppure dal pulsante «Scarica Acchiappaspettri Desktop» sulla [pagina online](https://lorebiri.github.io/acchiappaspettri/). Non servono terminale, runtime o configurazioni.

| Sistema | File | Come |
|---|---|---|
| Windows 10/11 | `…_x64-setup.exe` | Doppio clic, scegli la lingua, avanti. Non servono privilegi di amministratore. Voce nel menu Start; si disinstalla dalle Impostazioni di Windows. |
| macOS 11+ Apple Silicon | `…_aarch64.dmg` | Apri, trascina in Applicazioni. |
| macOS 11+ Intel | `…_x64.dmg` | Come sopra. |
| Linux | `…_amd64.AppImage` | Rendi eseguibile (`chmod +x`, o dalle proprietà del file) e apri. Si aggiorna da sola. |
| Debian, Ubuntu | `…_amd64.deb` | Apri con il gestore pacchetti. Si aggiorna scaricando il pacchetto nuovo: l'app ti avvisa. |

## Gli avvisi del sistema al primo avvio
I pacchetti **non sono firmati** con certificati Microsoft o Apple (costano e sono personali), quindi il sistema avvisa. Gli aggiornamenti invece sono firmati e verificati dall'app.
- **Windows**: «PC protetto da Windows» → *Ulteriori informazioni* → *Esegui comunque*.
- **macOS**: se viene bloccata, *Impostazioni di Sistema → Privacy e sicurezza → Apri comunque*.

## Requisiti
- **Windows**: serve il componente WebView2, già presente su Windows 11 e sulla maggior parte dei Windows 10. Se manca, l'installer lo scarica: **senza internet in quel caso l'installazione si ferma**. Sui PC di strumento isolati dalla rete installa prima WebView2 Runtime (installer offline Microsoft).
- **Linux**: il `.deb` richiede `libwebkit2gtk-4.1-0` (Ubuntu 22.04 o successivi, Debian 12 o successivi). L'AppImage richiede FUSE sul sistema. Provato solo con la compilazione automatica, non su ogni distribuzione.
- **macOS**: 11 o successivi.

## Lingua
Su Windows la scegli nell'installer e l'app la usa al primo avvio. Su macOS e Linux l'app la chiede al primo avvio. Si cambia quando vuoi da ⚙️ Impostazioni o 🌐.

---
Download from the [latest release](https://github.com/lorebiri/acchiappaspettri/releases/latest). Packages are not signed with Microsoft or Apple certificates, so the system warns on first launch (Windows: *More info → Run anyway*; macOS: *System Settings → Privacy & Security → Open Anyway*). Updates are signed and verified by the app. On Windows the language is chosen in the installer; on macOS and Linux at first launch.
