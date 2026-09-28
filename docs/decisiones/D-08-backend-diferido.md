# D-08 Backend, usuarios y roles diferidos

**Estado:** aceptada (2026-09-28)

**Contexto.** La guía pide usuarios con rol (diseñador, revisor, administrador), comentarios, auditoría e historial (G8, R-25, NF-07). Todo eso necesita un servidor, y las reglas del proyecto prohíben el backend por ahora.

**Opciones.**

- (a) Diferir.
- (b) Modo revisor local, sin seguridad real.
- (c) Backend ahora.

**Decisión.** (a).

- G8 queda solo como idiomas (R-26).
- Usuarios, roles, comentarios, auditoría e historial en servidor pasan a la fase con backend, junto con F5 (Distribución).

**Consecuencias.**

- H-801 y el caso de uso UC-09 no se cumplen en la Fase 1.
- NF-07 queda abierto.
- El modelo no agrega campos de usuario hasta entonces.
