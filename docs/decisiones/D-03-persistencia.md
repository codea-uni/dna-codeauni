# D-03 Cómo se guardan los datos

**Estado:** aceptada (2026-09-28) · Guía `01 §7.3`

**Contexto.** La guía sugiere una base relacional con soporte espacial, que exige un servidor. El producto hoy es 100 % cliente (D-02, D-08).

**Decisión.**

- El proyecto se guarda como JSON versionado (D-05), que se exporta e importa.
- En el navegador: IndexedDB para el índice de proyectos, el JSON y las últimas N versiones (autoguardado, H-102, hito G1); OPFS para binarios grandes (topografía), si hace falta.

**Consecuencias.**

- Funciona sin conexión.
- No hay colaboración multiusuario hasta que haya backend.
- Autoguardado hecho en G1 (`apps/web/src/persistence/`): metadatos y JSON en dos stores de IndexedDB, una versión por minuto como máximo, 20 por proyecto; se recupera la última al abrir.
