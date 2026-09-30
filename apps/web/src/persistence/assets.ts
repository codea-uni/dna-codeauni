/**
 * Assets de topografía en el navegador (D-16): binarios `CRTS` por hash SHA-256, en una base
 * IndexedDB aparte del autoguardado. Son inmutables: un hash siempre tiene el mismo contenido.
 */
const DB_NAME = 'cronos-assets';
const STORE = 'assets';

let db: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => {
      resolve(r.result);
    };
    r.onerror = () => {
      reject(r.error ?? new Error('IndexedDB'));
    };
  });
  return db;
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => {
      resolve(r.result);
    };
    r.onerror = () => {
      reject(r.error ?? new Error('IndexedDB'));
    };
  });
}

export async function putAsset(hash: string, bytes: Uint8Array): Promise<void> {
  const store = (await openDb()).transaction(STORE, 'readwrite').objectStore(STORE);
  await request(store.put(bytes, hash));
}

export async function getAsset(hash: string): Promise<Uint8Array | undefined> {
  const store = (await openDb()).transaction(STORE, 'readonly').objectStore(STORE);
  const value = (await request(store.get(hash))) as unknown;
  return value instanceof Uint8Array ? value : undefined;
}
