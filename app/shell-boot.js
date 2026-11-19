// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* In testa, prima del corpo: decide se la pagina è l'app desktop, così non compare mai l'interfaccia online */
window.ACCH_SHELL=!!(window.__TAURI__||window.ACCH_SHELL_PREVIEW);
if (window.ACCH_SHELL){ document.documentElement.classList.add('shell'); try{ AcchHost.store.setItem('acch.tourDone','true'); AcchHost.store.setItem('acch.welcomeDone','true'); }catch(e){} }
else { document.documentElement.classList.add('web'); try{ if (JSON.parse(AcchHost.store.getItem('acch.web.full'))) document.documentElement.classList.add('web-full'); }catch(e){} }
