; Registra la lingua scelta nell'installer: l'app la legge al primo avvio. 1040 = italiano, 1033 = inglese.
!macro NSIS_HOOK_POSTINSTALL
  FileOpen $0 "$INSTDIR\installer-language.txt" w
  FileWrite $0 "$LANGUAGE"
  FileClose $0
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\installer-language.txt"
!macroend
