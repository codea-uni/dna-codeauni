# Registro de reglas mineras

Registro vivo de cada regla, fórmula, rango o constante de dominio, con su **estado** (guía `docs/theory/01 §9`). Parte de `docs/theory/05` y de `02`. Se actualiza en cada hito (paso 1 del ciclo, `docs/PLAN.md §5`).

| Estado                     | Significa                                          | Evidencia                          |
| -------------------------- | -------------------------------------------------- | ---------------------------------- |
| R0 Hipótesis               | Alguien la dijo o la leyó                          | Ninguna                            |
| R1 Con fuente              | Está en un libro, paper, manual o ficha            | Cita concreta                      |
| R2 Verificada con ejemplo  | Se resolvió a mano un caso con esa fuente          | Caso de referencia (CR)            |
| R3 Implementada con prueba | El código reproduce el ejemplo                     | Test con el valor **de la fuente** |
| R4 Validada                | El ingeniero de minas la ve funcionando y confirma | Demo y visto bueno escrito         |

**Consecuencias:**

- Solo una regla en R3 o más puede **bloquear** al usuario; por debajo es, a lo sumo, una advertencia configurable.
- Una constante en R0 no entra al código como valor fijo: queda como parámetro.
- Si una fuente contradice una regla, gana la fuente y se anota en `docs/preguntas.md`.

**Criterio de este registro:**

- Una fórmula llega a R3 solo cuando su test usa el valor de un CR o de la fuente. Hoy solo FC-21 y FC-23 (CR-05); el resto de los tests usa valores calculados a mano.
- La columna «Código» dice qué hay hoy: ✔ implementado, ◐ parcial o distinto, ✖ falta.

## 1. Reglas de dominio (RM, de `05`)

Marcas de `05`: ✔ con fuente externa · ◐ con matiz · ○ solo curso · ? por validar · ⚙ decisión de producto.

| ID    | Regla                                                                | `05` | Estado     | Código                                  | Qué implica                                                              |
| ----- | -------------------------------------------------------------------- | ---- | ---------- | --------------------------------------- | ------------------------------------------------------------------------ |
| RM-01 | Taco: material inerte; sin agua en superficie                        | ◐    | R1         | ◐ `WaterDeck` se ofrece en `DeckEditor` | Quitar «agua» de la UI de superficie (G4)                                |
| RM-02 | El agua exige explosivo resistente                                   | ✔    | R1         | ◐ `Explosive.waterResistant` booleano   | Niveles de resistencia y estado de agua del taladro (G1, P-09)           |
| RM-03 | El taco confina; sin él hay proyección                               | ✔    | R1         | ◐ solo taco < 0,7·B                     | Advertencia por SDOB (G4)                                                |
| RM-04 | Taco anguloso, 6–14 mm en Ø 50–130 mm                                | ✔    | R1         | ✖                                       | Angularidad y granulometría en el catálogo de taco, como sugerencia (G1) |
| RM-05 | Detonador → booster → granel; varios decks y boosters                | ○    | R0         | ◐ `InHoleInitiator`                     | Editor de la cadena y aviso de granel sin booster (G4); buscar fuente    |
| RM-06 | Mínimo 2 caras libres                                                | ◐    | R1         | ✖                                       | Cara libre obligatoria; «2» solo como advertencia (G3, P-03)             |
| RM-07 | Burden desde la cara libre; burden efectivo según secuencia          | ✔    | R1         | ✖                                       | Se calcula, no se digita (G5)                                            |
| RM-08 | SDOB (raíz cúbica) ≠ distancia escalada de vibración (raíz cuadrada) | ◐    | R1         | ◐ solo existe la de vibración           | Dos modelos, dos nombres (G4, G6)                                        |
| RM-09 | Holmberg–Persson para daño en campo cercano                          | ✔    | R1         | ✔ `energy/energy.ts`                    | Criterio de daño ¼·VPPc (F2)                                             |
| RM-10 | Kuz-Ram con potencia, factor de carga y factor de roca               | ✔    | R1         | ✔ `fragmentation/fragmentation.ts`      | Variantes por decidir (P-08)                                             |
| RM-11 | Corrección de finos JKMRC                                            | ✔◐   | R1         | ✖ (hay Swebrec)                         | Solo literatura abierta (F2)                                             |
| RM-12 | Método sueco para frentes                                            | ✔    | R1         | ✖                                       | F3                                                                       |
| RM-13 | Arranque con alivio vacío                                            | ◐    | R1         | ✖                                       | F3: validar Ø alivio > Ø carga                                           |
| RM-14 | Subterráneo: encartuchado y también granel                           | ◐    | R1         | ✖                                       | F3                                                                       |
| RM-15 | Mecha de seguridad: velocidad por producto                           | ◐    | R1         | ✖                                       | Dato de catálogo (G1)                                                    |
| RM-16 | Sobreperforación 0 a > 1,5 m                                         | ?    | R0         | ◐ 1,5 m fijo en `model/factories.ts`    | Parámetro, con defecto J = 0,3·B (G3)                                    |
| RM-17 | Verticales o inclinados; burden en collar ≠ fondo                    | ○    | R0         | ✔ azimut e inclinación                  | Longitud inclinada (P-05)                                                |
| RM-18 | Precorte, buffer, producción                                         | ○    | R0         | ✖                                       | `HoleGroup` (G1, G3)                                                     |
| RM-19 | P80 objetivo por operación                                           | ⚙    | —          | ✖                                       | Parámetro de la operación                                                |
| RM-20 | El amarre decide el desplazamiento                                   | ?    | R0         | ✖                                       | F2, buscar fuente antes                                                  |
| RM-21 | Daño según PPV y frecuencia; límites en tabla                        | ○    | R0         | ✖                                       | Tabla configurable con fuente (G6)                                       |
| RM-22 | DXF es de código abierto                                             | ◐    | R1 (falso) | ✔ DXF de entrada y salida               | Validar formatos con la mina (P-13)                                      |
| RM-23 | JKSimBlast matemático, I-Blast físico                                | ◐    | R1         | —                                       | No repetir marketing                                                     |

## 2. Fórmulas de cálculo (FC, de `02`)

| ID    | Fórmula                                                                 | Estado                                        | Fuente                                                | CR                                     | Código                                                        | Test actual                         |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| FC-01 | L = H + J (vertical); L = H/cos α + J_α (inclinado)                     | R2                                            | `02 §1`, López Jimeno                                 | CR-01, CR-03                           | ◐ `geometry/hole.ts` `lengthToFloor` usa (H + J)/cos α (P-05) | valor propio                        |
| FC-02 | V = B·S·H (/cos α)                                                      | R2                                            | `02 §1`                                               | CR-01..03                              | ◐ Voronoi en `charging/influence.ts` (P-06)                   | valor propio                        |
| FC-03 | t = V·ρ_r                                                               | R2                                            | `02 §1`                                               | CR-02                                  | ✔ `charging/chargeAnalysis.ts`                                | valor propio                        |
| FC-04 | Rigidez H/B, tabla de Konya                                             | R2                                            | `02 §1`, Konya                                        | CR-01, CR-02                           | ✖                                                             | —                                   |
| FC-05 | Tres bolillos equilátera S = 2B/√3                                      | R2                                            | `02 §1`                                               | —                                      | ✖                                                             | —                                   |
| FC-06 | Ash: B[ft] = Kb·Ø[in]/12                                                | R2                                            | `02 §1`, `R1` F03                                     | CR-01 (7,779 m)                        | ✖                                                             | —                                   |
| FC-07 | Konya–Walter: B[ft] = (2ρe/ρr + 1,5)·Ø[in]·Kd·Ks                        | R2                                            | Konya & Walter (1990)                                 | CR-01 (8,194 m)                        | ✖                                                             | —                                   |
| FC-08 | Andersen: B[ft] = √(Ø[in]·L[ft])                                        | R2                                            | `02 §1`                                               | CR-02 (7,32 m)                         | ✖                                                             | —                                   |
| FC-09 | S = (H + 7B)/8 si H/B < 4; 1,4·B si ≥ 4                                 | R1                                            | `02 §1`                                               | CR-01 (8,875 m)                        | ✖                                                             | —                                   |
| FC-10 | DCL = (π/4)·Ø²·ρ                                                        | R2                                            | `02 §2`                                               | CR-02 (84,61 kg/m)                     | ✔ `charging/charge.ts`                                        | valor propio                        |
| FC-11 | Q = Σ m_i                                                               | R2                                            | `02 §2`                                               | CR-01 (699,85), CR-02 (660,34)         | ✔ `holeCharge`                                                | valor propio                        |
| FC-12 | ρ_med = Q/[(L_c + L_esp)·(π/4)·Ø²], por tramo                           | R2                                            | `02 §2`                                               | CR-02 (1,2372 g/cc)                    | ✖                                                             | —                                   |
| FC-13 | Factor de carga Q/V                                                     | R2                                            | `02 §2`                                               | CR-01 (0,6571), CR-02 (0,7007)         | ✔ `powderFactorVolume`                                        | valor propio                        |
| FC-14 | Factor de potencia Q/(V·ρ_r)                                            | R2                                            | `02 §2`                                               | CR-01 (0,2527), CR-02 (0,2605)         | ✔ `powderFactorMass`                                          | valor propio                        |
| FC-15 | Factor de energía Σ m_i·e_i/(V·ρ_r)                                     | R2                                            | `02 §2`                                               | CR-02 (0,791 MJ/t)                     | ✖                                                             | —                                   |
| FC-16 | Rendimiento V/L                                                         | R2                                            | `02 §2`                                               | CR-03 (10,9 m³/m)                      | ✖                                                             | —                                   |
| FC-17 | Cierre de tramos: Σ L_i = L                                             | R3 según `02 §6`                              | `02 §2`                                               | —                                      | ◐ solo detecta Σ > L                                          | `designChecks.test.ts`              |
| FC-18 | SDOB (Chiappetta): SD = (T + L_w/2)/W^(1/3), L_w = 10·Ø                 | R1 (secundaria)                               | `02 §2`                                               | CR-02 (1,459)                          | ✖                                                             | —                                   |
| FC-19 | PD = ρ·VOD²/4 (γ = 3); PB = 0,5·PD                                      | R1                                            | `02 §2`                                               | CR-02 (9,02 y 4,51 GPa)                | ✖                                                             | —                                   |
| FC-20 | VOD(D) = VOD_ideal·(1 − (D_c/D)²)                                       | R1                                            | `02 §2`, `R2` F02                                     | —                                      | ✖                                                             | —                                   |
| FC-21 | t_det = t_llegada (Dijkstra) + retardo de fondo                         | R3                                            | `02 §3`                                               | CR-05                                  | ✔ `timing/timing.ts`                                          | `timing/cr05.test.ts` (amarres 1–4) |
| FC-22 | Burden efectivo: distancia a la superficie libre más cercana al detonar | R0                                            | `02 §3` (hipótesis)                                   | CR-05 (amarres 1, 5)                   | ✖                                                             | —                                   |
| FC-23 | MIC: ventana deslizante semiabierta [t, t + w), w = 8 ms                | R3 (convención del borde por confirmar, P-10) | `02 §4`, USBM RI 8507 (por confirmar)                 | CR-05 (amarres 1–4)                    | ✔ `timing.ts` y `vibration.ts` `chargePerDelay`               | `timing/cr05.test.ts`               |
| FC-24 | PPV = K·(R/√Q)^(−β)                                                     | R1                                            | `02 §4`, Devine/USBM                                  | CR-06 (9,4462 y 4,9375 mm/s)           | ✔ `vibration.ts` `ppvAt`                                      | valor propio                        |
| FC-25 | Q admisible = (R/SD_adm)², con SD_adm = (PPV/K)^(−1/β)                  | R1                                            | inversión de FC-24                                    | —                                      | ✖ (solo existe `distanceForPpv`)                              | —                                   |
| FC-26 | Kuz-Ram: X50 = A·(V/Q)^0,8·Q^(1/6)·(115/RWS)^(19/30); Rosin-Rammler     | R0 (variantes, P-08)                          | Cunningham (1983, 1987, 2005)                         | CR-02 (solo regresión), CR-07          | ✔ `fragmentation.ts` (n de Cunningham 1987)                   | valor propio                        |
| FC-27 | Swebrec / KCO                                                           | R1                                            | Ouchterlony (2005)                                    | —                                      | ✔ `fragmentation.ts`                                          | valor propio                        |
| FC-28 | Holmberg–Persson, campo cercano                                         | R1                                            | Holmberg & Persson (1979)                             | —                                      | ✔ `energy/energy.ts`                                          | solución analítica                  |
| FC-29 | Lundborg: L = 260·d^(2/3)                                               | R1                                            | Lundborg (1981), citado en el código; no está en `02` | —                                      | ✔ `vibration.ts`                                              | valor propio                        |
| FC-30 | Sobrepresión P = k·(R/W^(1/3))^(−β)                                     | R0                                            | `02 §5`: «fuentes por definir»                        | —                                      | ✔ `vibration.ts` `airblastAt`                                 | valor propio                        |
| FC-31 | Precorte: Pb = 110·f^n·ρ·VOD²; E ≤ D·(Pb + RT)/RT                       | R1 (curso)                                    | `02 §5`                                               | CR-01 precorte (46,6 MPa; 1,12–1,13 m) | ✖                                                             | —                                   |
| FC-32 | Buffer: B_buf, S_buf = 1,15·B_buf, DST                                  | R1 (curso)                                    | `04` CR-01                                            | CR-01 buffer (5,9; 6,9; 3,4 m)         | ✖                                                             | —                                   |

## 3. Verificaciones de cordura (CK, de `02 §6`)

Todas son advertencias configurables salvo las que estén en R3.

| ID    | Verificación                                            | Estado | Código                           |
| ----- | ------------------------------------------------------- | ------ | -------------------------------- |
| CK-01 | Rigidez H/B ≤ 2 → atención                              | R2     | ✖                                |
| CK-02 | Taco fuera de 0,7–1,3·B o de 15–25·Ø                    | R1     | ◐ solo < 0,7·B (`shortStemming`) |
| CK-03 | J/B fuera de 0,2–0,5                                    | R0/R1  | ✖                                |
| CK-04 | H/Ø fuera de 50–70                                      | R0     | ✖                                |
| CK-05 | Burden fuera de ±10 % del teórico                       | R1     | ✖                                |
| CK-06 | Sin cara libre / una sola cara libre                    | R1     | ✖                                |
| CK-07 | Cierre de tramos (error)                                | R3     | ◐ solo Σ > L (`overcharged`)     |
| CK-08 | SDOB fuera de rango                                     | R1     | ✖                                |
| CK-09 | Ø < diámetro crítico                                    | R1     | ✖                                |
| CK-10 | Orden de detonación invertido respecto de la cara libre | R0     | ✖                                |

Chequeos propios de BlastLab, sin regla en `02` (⚙, decisión de producto; su severidad se revisa en P-04), todos en `diagnostics/designChecks.ts`:

- `unloaded`
- `noStemming` (hoy error)
- `noDetonator` (hoy error)
- `notInitiated`
- vecinos coincidentes (1,5 × máx(B, S) dentro de la ventana)
- bocas duplicadas (< 0,5 m)
- fuera del perímetro

## 4. Decisiones por defecto (DF, de la guía `01 §17`)

| #     | Duda                                   | Defecto para avanzar                                                       | Estado      | En el código                                                              |
| ----- | -------------------------------------- | -------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| DF-01 | Umbral de deflagración / VOD mínimo    | Aviso configurable, 2.000 m/s                                              | R0          | ✖                                                                         |
| DF-02 | Presión de detonación                  | PD = ρ·VOD²/4, γ configurable; PB = 0,5·PD                                 | R1          | ✖                                                                         |
| DF-03 | Potencia relativa y ANFO de referencia | RWS = AWS/AWS_ANFO; ANFO de referencia 900 kcal/kg, configurable y visible | R0          | ◐ `rws` relativo a ANFO = 1; ANFO a 3,7 MJ/kg (≈ 884 kcal/kg), sin fuente |
| DF-04 | Densidad y SD con decks                | Densidad por tramo; SD con la carga más cercana a la superficie            | R0          | ✖ (P-01)                                                                  |
| DF-05 | Longitud con sobreperforación          | L = H + J                                                                  | R2          | ✔ vertical; inclinado en P-05                                             |
| DF-06 | Sobreperforación por defecto           | J = 0,3·B; J = 0 permitido; aviso 0,2–0,5·B                                | R0          | ◐ 1,5 m fijo                                                              |
| DF-07 | Diámetro vs altura de banco            | Solo aviso informativo                                                     | R0          | ✖                                                                         |
| DF-08 | Burden efectivo                        | Modelo de `02 §3`                                                          | R0          | ✖ (P-02)                                                                  |
| DF-09 | Taco por defecto                       | T = 0,7·B, verificado con SD                                               | R1          | ◐ solo como chequeo                                                       |
| DF-10 | Espaciamiento y umbral de rigidez      | (H + 7B)/8 si H/B < 4; 1,4·B si ≥ 4                                        | R1          | ✖                                                                         |
| DF-11 | Nombres de indicadores                 | `loading_factor_kg_m3`, `powder_factor_kg_t`, `energy_factor_MJ_t`         | Cerrado     | ◐ se renombran en G4 (D-10)                                               |
| DF-12 | Ventana de MIC                         | 8 ms, semiabierta, configurable                                            | R3          | ✔ (falta persistirla en `calcParams`, G1)                                 |
| DF-13 | Distancia para el PPV de un grupo      | Taladro más cercano; alternativa: centroide                                | R0          | ◐ (P-07)                                                                  |
| DF-14 | Límites de vibración                   | Tabla configurable; 32/26/19 mm/s de curso                                 | R1          | ✖ (P-12)                                                                  |
| DF-15 | Precisión de detonadores               | Parámetro del catálogo; sin Monte Carlo en F1                              | R1          | ✔ `Detonator.delayScatter`                                                |
| DF-16 | Estado del taladro (seco o con agua)   | Campo opcional de tres estados                                             | Por decidir | ✖ (P-09)                                                                  |
| DF-17 | Variantes de Kuz-Ram                   | No en F1; fuente y CR-07 antes de F2                                       | R0          | ◐ ya implementado (P-08)                                                  |
| DF-18 | Formatos de la operación               | CSV, DXF y GeoJSON primero                                                 | Por validar | ◐ falta GeoJSON (P-13)                                                    |
| DF-19 | Tablas ms/m por roca y equipo          | Una tabla configurable                                                     | R0          | ✖                                                                         |
| DF-20 | Umbrales de SDOB                       | < 0,4 severo; > 1,2 sin proyección; configurable                           | R0          | ✖                                                                         |
| DF-21 | Tiempo mínimo de alivio Δ              | 0 ms, parámetro                                                            | R0          | ✖                                                                         |
| DF-22 | Origen de los catálogos                | Ficha técnica con versión y URL en cada producto                           | R1          | ✖ (CT-01)                                                                 |

## 5. Constantes del código sin fuente (CT)

Por la regla de la guía, deben pasar a parámetro del usuario o citar su fuente.

| ID    | Valor                                                                                                 | Dónde                                                                                      | Estado                            | Acción                                                      |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------- |
| CT-01 | Todos los productos de la librería inicial (ANFO 800 kg/m³, 3.800 m/s, 3,7 MJ/kg; emulsión RWS 0,78…) | `packages/core/src/model/library.ts`                                                       | R0                                | Fichas públicas con `source` y `version` (G4)               |
| CT-02 | Banco 15 m, cara a 75°, Ø 0,2 m, sobreperforación 1,5 m                                               | `model/factories.ts`                                                                       | R0                                | Valores de ejemplo; J = 0,3·B como defecto paramétrico (G3) |
| CT-03 | Roca 2.650 kg/m³, UCS 150 MPa, E 50 GPa                                                               | `model/factories.ts`                                                                       | R0                                | Roca de ejemplo, rotulada como tal                          |
| CT-04 | Ley de PPV K = 1,14 m/s, β = 1,6 («USBM, típicos»)                                                    | `model/factories.ts`                                                                       | R0                                | Citar la fuente o exigir constantes del sitio (G6)          |
| CT-05 | Sobrepresión k = 185 kPa, β = 1,2                                                                     | `model/factories.ts`                                                                       | R0                                | Fuente (F2)                                                 |
| CT-06 | Densidad de roca de respaldo 2.650 kg/m³                                                              | `analysis/analyzeBlast.ts`, `vibration/vibration.ts`, `packages/workers/src/computeApi.ts` | R0                                | Sin respaldo: exigir roca asignada                          |
| CT-07 | Holmberg–Persson K = 0,7 m/s, α = 0,7, β = 1,5                                                        | `energy/energy.ts`                                                                         | R1 (cita Holmberg & Persson 1979) | Calibrar por sitio                                          |
| CT-08 | n ≥ 0,3; desviación de perforación 0,1 m; respaldo 25                                                 | `fragmentation/fragmentation.ts`                                                           | R0                                | Parámetros (F2)                                             |
| CT-09 | Detonador a 0,5 m del fondo                                                                           | `timing/tieUp.ts`                                                                          | ⚙                                 | Parámetro de la plantilla                                   |
| CT-10 | Taco mínimo 0,7·B, duplicado 0,5 m, vecindad 1,5×, espaciamiento de respaldo 5 m                      | `diagnostics/designChecks.ts`                                                              | ⚙ / R1 (0,7·B)                    | Persistir en `calcParams` (G1)                              |
