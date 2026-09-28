# Cronos — Paquete para desarrollo

Software web de diseño y simulación de voladuras. Este paquete contiene todo lo necesario para empezar la Fase 1 (superficie) y avanzar hito a hito.

## Qué hay

| Archivo | Contenido |
|---|---|
| **01 - Guia del desarrollador.md** | **Empieza aquí.** Qué se construye, alcance, requisitos, arquitectura y decisiones, hitos con criterio de salida, backlog con criterios de aceptación, reglas de trabajo, decisiones por defecto y ejercicio inicial |
| 02 - Especificacion de calculo.md | Fórmulas, unidades, convenciones y verificaciones de la Fase 1 |
| 03 - Modelo de datos e importacion.md | Entidades, catálogos, formatos, trampas de importación y ejemplo de proyecto |
| 04 - Casos de referencia.md | Ejemplos con valores esperados (base de las pruebas) |
| 05 - Reglas mineras y su verificacion.md | Estado y fuentes de cada regla de dominio |
| Referencia/ | Material de consulta: primer de dominio para no mineros (glosario, fichas, ejemplos), benchmark de I-Blast y de JKSimBlast, y voladura subterránea |

## Primeros pasos

1. Lee `01` completo (sección 2 explica el orden de lectura y el primer tramo).
2. Resuelve a mano y con código el caso CR-01 de `04`.
3. Haz las pruebas técnicas S1–S3 (`01`, sección 7.4) y propón el stack con una nota de decisión.
4. Crea el repositorio con la estructura de `01`, sección 14.

## Datos que se entregan aparte

- El archivo CSV de la malla real de CR-04 (180 taladros). Hasta que llegue, usa un archivo sintético con la misma estructura (`04`, CR-04).
- Los registros completos de vibración de CR-06.

## Cómo preguntar

Escribe las dudas de dominio en `docs/preguntas.md` (del repositorio) y avanza con el valor por defecto de `01`, sección 17. Las respuestas se dan en bloque.
