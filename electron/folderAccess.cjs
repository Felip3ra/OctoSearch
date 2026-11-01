const path = require('node:path');
const fs = require('node:fs');

/** Accepts regular logs, numeric rotations (app.log.1) and gzip-compressed rotations (app.log.1.gz). */
function isSupportedLogFileName(fileName) {
  return /\.(?:log|txt)(?:\.\d+)?(?:\.gz)?$/i.test(String(fileName).trim());
}

function pathApiFor(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

/** True when `target` is `root` itself or lies below it (Windows paths compare case-insensitively). */
function isPathInside(root, target, platform = process.platform) {
  const pathApi = pathApiFor(platform);
  let resolvedRoot = pathApi.resolve(root);
  let resolvedTarget = pathApi.resolve(target);
  if (platform === 'win32') {
    resolvedRoot = resolvedRoot.toLowerCase();
    resolvedTarget = resolvedTarget.toLowerCase();
  }
  const relative = pathApi.relative(resolvedRoot, resolvedTarget);
  if (relative === '') return true;
  return relative !== '..' && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative);
}

/**
 * Folders the user explicitly granted (folder picker, confirmation dialog or the one-time import of
 * folders saved before this list existed). The renderer can only read files below these folders.
 */
class AllowedFolders {
  constructor(storePath, platform = process.platform) {
    this.storePath = storePath;
    this.platform = platform;
    this.folders = [];
    this.existedAtStartup = false;
    this.imported = false;
    try {
      const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      if (Array.isArray(parsed?.folders)) this.folders = parsed.folders.filter((item) => typeof item === 'string');
      this.existedAtStartup = true;
    } catch {
      // First run with this feature: nothing granted yet.
    }
  }

  has(target) {
    return this.folders.some((folder) => isPathInside(folder, target, this.platform));
  }

  add(folder) {
    if (this.folders.some((existing) => isPathInside(existing, folder, this.platform) && isPathInside(folder, existing, this.platform))) {
      return;
    }
    this.folders.push(folder);
    this.save();
  }

  /** Grants the folders the app already knew about, only once and only before the list ever existed. */
  importKnown(folders) {
    if (this.existedAtStartup || this.imported) return false;
    this.imported = true;
    for (const folder of folders) {
      if (typeof folder === 'string' && folder.trim()) this.folders.push(folder);
    }
    this.save();
    return true;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify({ folders: this.folders }, null, 2));
    } catch (error) {
      console.warn('Não foi possível salvar as pastas permitidas:', error);
    }
  }
}

module.exports = { AllowedFolders, isPathInside, isSupportedLogFileName };
