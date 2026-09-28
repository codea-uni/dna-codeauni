# Ejercicio de comprensión (hito G0)

Guía `docs/theory/01 §18`, indicador I1. **Lo responde el desarrollador, con sus palabras.** La guía (`§11`) exige poder explicar cada módulo, así que las respuestas no se delegan a una IA. El ingeniero de minas las revisa y las aprueba. Material de apoyo: `docs/theory/references/R1 - Primer minero a desarrollador.md` (§1 ciclo, §2 glosario, §3 fichas, §5 ejemplos).

| #   | Estado                                        | Revisado por                  | Fecha      |
| --- | --------------------------------------------- | ----------------------------- | ---------- |
| 1   | Aprobada (fuente del taco hidráulico a citar) | Ingeniero de minas (presente) | 2026-09-28 |
| 2   | Aprobada                                      | Ingeniero de minas (presente) | 2026-09-28 |
| 3   | **Pendiente: falta resolver con los datos**   | —                             | —          |
| 4   | Aprobada                                      | Ingeniero de minas (presente) | 2026-09-28 |
| 5   | Aprobada                                      | Ingeniero de minas (presente) | 2026-09-28 |
| 6   | Aprobada                                      | Ingeniero de minas (presente) | 2026-09-28 |

## 1. Taco y confinamiento

**Por qué confina.** El taco es el material inerte (detritus de perforación, grava angular) que se coloca sobre la carga, en la parte superior del taladro. Al detonar, los gases a alta presión buscan la salida más fácil, que es la boca del taladro. El taco la tapona por fricción contra las paredes y por su propia inercia. Eso retiene los gases el tiempo suficiente (milisegundos) para que abran y propaguen grietas en la roca. La energía de gas, que es la que desplaza el material, se aprovecha en la fragmentación y no se pierde por arriba.

**Si el confinamiento es insuficiente** (taco corto, o material fino o redondeado que «sale disparado»):

- Los gases escapan por la boca y se produce eyección del taco (_stemming ejection_).
- Aumentan la proyección de rocas (flyrock) y la onda aérea.
- La fragmentación empeora en la zona del collar: quedan bolones en la parte alta del banco.
- Baja el aprovechamiento energético, así que se necesita más explosivo para el mismo resultado.

Si el taco es excesivo, el problema es el contrario: queda roca sin fragmentar en el collar.

**Agua como taco.** Sí existe. Se llama _water stemming_ o taco hidráulico: bolsas o ampollas de plástico llenas de agua (o gel acuoso) que se colocan en el taladro. Se usa sobre todo en minería subterránea de carbón y en túneles, donde además suprime polvo y humos y reduce el riesgo de ignición de grisú y polvo de carbón.

Fuente: literatura de voladura subterránea en carbón, por ejemplo las normas de la DGMS (India) sobre taco en minas grisuosas, o el ISEE Blasters' Handbook. **Pendiente:** citar la referencia exacta. Ya hay fuentes verificadas en `docs/theory/05` (RM-01): 30 CFR 75 subparte N y OSTI, _plastic water stemming cartridges_.

## 2. Cadena de iniciación

```
[Detonador] ──► [Booster / primer] ──► [Explosivo a granel (ANFO, emulsión)]
 pequeña carga     carga de alta            carga principal, poco sensible:
 muy sensible      potencia y velocidad     necesita un «golpe» fuerte para
                   (p. ej. pentolita)       detonar de forma estable
```

Cada eslabón es más potente y menos sensible que el anterior. El detonador por sí solo no aporta suficiente presión de choque para iniciar un agente de voladura a granel. El booster amplifica esa señal y entrega una onda de detonación intensa que establece la detonación estable del granel.

**Si faltara el booster:**

- El granel podría no detonar (tiro fallado), lo que deja explosivo sin reaccionar en el terreno. Es un riesgo grave de seguridad.
- También podría deflagrar o detonar a baja velocidad, con mala fragmentación y más humos tóxicos (NOx, CO).

## 3. CR-01 a mano

**Pendiente.** La respuesta recibida explica bien el procedimiento, pero no lo resuelve: dice que faltan los datos, y los datos están en `docs/theory/04`, CR-01. Falta hacer el cálculo a mano y compararlo con el código (paso 2 de la guía `§2`).

Procedimiento recibido:

- **Ash:** B = K_B · D / 12, con B en pies y D en pulgadas (o B = K_B · D en las mismas unidades). K_B vale entre 20 y 40 según la roca y el explosivo, típicamente 25–30.
- **Konya–Walter (métrico):** B = 0,012 · (2·ρ_e/ρ_r + 1,5) · D_e, con B en m y D_e en mm. El factor 0,012 es 0,3048/25,4, la conversión de la forma en pies y pulgadas. CR-01 además multiplica por Kd·Ks.
- **Para comparar con el código:** unidades de D, redondeos intermedios y la misma ρ_e.
- Konya–Walter da algo más que Ash porque incorpora la relación de densidades.

Datos de CR-01: Ø = 12¼" = 311,15 mm; ANFO ρ_e = 0,78 t/m³; andesita ρ_r = 2,6 t/m³; K_B = 25; Kd = 0,95; Ks = 1,10.

Para completar, escribe los pasos con tus números y verifica contra:

- Ash: 7,779 m (25,52 ft).
- Konya–Walter: 8,194 m. Sin Kd·Ks, la forma métrica da 7,841 m.

La implementación en código llega en G3 (`core/src/design/burden.ts`), con estos valores como test.

## 4. Cara libre

Una cara libre es una superficie de la roca expuesta al aire o a un vacío, hacia la cual el material puede desplazarse. La onda de compresión se refleja en ella como tracción, y la roca, que resiste mucho menos a tracción, se rompe. Sin cara libre la roca solo se tritura alrededor del taladro y no se arranca.

**Banco típico: dos caras libres.** Tiene la cara frontal (el talud vertical) y la superficie superior del banco. Por eso el material se rompe hacia el frente y se «esponja» hacia arriba con facilidad.

**Túnel: una sola cara libre (el frente).** Funciona porque la primera parte de la voladura, el cuele o _cut_, crea una segunda cara libre artificial. Los taladros del cuele, a menudo con taladros vacíos de gran diámetro, abren una cavidad central. Luego los taladros siguientes (ayudas, contorno) disparan con retardo hacia esa cavidad, que actúa como nueva cara libre.

## 5. Amarre y retardo

- **Retardo:** es el tiempo (en ms) que tarda cada taladro en detonar respecto al inicio. Es una propiedad temporal, que dan el detonador o los conectores.
- **Amarre:** es el esquema de conexión que define la secuencia espacial de salida. Dice qué taladros salen antes y cuáles después, y por tanto hacia dónde se abre cada uno.

La misma malla con distinto amarre cambia la dirección del movimiento (↑ indica la cara libre; los números son el orden de salida):

```
Amarre 1: en línea (fila por fila)        Amarre 2: en «V» (chevron)
   Cara libre ↑                               Cara libre ↑
 1   1   1   1   1                          3   2   1   2   3
 2   2   2   2   2                          4   3   2   3   4
 3   3   3   3   3                          5   4   3   4   5
→ material avanza recto hacia el frente    → material converge al centro
  (pila extendida, más desplazamiento)       (pila alta y concentrada,
                                              menos proyección lateral)
```

## 6. Vibración y distancias escaladas

- **PPV** (velocidad pico de partícula, en mm/s): mide cuán rápido se mueve el terreno. Es el indicador principal de daño estructural.
- **Frecuencia** (Hz): indica cuán rápido oscila el terreno. Las bajas frecuencias (menos de unos 10 Hz) son más peligrosas porque se acercan a la frecuencia natural de las casas. Por eso las normas fijan PPV admisibles en función de la frecuencia.
- **Onda aérea** (airblast, en dB(L) o Pa): es la sobrepresión que viaja por el aire, no por el terreno. Se origina por taco deficiente, cargas expuestas o desplazamiento de la cara. Rompe vidrios y causa molestias.

**Las dos distancias escaladas no son lo mismo:**

- **Distancia escalada de vibración:** SD = R / √W, donde R es la distancia al punto de interés y W la carga máxima por retardo. Predice la PPV en un receptor lejano, con la ley PPV = K·SD^(−β).
- **Profundidad escalada de enterramiento:** SDOB = d / W^(1/3), donde d es la distancia desde la superficie hasta el centro de la carga (considerando el taco) y W la masa de esa carga. Describe el confinamiento de la carga, es decir, qué tan probable es que se produzcan cráteres, flyrock u onda aérea.

La primera mide el efecto en el entorno. La segunda mide cuán bien contenida está la carga. Además usan exponentes distintos: raíz cuadrada frente a raíz cúbica.
