; Registra la lingua scelta nell'installer: l'app la legge al primo avvio. 1040 = italiano, 1033 = inglese.
; Apri con (I3): i file di dati leggibili compaiono in «Apri con» senza togliere il programma predefinito.
;  .ch e .uv (Agilent) e JCAMP-DX sono associati da tauri.conf.json (predefiniti); .csv, .txt, .arw (anche foto Sony) e gli altri solo qui, con OpenWithProgids.
; Stesso elenco di RAW_EXT in src/lib.rs (test/unit/associazioni.test.js).
!define ACCH_PROGID "Acchiappaspettri.Dati"
!macro ACCH_OPENWITH EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${ACCH_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}" ""
!macroend
!macro ACCH_OPENWITH_DEL EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${ACCH_PROGID}"
!macroend
!macro ACCH_OPENWITH_ALL M
  !insertmacro ${M} "arw"
  !insertmacro ${M} "csv"
  !insertmacro ${M} "tsv"
  !insertmacro ${M} "txt"
  !insertmacro ${M} "asc"
  !insertmacro ${M} "dat"
  !insertmacro ${M} "prn"
  !insertmacro ${M} "xy"
  !insertmacro ${M} "dpt"
  !insertmacro ${M} "spa"
  !insertmacro ${M} "spt"
  !insertmacro ${M} "spe"
  !insertmacro ${M} "sp"
  !insertmacro ${M} "exp"
  !insertmacro ${M} "mca"
!macroend
!macro NSIS_HOOK_POSTINSTALL
  FileOpen $0 "$INSTDIR\installer-language.txt" w
  FileWrite $0 "$LANGUAGE"
  FileClose $0
  WriteRegStr SHCTX "Software\Classes\${ACCH_PROGID}" "" "Spectrum or chromatogram data"
  WriteRegStr SHCTX "Software\Classes\${ACCH_PROGID}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\${ACCH_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "Acchiappaspettri"
  !insertmacro ACCH_OPENWITH_ALL ACCH_OPENWITH
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\installer-language.txt"
  !insertmacro ACCH_OPENWITH_ALL ACCH_OPENWITH_DEL
  DeleteRegKey SHCTX "Software\Classes\${ACCH_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
