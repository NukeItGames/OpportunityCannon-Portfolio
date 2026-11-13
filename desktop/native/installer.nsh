!macro customInstall
  FileOpen $0 "$INSTDIR\resources\native\host.json" w
  FileWrite $0 '{"name":"com.opportunitycannon.bridge","description":"Opportunity Cannon local bridge","path":"CannonHost.exe","type":"stdio","allowed_origins":["chrome-extension://aniflijjcgbekbpcpmkljoeflifjhobl/"]}'
  FileClose $0
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\com.opportunitycannon.bridge" "" "$INSTDIR\resources\native\host.json"
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.opportunitycannon.bridge" "" "$INSTDIR\resources\native\host.json"
!macroend
!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Google\Chrome\NativeMessagingHosts\com.opportunitycannon.bridge" ""
  StrCmp $0 "$INSTDIR\resources\native\host.json" 0 +2
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.opportunitycannon.bridge"
  ReadRegStr $0 HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.opportunitycannon.bridge" ""
  StrCmp $0 "$INSTDIR\resources\native\host.json" 0 +2
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.opportunitycannon.bridge"
!macroend
