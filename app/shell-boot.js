/* In testa, prima del corpo: decide se la pagina è l'app desktop, così non compare mai l'interfaccia online */
window.ACCH_SHELL=!!(window.__TAURI__||window.ACCH_SHELL_PREVIEW);
if (window.ACCH_SHELL){ document.documentElement.classList.add('shell'); try{ localStorage.setItem('acch.tourDone','true'); localStorage.setItem('acch.welcomeDone','true'); }catch(e){} }
