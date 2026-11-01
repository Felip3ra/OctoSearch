export type LogEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export const ENCODING_LABELS: Record<LogEncoding, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'windows-1252': 'Windows-1252',
};

const SAMPLE_BYTES = 4096;

/**
 * Detects how a log file was written. .NET writers on Windows commonly produce UTF-8 (with or
 * without BOM), UTF-16 ("Unicode" in .NET) or the legacy ANSI code page (Windows-1252).
 */
export function detectEncoding(bytes: Uint8Array): { encoding: LogEncoding; bomLength: number } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: 'utf-8', bomLength: 3 };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: 'utf-16le', bomLength: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: 'utf-16be', bomLength: 2 };

  // UTF-16 without BOM: ASCII text leaves every other byte as zero.
  const sampleLength = Math.min(bytes.length, SAMPLE_BYTES);
  if (sampleLength >= 4) {
    let evenZeros = 0;
    let oddZeros = 0;
    for (let index = 0; index < sampleLength; index++) {
      if (bytes[index] === 0) {
        if (index % 2 === 0) evenZeros++;
        else oddZeros++;
      }
    }
    const half = sampleLength / 2;
    if (oddZeros > half * 0.4 && evenZeros < half * 0.05) return { encoding: 'utf-16le', bomLength: 0 };
    if (evenZeros > half * 0.4 && oddZeros < half * 0.05) return { encoding: 'utf-16be', bomLength: 0 };
  }

  try {
    // Streaming mode tolerates a multi-byte character cut at the end of the read.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    return { encoding: 'utf-8', bomLength: 0 };
  } catch {
    return { encoding: 'windows-1252', bomLength: 0 };
  }
}

/** Index right after the first line break, used to drop the partial line of a read that starts mid-file. */
export function skipPartialFirstLine(bytes: Uint8Array, encoding: LogEncoding): Uint8Array {
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const lowFirst = encoding === 'utf-16le';
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      const isLineBreak = lowFirst
        ? bytes[index] === 0x0a && bytes[index + 1] === 0
        : bytes[index] === 0 && bytes[index + 1] === 0x0a;
      if (isLineBreak) return bytes.subarray(index + 2);
    }
    return bytes.subarray(bytes.length);
  }
  const lineBreak = bytes.indexOf(0x0a);
  return lineBreak === -1 ? bytes.subarray(bytes.length) : bytes.subarray(lineBreak + 1);
}

export function isGzipFileName(fileName: string): boolean {
  return /\.gz$/i.test(fileName);
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
