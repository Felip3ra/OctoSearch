const fs = require('node:fs');
const zlib = require('node:zlib');
const { promisify } = require('node:util');

const inflateRaw = promisify(zlib.inflateRaw);

/** A log inside a zip is addressed as "<zip path>::<name inside the zip>" (":" cannot appear in Windows names). */
const ZIP_SEPARATOR = '::';
/** Archives with a huge directory or entries bigger than this are refused (zip bombs). */
const MAX_ZIP_ENTRIES = 20000;
const MAX_ENTRY_BYTES = 1024 * 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function isZipFileName(fileName) {
  return /\.zip$/i.test(String(fileName));
}

function joinZipPath(zipPath, innerName) {
  return `${zipPath}${ZIP_SEPARATOR}${innerName}`;
}

/** { zipPath, innerName } for a path inside a zip, or null for a regular file. */
function splitZipPath(filePath) {
  const index = String(filePath).indexOf(ZIP_SEPARATOR);
  if (index <= 0) return null;
  const zipPath = filePath.slice(0, index);
  const innerName = filePath.slice(index + ZIP_SEPARATOR.length);
  if (!isZipFileName(zipPath) || !innerName) return null;
  return { zipPath, innerName };
}

async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, position + read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  return buffer.subarray(0, read);
}

function dosDateTimeToMs(date, time) {
  const year = ((date >> 9) & 0x7f) + 1980;
  const month = ((date >> 5) & 0x0f) - 1;
  const day = date & 0x1f;
  return new Date(year, month, day, (time >> 11) & 0x1f, (time >> 5) & 0x3f, (time & 0x1f) * 2).getTime();
}

/** Lists the files of a zip from its central directory (no ZIP64, encrypted entries are skipped). */
async function listZipEntries(zipPath) {
  const handle = await fs.promises.open(zipPath, 'r');
  try {
    const { size } = await handle.stat();
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = await readAt(handle, size - tailLength, tailLength);
    let eocd = -1;
    for (let index = tail.length - 22; index >= 0; index--) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocd = index;
        break;
      }
    }
    if (eocd < 0) throw new Error('Arquivo .zip inválido.');
    const count = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || directoryOffset === 0xffffffff) throw new Error('Arquivos .zip no formato ZIP64 não são suportados.');
    if (count > MAX_ZIP_ENTRIES) throw new Error('O .zip tem arquivos demais.');

    const directory = await readAt(handle, directoryOffset, directorySize);
    const entries = [];
    let offset = 0;
    for (let index = 0; index < count && offset + 46 <= directory.length; index++) {
      if (directory.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
      const flags = directory.readUInt16LE(offset + 8);
      const method = directory.readUInt16LE(offset + 10);
      const time = directory.readUInt16LE(offset + 12);
      const date = directory.readUInt16LE(offset + 14);
      const compressedSize = directory.readUInt32LE(offset + 20);
      const uncompressedSize = directory.readUInt32LE(offset + 24);
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const commentLength = directory.readUInt16LE(offset + 32);
      const localOffset = directory.readUInt32LE(offset + 42);
      const rawName = directory.subarray(offset + 46, offset + 46 + nameLength);
      // Bit 11: UTF-8 name; older tools write the DOS code page, read here as latin1.
      const name = rawName.toString(flags & 0x800 ? 'utf8' : 'latin1');
      offset += 46 + nameLength + extraLength + commentLength;
      const encrypted = (flags & 0x1) !== 0;
      if (name.endsWith('/') || encrypted || (method !== 0 && method !== 8)) continue;
      entries.push({ name, method, compressedSize, uncompressedSize, localOffset, lastModified: dosDateTimeToMs(date, time) });
    }
    return entries;
  } finally {
    await handle.close();
  }
}

/** Decompresses one file of the zip in memory. */
async function readZipEntry(zipPath, innerName) {
  const entry = (await listZipEntries(zipPath)).find((item) => item.name === innerName);
  if (!entry) throw new Error(`Arquivo não encontrado no .zip: ${innerName}`);
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`Arquivo grande demais dentro do .zip: ${innerName}`);
  const handle = await fs.promises.open(zipPath, 'r');
  try {
    const header = await readAt(handle, entry.localOffset, 30);
    if (header.length < 30 || header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error('Arquivo .zip corrompido.');
    const dataStart = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const data = await readAt(handle, dataStart, entry.compressedSize);
    if (entry.method === 0) return data;
    return await inflateRaw(data, { maxOutputLength: Math.max(entry.uncompressedSize, 1) });
  } finally {
    await handle.close();
  }
}

module.exports = { ZIP_SEPARATOR, isZipFileName, joinZipPath, splitZipPath, listZipEntries, readZipEntry };
