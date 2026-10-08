// Configuração do site de download do OctoSearch.
// Troque DOWNLOAD_URL pelo link público do instalador (ex.: GitHub Releases).
// O arquivo .exe tem ~113 MB e por isso NÃO pode ficar dentro do deploy da Vercel (limite de 100 MB por arquivo).
window.OCTO_CONFIG = {
  version: '1.0.0',
  sizeLabel: '113 MB',
  installerUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch-Setup.exe',
  portableUrl: 'https://github.com/Felip3ra/OctoSearch/releases/latest/download/OctoSearch.exe',
};
