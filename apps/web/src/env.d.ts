interface ImportMetaEnv {
  /** Base de la API (p. ej. `/api`). Vacía: la app funciona sin servidor ni login (D-14). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
