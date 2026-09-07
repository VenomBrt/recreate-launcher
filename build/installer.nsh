; Custom NSIS — instalação local do usuário (launcher desktop real)
!macro customInstall
  DetailPrint "Configurando pastas do Recreate..."
  CreateDirectory "$LOCALAPPDATA\Recreate"
  CreateDirectory "$LOCALAPPDATA\Recreate\game"
  CreateDirectory "$LOCALAPPDATA\Recreate\cache"
!macroend
