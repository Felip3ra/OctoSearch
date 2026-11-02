// Configuração do site de download do OctoSearch.
// Troque DOWNLOAD_URL pelo link público do instalador (ex.: GitHub Releases).
// O arquivo .exe tem ~105 MB e por isso NÃO pode ficar dentro do deploy da Vercel (limite de 100 MB por arquivo).
window.OCTO_CONFIG = {
  version: '1.1.0',
  sizeLabel: '105 MB',
  installerUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-Setup.exe',
  // Repositório consultado para mostrar sempre a versão e o tamanho da última release.
  releasesApi: 'https://api.github.com/repos/Felip3ra/OctoSearch/releases/latest',
  portableUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch.exe',
  // Pacotes Linux, gerados pelo workflow .github/workflows/release-linux.yml na mesma release.
  appImageUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-x86_64.AppImage',
  debUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-amd64.deb',
  // macOS, gerados pelo workflow .github/workflows/release-macos.yml na mesma release.
  macArmUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-arm64.dmg',
  macIntelUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-x64.dmg',
};
