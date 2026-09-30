# Pila de material (A7): desplazamiento y formación del muckpile

Módulo del núcleo que calcula cómo se mueve, se proyecta y se acumula la roca volada. Es **puro y determinista**: sin DOM y sin azar, corre en Node, en el worker y en los tests. Reglas en `docs/RULES.md` (FC-39…FC-45, RM-20), supuestos en `docs/QUESTIONS.md` (S-19…S-24) y decisión en `docs/DECISIONS.md` (D-17).

> **Es un modelo empírico.** Sus constantes se calibran por sitio con levantamientos de la pila y **no reemplaza** un modelo numérico (DEM, elementos discretos). La física del nivel 2 es solo visualización: los indicadores salen del modelo cinemático.

## Dos niveles

| Nivel                | Qué hace                                                                                                                         | Dónde                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Modelo cinemático | Bloques, salida por la secuencia, tiro parabólico, depósito esponjado y relajación al reposo. Da la pila y sus números           | `core/src/muckpile/` (este módulo), en el worker de cómputo                             |
| 2. Animación         | Modo **rápido**: el engine interpola las trayectorias del nivel 1. Modo **física**: Rapier (WASM) choca y hace rodar los bloques | `engine/src/layers/BlocksLayer.ts`; `workers/src/physics/physicsApi.ts` (worker aparte) |

## Archivos

| Archivo        | Contenido                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `types.ts`     | `MuckpileResult`: bloques (arreglos planos), grillas, vectores por taladro, indicadores y avisos     |
| `simulate.ts`  | `muckpileInput` (carga, tiempos, burden efectivo, Zhang), `simulateMuckpile` y `computeMuckpile`     |
| `velocity.ts`  | Estrategias intercambiables de velocidad, atenuaciones y ángulo de lanzamiento                       |
| `heightmap.ts` | Grilla de alturas: depósito bilineal y relajación por avalancha que conserva el volumen              |
| `profile.ts`   | Perfil en una sección cualquiera (`sampleProfile`) y grilla → superficie (`gridSurface`)             |
| `export.ts`    | Superficie a XYZ, OBJ y STL binario (relativo al origen del proyecto); vectores por bloque a CSV     |
| `compare.ts`   | Comparación con un levantamiento (mapa de error, RMSE) y calibración de k y n por búsqueda en grilla |

## Algoritmo del nivel 1 (`simulateMuckpile`)

1. **Discretización (S-19).** Cada perímetro de la voladura **con taladros cargados** se cubre con una retícula de lado `blockSize`. Cada celda se recorta con el polígono (área exacta en el borde) y su columna, del piso (del perímetro o del banco) al techo (topografía del banco o banco plano), se parte en capas de alto ≈ `blockSize`. Así el volumen in situ es exactamente área × alto.
2. **Voronoi a la cota del bloque.** Cada bloque se asigna al taladro cargado cuyo eje (inclinado o no) queda más cerca en planta **a la cota del bloque** (candidatos: los 6 collares más cercanos, `PointIndex.neighbors`).
3. **Salida.** El bloque sale en el tiempo de detonación de su taladro (`computeTiming`), en la dirección en planta hacia la **superficie libre de ese instante** (`effectiveBurden.toward`, FC-22: la cara libre original o el frente que dejaron los taladros que ya detonaron). Por eso el amarre decide hacia dónde se mueve la masa (RM-20).
4. **Velocidad inicial por taladro** (estrategia intercambiable, `VelocityStrategy`):
   - `zhang` (defecto, FC-36, R3): v_B = √[π·c_B·ρ_e·e_e·c_e/(2·ρ_r·tan θ)]·(d/B_ef), la misma de A5.
   - `scaledBurden` (FC-40, R0): v₀ = k·(Q^⅓/B_ef)^n, con Q en kg por taladro. k y n se calibran.
   - `richardsMoore` (FC-45, R1): V₀ = k·(√m/B_ef)^1,3 con m en kg/m; k = 13,5 en roca competente blanda y 27 en dura (Richards & Moore 2004). Es una calibración de proyecciones, así que da un caso peor (S-24).
   - Las filas posteriores se reducen con v·k^(fila−1), con el `rowFactor` de FC-37.
5. **Cara libre (FC-46, A7b):** cada perímetro tiene su cara (ángulo β y alto, propios o del banco).
   - La roca bajo el talud, delante de la cresta hasta el pie, entra en la pila. Se integra con submuestras: ½·h²·cot β por metro de cara.
   - Si la cara gobierna el burden de un taladro, el burden de cada bloque crece hacia el pie: B(z) = B_ef + min(h, z_boca − z)·cot β, corregido por la inclinación del eje. La velocidad se lleva a ese burden (v ∝ B⁻¹ en Zhang, B⁻ⁿ en las leyes de potencia).
   - Con `launchFromFace`, el ángulo medio de lanzamiento es 90° − β.
6. **Por bloque (FC-43, S-21):** la velocidad se multiplica por `stemmingFactor` sobre el tope de la carga, por `floorFactor` en la capa del piso y por exp(−λ·r/B), con r la distancia al eje. El ángulo de lanzamiento va de `launchAngleFloor` (pie) a `launchAngleCrest` (cresta), lineal con la altura relativa; con `launchFromFace` esa diferencia se centra en 90° − β.
7. **Grilla de la pila.** Se dimensiona con el alcance estimado de cada bloque más el talud de reposo. El terreno fijo es el piso dentro del perímetro y, fuera, la topografía, prolongando su borde más allá del levantamiento; sin topografía se usa la regla de S-20: piso del lado de la cara libre y techo del banco del otro lado. Un perímetro sin taladros cargados (p. ej. la próxima voladura) es terreno intacto.
8. **Vuelo e impacto.** Los bloques se procesan en orden de llegada estimada. Cada trayectoria parabólica (g = 9,80665) se sigue en pasos de ≤ ½ celda hasta cortar la superficie **actual** mientras baja, y el punto se refina por bisección.
9. **Depósito (FC-41, FC-42).** Se agrega V·esponjamiento con pesos bilineales en las 4 celdas vecinas (la suma de los pesos es 1). Luego viene la avalancha: mientras una celda con material suelto supere el desnivel de reposo tan φ·d hacia un vecino (8 vecinos), le pasa la mitad del exceso, sin tocar el terreno fijo. La cola FIFO lo hace determinista y el volumen se conserva exactamente. Se relaja por lotes de 16 bloques (y al final): el resultado en reposo es el mismo y la avalancha no se repite por cada bloque. Al bajar una celda solo se revisan sus vecinas más altas.
10. **Posición final (S-23).** Los bloques se apilan en orden de llegada en la columna libre más cercana a su impacto, hasta llenar la pila relajada: lo primero en caer queda abajo. Esta posición es la que da los vectores y los atributos de la pila.
11. **Atributos transportados.**
    - **Tamaño de fragmento (FC-44, S-22):** la curva de Kuz-Ram de cada taladro, con su carga y su factor de carga, se reparte entre sus bloques por cuantiles, de lo más cercano a la columna explosiva (fino) a lo más lejano (grueso, zona del taco).
    - **Dominio:** cada bloque toma el dominio de material o ley que contiene su centro (`Blast.domains`).
    - Por celda se guardan el desplazamiento medio, el tamaño medio, el dominio dominante y su pureza (dilución).

## Salidas

- **Superficies:** `grids.base` (terreno fijo), `grids.before` (techo in situ) y `grids.after` (pila).
- **Bloques:** origen, impacto, destino, velocidad, tiempos de salida e impacto, taladro, volumen, tamaño y dominio.
- **Vectores por taladro:** centroide in situ → centroide en la pila.
- **Indicadores (`stats`):**
  - throw: distancia máxima de la cara libre al pie de la pila, con espesor ≥ 0,1 m;
  - desplazamiento horizontal medio y máximo;
  - drop: bajada de la superficie dentro del perímetro, media y máxima;
  - esponjamiento lateral;
  - altura máxima de la pila;
  - volumen in situ frente al de la pila, con el error de conservación;
  - `maxReposeExcess`, para el control de calidad.
- **Clases de tamaño:** fracción del volumen por clase (cortes por defecto 0,1…1,5 m).
- **Perfil (`sampleProfile`):** cotas antes, después y del terreno, throw y drop en la sección.

## Pruebas (`*.test.ts`)

Los valores esperados **no salen de la misma fórmula** (regla de dominio 2):

- Volumen in situ = área × alto (40 × 14 × 10 = 5600 m³) y pila = in situ × esponjamiento (±2 %).
- Ninguna pendiente supera el ángulo de reposo. Un cono de volumen V queda con alto (3·V·tan²φ/π)^⅓ (±15 %).
- Cambiar la secuencia (salida desde el Oeste o desde el Este) invierte el sentido lateral del desplazamiento.
- Zhang como estrategia es idéntica a A5. Las leyes de potencia valen k cuando la carga escalada iguala al burden.
- El taco da fragmentos más gruesos que la columna. Los dominios se transportan con el volumen correcto, a la resolución del bloque.
- Calibración: recupera k = 14 y n = 1,2 ocultos en una superficie sintética.
- Física (worker): los bloques quedan apoyados en el piso y la pila avanza hacia la cara libre.
- Rendimiento (`performance.perf.test.ts`): ≈ 500 taladros de 229 mm en un banco de 15 m con bloques de 1,5 m, en < 1 s.

El ejemplo **«Pila de material»** es demostración y regresión, **no un CR**: banco de 10 m, malla 4 × 5 m, 3 filas × 8 taladros, 25 ms entre taladros y 67 ms entre filas. Tiene un escenario «Salida desde el Este».

## Limitaciones conocidas

- No hay interacción entre bloques en vuelo, ni empuje del material que todavía no salió: todo el volumen in situ se moviliza y la roca de atrás no frena a la de adelante. El confinamiento solo entra por el burden efectivo y la reducción por fila.
- El impacto no rebota ni rueda en el nivel 1: rodar lo resuelve la relajación al reposo. El modo física lo muestra, pero no alimenta los indicadores.
- La posición final de un bloque es una asignación que llena la pila (S-23), no una trayectoria seguida después del impacto.
- Los taladros con B_ef/Ø < 7 quedan fuera de la validez de Zhang y hoy no vuelan (P-23 abierta; ver `docs/MUCKPILE-REPORT.md`).
- Los límites de los dominios se resuelven al tamaño del bloque.
- k, n y las atenuaciones son parámetros de calibración: sin levantamientos del sitio, la pila es una estimación.
- La sección y los mapas son de la grilla de la pila: su resolución es `blockSize`.
