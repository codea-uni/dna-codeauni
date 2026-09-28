# Cierre de la Fase 1 (G9)

Reporte de hito según la guía (`docs/theory/01 §8.2` y `§10`), medido el 2026-09-28 sobre el código de `main`. Semáforo: **amarillo**. El código de G0–G8 está completo y verificado. Faltan tres mediciones que tienen que hacer personas: la aprobación de comprensión (I1), la tarea de punta a punta con un ingeniero (I6) y los datos de CR-04 (P-15).

## 1. Hitos

| Hito                    | Estado    | Casos de referencia                                     | Pendiente                                           |
| ----------------------- | --------- | ------------------------------------------------------- | --------------------------------------------------- |
| G0 Comprensión y base   | ✅ código | —                                                       | Respuesta 3 de `docs/comprension.md` (CR-01 a mano) |
| G1 Modelo y unidades    | ✅        | Migraciones v1→v5 con test                              | —                                                   |
| G2 Importación          | ✅        | CR-04 sintético (180 taladros, trampas de `03 §5`)      | Reproyección entre CRS; CSV real de CR-04           |
| G3 Malla                | ✅        | CR-01 pasos 1–7 y 10, CR-02 fila 12, CR-03 (B, L, V)    | —                                                   |
| G4 Explosivos y carga   | ✅        | CR-01 pasos 8–12, CR-02 filas 1–14 y 3 variantes, CR-03 | CR-04 a mano: fichas de HA73/HA64 (P-15)            |
| G5 Amarre y tiempos     | ✅        | CR-05 amarres 1–5 (tiempos, MIC, burden efectivo)       | Confirmar P-16                                      |
| G6 MIC y PPV            | ✅        | CR-06 (ejemplo a mano) e inversa                        | Registros reales de CR-06 (F4)                      |
| G7 Reporte y escenarios | ✅        | Comparación de escenarios; 60 pasos de deshacer         | Reporte de CR-04 (P-15)                             |
| G8 Idiomas              | ✅        | Todos los avisos del núcleo traducidos (test)           | —                                                   |

## 2. Indicadores (guía `§10`)

| Indicador                     | Meta                                                            | Medido                                                                                                                                                                                           | Estado         |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **I1 Comprensión**            | 6 en G0 y 2 por hito, 100 % aprobadas                           | G0: 5/6 aprobadas (falta la 3). Por hito: 16 preguntas preparadas en `docs/comprension.md`, sin responder                                                                                        | 🟡             |
| **I2 Trazabilidad**           | 100 % de los requisitos con fuente → caso → prueba → pantalla   | 19/26 requisitos completos (✅), 7 parciales (🟡) y R-25 diferido (D-08). Detalle en `docs/PLAN.md §3`                                                                                           | 🟡             |
| **I3 Verificación numérica**  | 100 % de los CR aplicables dentro de tolerancia                 | CR-01, CR-02, CR-03, CR-05 y CR-06: 5/5 completos. CR-04: importación y conteo; carga y reporte esperan P-15. CR-07: fase F2                                                                     | 🟡 (por datos) |
| **I4 Calidad automática**     | Pruebas en verde; fórmulas con prueba externa; cobertura ≥ 85 % | 217 pruebas + 6 de rendimiento en verde; núcleo con 95,4 % de líneas (73,9 % de ramas); 24 de 32 fórmulas en R3; CI en cada push                                                                 | ✅             |
| **I5 Rigor de fuentes**       | 0 reglas sin cita y 0 preguntas críticas abiertas               | Constantes sin ficha: 8 (CT-01 a CT-08), todas registradas, como parámetro editable o avisadas en el informe PDF. Preguntas críticas abiertas: 0 (P-15 es un dato pendiente; P-16 no es crítica) | 🟡             |
| **I6 Tarea de punta a punta** | Línea base: un ingeniero reproduce CR-04 sin ayuda              | No medido: necesita al ingeniero y los datos de CR-04 (protocolo abajo)                                                                                                                          | ⏳             |
| **I7 Paridad con referencia** | Informativo, ±2 % frente a JKSimBlast o I-Blast                 | Sin demo del programa de referencia                                                                                                                                                              | —              |

**Fórmulas que siguen por debajo de R3**, todas de la fase F2 o sin caso de referencia:

- FC-20 VOD(D): R1.
- FC-26 Kuz-Ram: R0, regresión hasta tener CR-07.
- FC-27 Swebrec: R1.
- FC-28 Holmberg–Persson: R1.
- FC-29 Lundborg: R1.
- FC-30 Sobrepresión: R0.
- FC-31 Precorte: R1.
- FC-32 Buffer: R1.

**Requisitos parciales:**

- R-01 y R-27: falta reproyectar entre CRS; hoy solo se avisa.
- R-03: la topografía solo entra por DXF.
- R-06: falta el caso real de CR-04.
- R-10 y R-11: faltan fichas reales de proveedor y la mecha de seguridad.
- R-22: falta el reporte de CR-04.

## 3. Reportes por hito (plantilla `§8.2`)

```
Hito: G0 · Reglas: FC-21, FC-23 (R2 → R3) · CR: CR-05 amarres 1–4 (0 ms de diferencia; MIC 100/200/200/100 kg)
Indicadores: I1 5/6 · I4 CI y cobertura · Preguntas: P-01…P-13 respondidas · No verificado: comprensión 3

Hito: G1 · Reglas: RM-02, RM-04, RM-18, RM-21 (modelo) · CR: ida y vuelta JSON y migraciones con test
Preguntas: P-09 respondida · No verificado: probar el autoguardado a mano en un navegador

Hito: G2 · Reglas: trampas de 03 §5 · CR: CR-04 sintético (180 taladros, 0 avisos) y cada trampa con test
Preguntas: P-13 respondida · No verificado: CSV real de CR-04; formatos de la operación (IREDES a F4)

Hito: G3 · Reglas: FC-01…FC-09, CK-01…CK-06 (→ R3 donde hay CR) · CR: CR-01 1–7 y 10, CR-02 12, CR-03
Preguntas: P-03, P-05, P-06 respondidas · No verificado: —

Hito: G4 · Reglas: FC-10…FC-19, CK-07…CK-09, RM-01, RM-05, RM-08 · CR: CR-01 8–12, CR-02 1–14 + 3 variantes, CR-03
Preguntas: P-01, P-04, P-14, P-15 respondidas · No verificado: CR-04 (faltan las fichas de HA73/HA64)

Hito: G5 · Reglas: FC-22 (→ R3), CK-10, DF-08, DF-19, DF-21 · CR: CR-05 amarres 1–5
Preguntas: P-02, P-11 respondidas; P-16 abierta (no crítica) · No verificado: —

Hito: G6 · Reglas: FC-24, FC-25 (→ R3), RM-21, DF-13, DF-14 · CR: CR-06 (9,4462 y 4,9375 mm/s, ±1 %)
Preguntas: P-07, P-10, P-12 respondidas · No verificado: ajuste de K y β con registros reales (F4)

Hito: G7 · Reglas: — · CR: comparación de escenarios y 60 pasos de deshacer con test
No verificado: reporte de CR-04

Hito: G8 · Reglas: — · CR: todos los avisos del núcleo con traducción (test)
No verificado: revisión de la terminología inglesa por el ingeniero
```

## 4. Protocolo de la tarea de punta a punta (I6)

Un ingeniero que no participó en el desarrollo reproduce CR-04 sin ayuda. Se registran el éxito (sí/no), los bloqueos, los errores y el tiempo. La primera medición es la **línea base**, sin meta. El flujo es el de la guía, `§4`:

| #   | Paso                                                                                                       | Dónde en Cronos                                         | Tiempo | Bloqueo / error |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------ | --------------- |
| 1   | Crear el proyecto y declarar el CRS (EPSG)                                                                 | Archivo → Proyecto nuevo; Ajustes del proyecto          |        |                 |
| 2   | Importar los 180 taladros (y el polígono)                                                                  | Importar → Taladros desde CSV (vista previa en el mapa) |        |                 |
| 3   | Definir la cara libre                                                                                      | Herramienta C sobre el perímetro                        |        |                 |
| 4   | Ajustar la malla y los grupos (A, B, C, BF)                                                                | Diseño → Grupos (o «grupo por prefijo» al importar)     |        |                 |
| 5   | Cargar por tramos con productos del catálogo (producción, fila A con dos decks, buffer con cámara de aire) | Carguío → regla por grupo; editor de columna            |        |                 |
| 6   | Amarre y retardos (electrónicos)                                                                           | Tiempos → Electrónicos                                  |        |                 |
| 7   | Simular y revisar isotiempos                                                                               | Vista → secuencia e isócronas                           |        |                 |
| 8   | MIC y PPV en los puntos de monitoreo                                                                       | Vibración                                               |        |                 |
| 9   | Guardar escenario, duplicar y variar retardos                                                              | Escenarios                                              |        |                 |
| 10  | Comparar                                                                                                   | Escenarios → Comparar                                   |        |                 |
| 11  | Generar el reporte                                                                                         | Exportar → Informe PDF                                  |        |                 |

**Requisitos previos:** el CSV real de CR-04 y las fichas de HA73 y HA64 del proveedor (P-15), registradas con su densidad en taladro.

## 5. Para la Evaluación 1 y la fase F2

- **Datos del ingeniero:** CSV real de CR-04, fichas de HA73/HA64, registros de CR-06 con su carga por retardo y un ejemplo publicado de Kuz-Ram (CR-07).
- **Confirmar P-16:** alivio solo desde los taladros de adelante y umbral ≥ 2·B.
- **F2 (orden sugerido):**
  1. Validar lo que ya existe con fuente y caso: Kuz-Ram (CR-07), Swebrec, Holmberg–Persson con el criterio de daño ¼·VPPc, sobrepresión y Lundborg.
  2. Precorte y buffer (CR-01).
  3. Desplazamiento del material (buscar la fuente primero, RM-20).
- **Pendientes técnicos:**
  - reproyección entre CRS (proj4, con nota de decisión);
  - topografía por GeoJSON/LandXML;
  - reglas y escala del mapa en ft;
  - IREDES (F4).
