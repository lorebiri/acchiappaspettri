# Installazione · Installation

Scarica il pacchetto dalla pagina dell'ultima versione: <https://github.com/lorebiri/acchiappaspettri/releases/latest> oppure dal pulsante «Scarica Acchiappaspettri Desktop» sulla [pagina online](https://lorebiri.github.io/acchiappaspettri/). Non servono terminale, runtime o configurazioni.

| Sistema | File | Come |
|---|---|---|
| Windows 10/11 | `…_x64-setup.exe` | Doppio clic, scegli la lingua, avanti. Non servono privilegi di amministratore. Voce nel menu Start; si disinstalla dalle Impostazioni di Windows. |
| macOS 11+ Apple Silicon | `…_aarch64.dmg` | Apri, trascina in Applicazioni. |
| macOS 11+ Intel | `…_x64.dmg` | Come sopra. |
| Linux | `…_amd64.AppImage` | Rendi eseguibile (`chmod +x`, o dalle proprietà del file) e apri. Avvisa delle nuove versioni e si aggiorna dopo la tua conferma. |
| Debian, Ubuntu | `…_amd64.deb` | Apri con il gestore pacchetti. Si aggiorna scaricando il pacchetto nuovo: l'app ti avvisa. |

## Gli avvisi del browser e del sistema al primo avvio
I pacchetti **non sono firmati** con certificati Microsoft o Apple (costano e sono personali), quindi browser, sistema e antivirus avvisano. Gli aggiornamenti invece sono firmati e verificati dall'app.

**Windows**: gli avvisi arrivano in quest'ordine.
1. **Edge, durante il download**: può dire che il file «non viene scaricato comunemente». Apri ⋯ accanto al download → *Mantieni*, poi, se lo chiede, *Mostra altro* → *Mantieni comunque*. In Chrome scegli *Conserva* (o *Mantieni*, secondo la versione).
2. **SmartScreen**, quando apri l'installer: nella finestra blu «Windows ha protetto il PC» fai clic su *Ulteriori informazioni* → *Esegui comunque*.
3. **Avviso di sicurezza** con «Autore sconosciuto»: scegli *Esegui*. L'installazione è per il solo utente: di solito non serve la password di amministratore.
- Sui PC gestiti dall'ente *Esegui comunque* può mancare: chiedi al servizio informatico di installarlo.

**Windows 11, Controllo intelligente delle app (Smart App Control).** Se è attivo, blocca i programmi non firmati senza offrire *Esegui comunque*: si blocca l'installer e, dopo, anche l'app. Lo vedi in *Sicurezza di Windows → Controllo delle app e del browser → Impostazioni di Controllo intelligente delle app*. Non c'è un'eccezione per un solo programma: si può solo spegnere per tutto il PC, ed è una scelta di sicurezza che spetta a te o al servizio informatico (secondo Microsoft, su molte versioni di Windows 11 una volta spento non si riaccende senza reinstallare il sistema). Se non vuoi spegnerlo usa la [versione online](https://lorebiri.github.io/acchiappaspettri/), che fa le stesse analisi nel browser. La soluzione vera è firmare il programma con un certificato, che oggi non c'è.

**Avast e AVG.** Anche dopo l'installazione l'antivirus può aprire l'app non firmata nella sua *sandbox* (un ambiente isolato): l'app parte lenta, non salva dove le chiedi o mostra un bordo o un avviso dell'antivirus. Per farla partire normalmente aggiungi un'eccezione per il programma installato:
1. trova il percorso completo: in Esplora file scrivi `%LOCALAPPDATA%\Acchiappaspettri` nella barra degli indirizzi e premi Invio; il programma è `acchiappaspettri.exe`, cioè di solito `C:\Users\<il tuo nome>\AppData\Local\Acchiappaspettri\acchiappaspettri.exe`;
2. apri Avast (o AVG), entra nelle impostazioni e cerca la sezione delle **eccezioni** (in inglese *Exceptions*); aggiungi un'eccezione con quel percorso completo;
3. se l'antivirus ha messo l'installer o l'app in quarantena, ripristinali dalla sua sezione della quarantena prima di riprovare.

I nomi esatti dei menu cambiano fra le versioni di Avast e AVG e non sono stati provati: se non trovi la voce, cerca «eccezioni» nelle impostazioni dell'antivirus. Il percorso del programma non cambia con gli aggiornamenti, quindi l'eccezione resta valida. Sui PC dell'ente chiedi al servizio informatico, che di solito gestisce l'antivirus.

**macOS**: se viene bloccata, *Impostazioni di Sistema → Privacy e sicurezza → Apri comunque*.

## Requisiti
- **Windows**: serve il componente WebView2, già presente su Windows 11 e sulla maggior parte dei Windows 10. Se manca, l'installer lo scarica: **senza internet in quel caso l'installazione si ferma**. Sui PC di strumento isolati dalla rete installa prima WebView2 Runtime (installer offline Microsoft).
- **Linux**: il `.deb` richiede `libwebkit2gtk-4.1-0` (Ubuntu 22.04 o successivi, Debian 12 o successivi). L'AppImage richiede FUSE sul sistema. Provato solo con la compilazione automatica, non su ogni distribuzione.
- **macOS**: 11 o successivi.

## Lingua
Su Windows la scegli nell'installer e l'app la usa al primo avvio. Su macOS e Linux l'app la chiede al primo avvio. Si cambia quando vuoi da ⚙️ Impostazioni o 🌐.

---
# Installation (English)

Download the package from the [latest release](https://github.com/lorebiri/acchiappaspettri/releases/latest) or from the «Download Acchiappaspettri Desktop» button on the [online version](https://lorebiri.github.io/acchiappaspettri/). On the release page the files are under **Assets**; «Source code (zip)» is the source code, not the program.

| System | File | How |
|---|---|---|
| Windows 10/11 | `…_x64-setup.exe` | Double-click, choose the language, next. No administrator rights needed. Start menu entry; uninstall from Windows Settings. |
| macOS 11+ Apple Silicon | `…_aarch64.dmg` | Open, drag to Applications. |
| macOS 11+ Intel | `…_x64.dmg` | As above. |
| Linux | `…_amd64.AppImage` | Make it executable (`chmod +x`, or from the file properties) and open it. It tells you about new versions and updates after you confirm. |
| Debian, Ubuntu | `…_amd64.deb` | Open with the package manager. Update by downloading the new package: the app tells you. |

## Browser and system warnings at first launch
The packages are **not signed** with Microsoft or Apple certificates, so browser, system and antivirus warn. Updates are signed and verified by the app.

**Windows**: the warnings come in this order.
1. **Edge, while downloading**: it may say the file «is not commonly downloaded». Open ⋯ next to the download → *Keep*, then, if asked, *Show more* → *Keep anyway*. In Chrome choose *Keep*.
2. **SmartScreen**, when you open the installer: in the blue «Windows protected your PC» window click *More info* → *Run anyway*.
3. **Security Warning** with «Unknown publisher»: choose *Run*. The installation is for your user only: usually no administrator password is needed.
- On PCs managed by your institution *Run anyway* may be missing: ask IT to install it.

**Windows 11, Smart App Control.** When it is on, it blocks unsigned programs with no *Run anyway*: the installer is blocked, and later the app too. You find it in *Windows Security → App & browser control → Smart App Control settings*. There is no exception for a single program: it can only be turned off for the whole PC, a security choice for you or your IT service (according to Microsoft, on many Windows 11 versions it cannot be turned back on without reinstalling Windows). If you do not want to turn it off, use the [online version](https://lorebiri.github.io/acchiappaspettri/), which runs the same analyses in the browser. The real fix is a code-signing certificate, which the project does not have today.

**Avast and AVG.** Even after installation the antivirus may run the unsigned app in its *sandbox* (an isolated environment): the app starts slowly, does not save where you ask, or shows a border or an antivirus notice. To run it normally, add an exception for the installed program:
1. find the full path: in File Explorer type `%LOCALAPPDATA%\Acchiappaspettri` in the address bar and press Enter; the program is `acchiappaspettri.exe`, usually `C:\Users\<your name>\AppData\Local\Acchiappaspettri\acchiappaspettri.exe`;
2. open Avast (or AVG), go to its settings and look for the **Exceptions** section; add an exception with that full path;
3. if the antivirus quarantined the installer or the app, restore them from its quarantine section before trying again.

The exact menu names change between Avast and AVG versions and have not been tested: if you cannot find the item, search for «exceptions» in the antivirus settings. The program path does not change with updates, so the exception stays valid. On institutional PCs ask IT, who usually manage the antivirus.

**macOS**: if it is blocked, *System Settings → Privacy & Security → Open Anyway*.

## Requirements and language
- **Windows** needs WebView2, already present on Windows 11 and most Windows 10 PCs; if it is missing the installer downloads it, so **without internet the installation stops**. On offline instrument PCs install the WebView2 Runtime first (Microsoft offline installer).
- **Linux**: the `.deb` needs `libwebkit2gtk-4.1-0` (Ubuntu 22.04+, Debian 12+); the AppImage needs FUSE. **macOS** 11 or later.
- On Windows the language is chosen in the installer; on macOS and Linux at first launch. Change it any time from ⚙️ Settings or 🌐.
