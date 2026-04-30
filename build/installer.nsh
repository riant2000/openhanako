; installer.nsh — NSIS custom hooks for Hanako installer
;
; Kills running Hanako processes before install/uninstall to prevent
; "file in use" errors on Windows overlay installs.

; Disable CRC integrity check — electron-builder's post-compilation PE editing
; (signtool + rcedit) corrupts the NSIS CRC when no signing cert is configured,
; causing "Installer integrity check has failed" on Windows.
CRCCheck off

!include LogicLib.nsh

!macro hanakoCleanBundledServer
  ; resources\server is generated on every build. Remove it before copying
  ; new files so a failed stale uninstall cannot leave mixed bundle/deps/native files.
  IfFileExists "$INSTDIR\resources\server\*.*" 0 +3
    DetailPrint "Removing old bundled server resources"
    RMDir /r "$INSTDIR\resources\server"
!macroend

!macro customInit
  ; Kill Electron main process
  nsExec::ExecToLog 'taskkill /F /IM "Hanako.exe"'
  ; Kill bundled server process (renamed node.exe)
  nsExec::ExecToLog 'taskkill /F /IM "hana-server.exe"'
  ; Wait for file handles to release
  Sleep 2000
!macroend

!macro customUnInstallCheck
  ; Preserve electron-builder's default handling: a missing stale uninstaller
  ; can fall through to a clean overlay, but a real non-zero uninstaller exit
  ; must stop the install instead of silently mixing old and new files.
  ${If} ${Errors}
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller; continuing with clean overlay.`
    ClearErrors
  ${ElseIf} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${EndIf}
  !insertmacro hanakoCleanBundledServer
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /F /IM "Hanako.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "hana-server.exe"'
  Sleep 2000
!macroend
