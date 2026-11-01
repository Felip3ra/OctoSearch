import { Dispatch, SetStateAction, useEffect, useState } from 'react';

export interface PersistedStateCodec<T> {
  /** Turns the stored string back into a value; return undefined to fall back to the default. */
  parse: (raw: string) => T | undefined;
  serialize: (value: T) => string;
}

export const booleanCodec: PersistedStateCodec<boolean> = {
  parse: (raw) => raw === 'true',
  serialize: String,
};

export function enumCodec<T extends string>(allowed: readonly T[]): PersistedStateCodec<T> {
  return {
    parse: (raw) => (allowed.includes(raw as T) ? (raw as T) : undefined),
    serialize: (value) => value,
  };
}

export function readPersisted<T>(key: string, fallback: T, codec: PersistedStateCodec<T>): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return codec.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

/** useState backed by localStorage; preferences keep working for the session when storage is unavailable. */
export function usePersistedState<T>(
  key: string,
  fallback: T | (() => T),
  codec: PersistedStateCodec<T>
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    readPersisted(key, typeof fallback === 'function' ? (fallback as () => T)() : fallback, codec)
  );

  useEffect(() => {
    try {
      localStorage.setItem(key, codec.serialize(value));
    } catch {
      // Keep the preference active for the current session.
    }
  }, [key, value, codec]);

  return [value, setValue];
}
