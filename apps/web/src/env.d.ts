interface ImportMetaEnv {
  /** Base de la API (p. ej. `/api`). Vacía: la app funciona sin servidor ni login (D-14). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Textos que se importan tal cual (instrucciones del asistente en Markdown). */
declare module '*.md?raw' {
  const text: string;
  export default text;
}
