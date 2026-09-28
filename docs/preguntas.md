# Preguntas para el ingeniero de minas

Dudas de dominio abiertas (guía `docs/theory/01 §14` y `§17`). Cada una trae el **valor por defecto con el que se avanza**, siempre como parámetro configurable. Las respuestas se dan en bloque. Al cerrarse una pregunta se actualiza `docs/reglas.md` y aquí se anota la respuesta con su fecha.

Estado: 🔴 crítica (bloquea el cierre de un hito) · 🟡 no crítica · ✅ respondida.

## Preguntas

| ID   | Pregunta                                                                                                                                                                                                                                                  | Defecto con el que se avanza                                                                                                  | Hito   | Estado |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| P-01 | Densidad y SDOB en taladros con decks: ¿qué carga define la SDOB? (`01 §17` #4, `R1 §7` #4)                                                                                                                                                               | Densidad por tramo; SDOB con la carga más cercana a la superficie, bajo el taco                                               | G4     | 🔴     |
| P-02 | Burden efectivo: ¿se acepta el modelo de `02 §3` (distancia a la superficie libre más cercana al detonar, con los taladros ya detonados como puntos)? (`01 §17` #8, `R1 §7` #9)                                                                           | Ese modelo, con Δ = 0 ms. Se contrasta con el «burden relief» de JKSimBlast (`R3` F12)                                        | G5     | 🔴     |
| P-03 | ¿Se bloquea la generación de malla si no hay cara libre? `02 §6` dice «no se genera malla» (R1), pero la guía `§9` exige R3 para bloquear                                                                                                                 | Se permite generar con una advertencia visible hasta que la regla llegue a R3 o el ingeniero lo decida como regla de producto | G3     | 🟡     |
| P-04 | Chequeos propios sin regla en `02` que hoy son **error**: `noStemming`, `noDetonator`. ¿Error o advertencia?                                                                                                                                              | Advertencia (regla por debajo de R3)                                                                                          | G4     | 🟡     |
| P-05 | Longitud de un taladro inclinado. El código usa L = (H + J)/cos α (J medida en vertical). `02 §1` usa L = H/cos α + J_α, con J_α = (1 − α/100)·J (López Jimeno). En CR-03 dan 11,78 m y 11,50 m, una diferencia de 2,4 %, mayor que la tolerancia del 2 % | Implementar la de López Jimeno como opción y reproducir CR-03 con ella; confirmar cuál es la de uso general                   | G3     | 🔴     |
| P-06 | Volumen por taladro. Los CR usan V = B·S·H (/cos α); la aplicación cubica por área de influencia (Voronoi recortado al perímetro). ¿Qué volumen alimenta el factor de carga?                                                                              | Mostrar ambos: «nominal (B·S·H)» por taladro y grupo, y «cubicado» para la voladura. Los CR se prueban contra el nominal      | G3     | 🟡     |
| P-07 | Distancia para el PPV de un grupo de taladros en una ventana (`01 §17` #13)                                                                                                                                                                               | Taladro más cercano del grupo (conservador); centroide como opción                                                            | G6     | 🔴     |
| P-08 | Kuz-Ram: ¿qué índice n, RWS o RBS en Kuznetsov, y qué rango de A? El código usa el n de Cunningham (1987) y RWS (`R1 §7` #13, `01 §17` #17)                                                                                                               | Se mantiene lo implementado como regresión (R0) hasta tener un ejemplo publicado (CR-07)                                      | F2     | 🟡     |
| P-09 | ¿El taladro tiene un estado «seco / agua estática / agua dinámica» que filtre productos? (`01 §17` #16, RM-02)                                                                                                                                            | Campo opcional de tres estados; solo filtra y avisa, no bloquea                                                               | G1     | 🔴     |
| P-10 | Confirmar CR-05, en particular la convención del amarre 4: dos taladros separados exactamente 8 ms **no** se agrupan (ventana semiabierta)                                                                                                                | Ventana semiabierta [t, t + w)                                                                                                | G5, G6 | 🔴     |
| P-11 | Fórmulas de «retardo corto» (Chiappetta T = 600·S/Vp, Lagrange 2500·S/Vp, 700·S/Vp, variante con Vs): ¿cuál, y solo para electrónicos? (`R1 §7` #14)                                                                                                      | No se implementan hasta tener respuesta                                                                                       | F2     | 🟡     |
| P-12 | Límites de vibración: ¿qué norma peruana vigente reemplaza los valores de curso 32/26/19 mm/s? (`01 §17` #14, RM-21)                                                                                                                                      | Tabla configurable con los valores de curso, rotulados «curso, por contrastar»                                                | G6     | 🟡     |
| P-13 | ¿Qué formatos usa realmente la operación? (DXF, GeoJSON, formatos de programas de planificación) (`01 §17` #18, RM-22)                                                                                                                                    | CSV, DXF y GeoJSON                                                                                                            | G2     | 🟡     |

## Datos pendientes de entrega

| Dato                                                                            | Para qué                                    | Mientras tanto                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| CSV real de la malla de CR-04 (180 taladros)                                    | G2, G3, G4, G7 e indicador I6               | Fixture sintético con la misma estructura y las trampas de `03 §5` |
| Registros completos de vibración de CR-06, con la carga por retardo de cada uno | Ajustar K y β (F4)                          | Ejemplo hecho a mano de `04` (K = 1140, β = 1,6)                   |
| Ejemplo publicado de Kuz-Ram (CR-07)                                            | Evidencia independiente de la fragmentación | CR-02 fila 15, solo como regresión                                 |
| Demo oficial de JKSimBlast o I-Blast                                            | Indicador I7 (paridad ±2 %)                 | —                                                                  |

## Respuestas

_(Sin respuestas del ingeniero todavía.)_

## Defectos aplicados en el código (a confirmar)

- **P-03** (G3): se genera la malla sin cara libre y se avisa. La revisión cuenta la superficie del banco como una cara: sin cara marcada, «voladura confinada».
- **P-06** (G3): Resultados muestra el volumen cubicado (Voronoi) y el nominal (B·S·H/cos α), con su factor de carga; los CR se prueban contra el nominal.
- **P-10** (Tramo 0): ventana semiabierta [t, t + w) en MIC.
