// Configuração do site de download do OctoSearch.
// Troque DOWNLOAD_URL pelo link público do instalador (ex.: GitHub Releases).
// O arquivo .exe tem ~113 MB e por isso NÃO pode ficar dentro do deploy da Vercel (limite de 100 MB por arquivo).
window.OCTO_CONFIG = {
  version: '1.0.1',
  sizeLabel: '113 MB',
  installerUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-Setup.exe',
  // Repositório consultado para mostrar sempre a versão e o tamanho da última release.
  releasesApi: 'https://api.github.com/repos/Felip3ra/OctoSearch/releases/latest',
  portableUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch.exe',
};
