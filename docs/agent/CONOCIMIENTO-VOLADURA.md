# Conocimiento de voladura para el agente de diseño por voz

Referencia de dominio del agente de voz de Cronos que diseña, dentro de un polígono existente sobre la topografía, el precorte, las filas buffer, la producción, la carga por taladro y el amarre con sus retardos. De este documento salen la versión compacta `docs/agent/PROMPT-VOZ.md` y la tabla `docs/agent/reglas-agente.json`.

> **Reglas de uso (de `CLAUDE.md` y `docs/RULES.md`).**
>
> - Toda cifra lleva fuente humana verificable y un estado R0–R4. La IA no es fuente: lo que aquí figura como R0 es una hipótesis que el ingeniero debe confirmar.
> - Todo son **valores guía para conversar**. Los números que el agente informa al usuario salen de las herramientas de la app (`generate_pattern`, `set_charge`, `set_tie_up`, `get_analysis`…), que aplican las fórmulas FC del registro. Si una regla de este documento y un cálculo de la app no coinciden, gana el cálculo y la diferencia se anota en `docs/QUESTIONS.md`.
> - Solo una regla en R3 o más puede bloquear. Todo lo demás es, a lo sumo, una advertencia.
> - Si este documento y `docs/theory/` se contradicen, gana `docs/theory/`.

**Cómo se cita.** `R1 F26` es la ficha F26 del primer (`docs/theory/references/R1-MINING-PRIMER.md`). `FC-31`, `RM-02`, `CK-08` y `DF-19` son filas de `docs/RULES.md`. Las claves externas (`[AEISG-RG §8.3.1]`, `[DN-NONEL p47]`…) están en §13. Las claves del curso (`P4-C5 p19`…) siguen la convención del primer, §0.

**Estados sugeridos.** R1 = cifra tomada de un documento leído (el código, la norma o el manual). R1s = R1 a partir de una fuente secundaria que reproduce el original (paper o apunte que cita la fuente), pendiente de contrastar con el original. R0 = práctica corriente o cifra sin fuente primaria localizada. Para lo que ya existe en el registro se da su estado de `docs/RULES.md`.

---

## 1. Entrevista previa obligatoria (qué preguntar y por qué)

El agente **no diseña** sin estos datos. Pregunta uno por uno, en este orden, y propone un valor por defecto solo si el ingeniero lo pide.

| #   | Pregunta                                                                                                        | Por qué                                             | Qué decide |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------- |
| 1   | Objetivo y zonas: ¿mineral, desmonte (estéril) o mixto? Destinos: planta/chancadora, stock (blending), botadero | Fija el P80 objetivo y si hace falta submalla       | §6, §9     |
| 2   | Roca: masiva/continua, fracturada o muy fracturada; tipo de roca; UCS (MPa); densidad                           | Factor de roca A, escala de malla, explosivo        | §2, §6     |
| 3   | Agua: taladros secos, húmedos (agua estática), inundados o con recarga (agua dinámica); nivel freático alto     | Explosivo, mangas, tiempo de permanencia            | §3         |
| 4   | Terreno reactivo o caliente: sulfuros (pirita), sales blancas o amarillas, olor a SO₂, temperatura del taladro  | Producto inhibido, sin ANFO, límites de permanencia | §4         |
| 5   | Diámetro de broca, altura de banco, sobreperforación habitual, inclinación                                      | Escala de la malla                                  | §2         |
| 6   | Cara libre y dirección de salida deseada (hacia dónde debe moverse la pila)                                     | Secuencia y desplazamiento                          | §8, §9     |
| 7   | Pared final o talud cerca: ¿lleva precorte y buffer?                                                            | Control de contorno                                 | §2.1, §2.2 |
| 8   | Puntos sensibles: talud, instalaciones, viviendas; distancia y límite de PPV aceptado (EIA o norma local)       | Carga máxima por retardo, secuencia                 | §10        |
| 9   | Zona de exclusión y riesgo de proyección (personas, equipos, vías)                                              | Taco, SDOB                                          | §11        |
| 10  | Sistema de iniciación: pirotécnico (Nonel) o electrónico; retardos de catálogo disponibles                      | Tiempos posibles, riesgo de corte                   | §8         |
| 11  | Tiempo de permanencia previsto entre carguío y disparo (sleep time)                                             | Humos, terreno reactivo, emulsión                   | §3, §4, §5 |

---

## 2. Escala de la malla por familia de taladro

### 2.0 Producción: reglas de partida

Fórmulas del registro (en R3, son las que calcula la app): burden por Ash, Konya–Walter y Andersen (FC-06 a FC-08), espaciamiento (FC-09), longitud y volumen (FC-01, FC-02) y rigidez (FC-04).

| Regla                                                     | Valor guía                                                                                                      | Fuente                                      | Estado            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------- |
| Burden como múltiplo del diámetro de carga                | B ≈ 25·D con ANFO; 30–35·D con producto denso (≈ 1,2 g/cc)                                                      | [OSMRE-M3 «Burden»]                         | R1                |
| Rango del curso                                           | B = 21·Ø (ANFO, roca muy dura) a 40·Ø (dinamita, roca blanda); 33–39·Ø según UCS (tabla 20.3, pequeño diámetro) | R1 F03 `[P1-S5 p45; P5 p8]`                 | R1                |
| Ash, Kb por roca y densidad del explosivo                 | Densidad baja (0,8–0,9): 30/25/20; media (1,0–1,2): 35/30/25; alta (1,2–1,6): 40/35/30 (roca blanda/media/dura) | R1 F03, FC-06                               | R3                |
| Corrección de Konya por estructura, Ks                    | 1,30 roca muy agrietada o con juntas débiles; 1,10 capas delgadas bien cementadas; 0,95 roca masiva intacta     | R1 F03, FC-07                               | R3 (valores R1)   |
| Corrección de Konya por estratos, Kd                      | 1,18 buzando hacia el corte; 0,95 hacia la cara; 1,00 otros                                                     | R1 F03, FC-07                               | R3 (valores R1)   |
| El burden operativo queda a ±10 % del teórico             | «Dentro del 110 % del valor de la teoría»                                                                       | R1 F03 `[P1-S5 p57]`, CK-05                 | R1                |
| Espaciamiento                                             | S = (H + 7B)/8 si H/B < 4; S = 1,4·B si H/B ≥ 4; al tresbolillo S = 1,15·B                                      | FC-09, FC-05                                | R3                |
| S/B                                                       | Entre 1 y 2; nunca > 2                                                                                          | R1 F04 `[P1-S6 p18]`                        | R1                |
| Rigidez H/B                                               | 1 pobre, 2 regular, 3 bueno, ≥ 4 excelente; ≤ 2 es motivo de atención                                           | FC-04, CK-01                                | R3                |
| Sobreperforación                                          | J = 0,3·B (Konya); 0,2–0,5·B (Atlas); 0,2–0,3·B (Hoek y Bray)                                                   | R1 F05, DF-06, CK-03                        | R0/R1 (parámetro) |
| Taco                                                      | T = 0,7·B como primera aproximación; rango 0,5–1,3·B; 15–25·Ø                                                   | [OSMRE-M3 «Stemming»]; R1 F06; DF-09; CK-02 | R1                |
| Taco intermedio entre decks                               | ≥ 6·Ø en seco; el doble (≥ 12·Ø) con agua                                                                       | [OSMRE-M3 p. «Deck»]                        | R1                |
| No cargar la sobreperforación con exceso de confinamiento | Más PPV y daño al piso                                                                                          | [OSMRE-M3 «Subdrilling»]                    | R1                |
| H entre 50 y 70 diámetros                                 | Solo nota informativa                                                                                           | CK-04                                       | R0                |

**Lectura para el agente.** Roca dura o masiva: burden más cerca de 25·D (Ks 0,95, Kb bajo). Roca blanda o muy fracturada: el burden geométrico puede crecer (Ks 1,10–1,30, Kb alto). Ojo: en roca muy fracturada **la fragmentación** suele ser fácil (factor de roca bajo, §6) pero se fugan los gases. Por eso conviene un explosivo con mucha energía de gas (ANFO o ANFO pesado) `R1 F18 [V1-02S p7-9]`.

### 2.1 Precorte

| Regla                                | Valor guía                                                                                                                  | Fuente                                       | Estado |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------ |
| Espaciamiento                        | 10–12·Ø típico (hasta 14·Ø en geología muy favorable); 12·Ø como punto de partida común                                     | [FHWA 3.6]; [Konya, Rock Products 2016]      | R1     |
| Espaciamiento por presión de taladro | E ≤ Ø·(Pb + RT)/RT, con Pb ≈ UCS·R (R ≈ 1)                                                                                  | FC-31; R1 F26 `[X-PRE]`                      | R3     |
| Presión de taladro desacoplada       | Pb [MPa] = 110·f^n·ρe·VOD², f = (Dc/Dh)²·lc/l, n = 1,25 en seco y 0,9 con agua                                              | FC-31; R1 F26                                | R3     |
| Carga lineal (regla práctica)        | q [lb/ft] = Ø[in]²/28, es decir q [kg/m] ≈ 0,053·Ø[in]² (≈ 8,2·10⁻⁵·Ø[mm]²)                                                 | [Austin Powder, Blaster's Guide]             | R1s    |
| Carga lineal (escuela sueca)         | q ≈ 90·d² kg/m equivalente ANFO, con d en metros                                                                            | Holmberg y Persson, reproducido en [911M-CB] | R1s    |
| Tabla de partida del curso           | Ø 76 mm: 0,5 kg/m, S 1,2 m; Ø 152 mm: 1,9 kg/m, S 2,4 m; Ø 311 mm: 8,1 kg/m, S 4,6 m                                        | R1 F26 `[P5 p9]`                             | R1     |
| Ejemplo resuelto                     | Ø 165 mm, UCS 100 MPa, RT 8 MPa, seco → E = 2,23 m; 1,54 kg/m; Pb = 100 MPa                                                 | R1 F26, CR de FC-31                          | R3     |
| Carga por área de cara               | ≈ 0,5 kg/m² en la columna; 2–3 veces más en el fondo (≈ 1–1,5 kg/m²)                                                        | [FHWA 3.6] (0,1 lb/ft² y 0,2–0,3 lb/ft²)     | R1     |
| Desacople                            | Carga de diámetro menor que el taladro (cartuchos en tira sobre cordón, aire anular); la carga lineal y Pb se ajustan con f | R1 F26; [FHWA 3.6]; [OSMRE-M3]               | R1     |
| Simultaneidad                        | Los taladros del precorte salen juntos o en grupos; si no, no se forma el plano                                             | R1 F26 `[P4-C8 p20-25]`                      | R1     |
| Tiempo respecto a producción         | Precorte ≥ 100 ms antes que la producción, o como voladura separada previa                                                  | R1 F26 `[P4-C6 p44; P4-C8 p12-13]`           | R1     |
| Taco                                 | El precorte no necesita gran taco; en precorte de precisión, 10–12·Ø                                                        | [Konya, Rock Products 2016]                  | R1s    |
| Taladros guía                        | Taladros vacíos intermedios en roca débil o en esquinas                                                                     | [FHWA 3.6]                                   | R1     |
| Evaluación                           | Medio caña visible, filtro de vibración, ausencia de fracturas nuevas tras la línea                                         | R1 F26 `[P4-C8 p16]`                         | R1     |

### 2.2 Buffer (amortiguación) y recorte

| Regla                                                          | Valor guía                                                                                                      | Fuente                                                    | Estado                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| Burden y espaciamiento de buffer                               | 0,5–0,8 veces los de producción                                                                                 | R1 F04 `[P1-S5 p59]`                                      | R1                                |
| Fórmula del registro                                           | B_buf = [W·1000/(FC·K_BP·H·ρr·SBR)]^0,5; S_buf = 1,15·B_buf                                                     | FC-32                                                     | R3                                |
| Distancia del precorte a la última fila de producción o buffer | ≈ 0,4–0,6 B de producción                                                                                       | Presentación de voladura controlada (Doddaka, SlideShare) | R0 (solo fuente secundaria débil) |
| Carga de buffer                                                | Reducida: cámara de aire o decks. Ejemplo de mina: taco 4,5 m + aire 7,5 m + 4 m de HA-64                       | R1 F11 `[V2-02-1 p33]`                                    | R1                                |
| Recorte (cushion)                                              | S = 15–24·Ø, siempre menor que el burden a remover; se dispara después de la producción                         | [FHWA 3.6]                                                | R1                                |
| Tiempo                                                         | No retardar demasiado los taladros perimetrales; < 42 ms entre taladros de la última fila daña la pared trasera | R1 F20/F21 `[P4-C8 p5; P5 p77-80]`                        | R1                                |
| Isócronas                                                      | Paralelas a la cara libre y perpendiculares a la pared que se cuida                                             | R1 F21 `[P4-C5 p29; P4-C8 p6]`                            | R1                                |

---

## 3. Agua y selección de explosivo

### 3.1 Matriz agua → producto

Convención: «x/y» = % de emulsión / % de ANFO (el AP-73 del curso es 70 % emulsión y 30 % ANFO, R1 §2.3 n.º 42). Dyno Nobel nombra sus mezclas por el % de emulsión (TITAN 3030 = 30 %).

| Condición del taladro                | Productos admisibles                                                                        | Evitar                                     | Fuente                                            | Estado |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- | ------ |
| Seco                                 | ANFO; ANFO pesado 20–30 % emulsión; mezclas hasta 50 %                                      | —                                          | [DN-TITAN 3000/5000]; R1 F18                      | R1     |
| Desaguado (bombeado sin recarga)     | ANFO pesado ≤ 50 % emulsión cargado de inmediato; medir la recarga antes de elegir          | ANFO si hay recarga                        | [DN-TITAN]; [AEISG-NOx causa 5]                   | R1     |
| Húmedo, agua estática                | Mezclas ricas en emulsión (60/40, 70/30) bombeadas desde el fondo; emulsión gasificada      | ANFO; mezclas ≤ 50 %                       | R1 F18 `[P2-01 s19; V1-02S p17-19]`; [DN-TITAN]   | R1     |
| Inundado o agua dinámica (recarga)   | Emulsión bombeable desde el fondo; encartuchado; o manga (liner) con producto seco          | ANFO sin manga; carga desde arriba en agua | R1 F18 `[P2-01 s19]`; [AEISG-NOx causas 2, 5 y 6] | R1     |
| Nivel freático alto en todo el banco | Planificar emulsión o mezclas ricas; cargar primero los húmedos y volver a sondar los secos | —                                          | [AEISG-NOx causa 5]                               | R1     |

Hechos de soporte:

- El ANFO no tiene resistencia al agua: con ≈ 10 % de humedad queda inservible `R1 F18 [P2-01 s19]`. El agua disuelve el nitrato y se pierde el balance (más NOx) [NIOSH-NOx]. R1.
- A más emulsión, más resistencia al agua, pero en general menos energía por kg [DN-TITAN 3000]; [Rock Products, mezclas]. R1.
- Las mangas reducen el contacto con el agua, pero pueden romperse, y el producto puede derramarse por fuera [AEISG-RG §6]. R1.
- La app ya filtra por agua: estado de agua del taladro (`Hole.water`), aviso `waterIncompatible` (RM-02 ✔, DF-16).

### 3.2 Diámetro crítico, temperatura y permanencia

| Regla                              | Valor guía                                                                                           | Fuente                         | Estado     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| Diámetro pequeño                   | < 51 mm: emulsión o dinamita; 51–102 mm: ANFO en columna; > 102 mm: ANFO sin problema                | R1 F14/F18 `[V1-02S p13-14]`   | R1         |
| Diámetro crítico de mezclas        | HA-28 2,0"; HA-37 2,5"; HA-46 3,0"; HA-55 3,5–4,0"; HA-64 5,0"; emulsión gasificada 3,5"; AP-73 4,0" | R1 F14 `[V1-01E p32]`; CK-09   | R1         |
| Diámetro crítico del ANFO          | Depende del confinamiento y del prill; el curso no da cifra                                          | R1 §4.2                        | sin fuente |
| Estabilidad térmica                | Emulsión mala bajo 4,5 °C; ANFO mala sobre 32,2 °C                                                   | R1 F18 `[P5 p31]`              | R1         |
| Permanencia de emulsión gasificada | ≤ 72 h con agua; ≤ 96 h en seco                                                                      | R1 F13 `[P2-C34 s21]`          | R1         |
| Permanencia «corta» para humos     | < 3 días (orientación del árbol de fallas, no límite del fabricante)                                 | [AEISG-NOx §6, nota del árbol] | R1         |
| Ficha técnica                      | Manda el límite de permanencia de la ficha del producto (DF-22)                                      | [AEISG-RG §5.4.3]              | R1         |

---

## 4. Terreno reactivo y terreno caliente

### 4.1 Definiciones y umbrales (AEISG, Ed. 5, 2020)

| Concepto                                           | Valor                                                                                                                        | Fuente                               | Estado |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| Terreno reactivo                                   | Reacción exotérmica espontánea de sulfuros (Fe o Cu) con nitratos; impredecible y puede iniciar el explosivo antes de tiempo | [AEISG-RG §1.2]                      | R1     |
| Temperatura estándar                               | ≤ 55 °C                                                                                                                      | [AEISG-RG App. 2, de AS 2187.2-2006] | R1     |
| Terreno caliente (_hot ground_)                    | 55 °C ≤ T < 100 °C                                                                                                           | [AEISG-RG §1.2]                      | R1     |
| Alta temperatura                                   | T ≥ 100 °C                                                                                                                   | [AEISG-RG §1.2]                      | R1     |
| Ensayo isotérmico de cribado                       | 55 ± 2 °C durante 7 días, o a la temperatura máxima del taladro si es mayor; exoterma ≥ 2 °C = significativa                 | [AEISG-RG §8, App.]                  | R1     |
| Ensayo de permanencia                              | 4 veces la permanencia requerida, hasta 28 días                                                                              | [AEISG-RG §8.3.1]                    | R1     |
| Permanencia máxima recomendada en terreno reactivo | 1 semana (ensayo de 28 días); más allá, evaluación de riesgo con el proveedor                                                | [AEISG-RG §8.3.1]                    | R1     |
| Indicios sin ensayo todavía                        | Suspender el producto no inhibido; usar producto muy inhibido con ≈ 8 h de permanencia                                       | [AEISG-RG, diagrama de flujo §7]     | R1     |
| Iniciadores (detonadores, boosters de pentolita)   | Uso normal hasta 70 °C; por encima, consultar al proveedor                                                                   | [AEISG-RG §10]                       | R1     |
| Reacción ANFO + pirita                             | Puede iniciarse desde 80–120 °C; ≈ 5 % de urea la retarda hasta 180 °C                                                       | R1 F24 `[P1-S4 p48-49]`              | R1     |
| Lavado de tiros fallados en terreno reactivo       | Preferir solución inhibidora (≈ 20 % de urea o carbonato de sodio)                                                           | [AEISG-RG §11]                       | R1     |

### 4.2 Detección en campo (indicadores AEISG §4)

- Presencia de sulfuros, sedimentos negros con sulfuros o sulfuros en la roca mineralizada.
- Sales blancas o amarillas sobre la roca, señal de oxidación.
- Agua de escorrentía ácida, de color amarillo a rojo pardo.
- Corrosión marcada de pernos, mallas y equipos fijos.
- Combustión espontánea en botaderos o en el tajo.
- Olor acre a SO₂.
- Temperatura elevada del taladro o del terreno.

Si aparece cualquiera de estos indicios, corresponde una evaluación de riesgo con muestreo y ensayo isotérmico [AEISG-RG §4] (R1). La prueba del balde (_bucket test_) con ANFO sirve para seguimiento, no reemplaza al ensayo isotérmico [AEISG-RG §8.4] (R1).

### 4.3 Mitigaciones

| Medida                                                                                                                     | Fuente                    | Estado |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------ |
| Producto inhibido, granel o encartuchado, con permanencia fijada por ensayo; es la medida más eficaz                       | [AEISG-RG §7]             | R1     |
| Sin ANFO ni mezclas no inhibidas en terreno reactivo; las barreras o mangas con producto no inhibido no son buena práctica | [AEISG-RG §6-7]           | R1     |
| Medir la temperatura taladro por taladro y registrar la máxima; rellenar o no cargar los que pasen el límite; zonificar    | [AEISG-RG §5.4.4, §5.4.7] | R1     |
| Cargar en el orden de salida y dejar los más calientes al final; amarrar y disparar pronto                                 | [AEISG-RG §5.4.5]         | R1     |
| Minimizar la permanencia; el límite lo fija el proveedor con el ensayo                                                     | [AEISG-RG §6.4.3]         | R1     |
| Plan de acción por si se carga producto no inhibido por error                                                              | [AEISG-RG §7]             | R1     |

---

## 5. Balance de oxígeno y humos (NOx, CO)

### 5.1 Balance de oxígeno

Definición: diferencia en peso entre el oxígeno disponible en la mezcla y el necesario para oxidar por completo el combustible (C → CO₂, H → H₂O), en % del peso total [PSU-MNG230 8.2.1]. R1.

| Componente                 | BO                                                                                     | Fuente                                | Estado |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------- | ------ |
| Nitrato de amonio (NH₄NO₃) | ≈ +20 %                                                                                | [PSU-MNG230 8.2.1]                    | R1     |
| Petróleo diésel (≈ CH₂)    | ≈ −342 %                                                                               | [PSU-MNG230 8.2.1]                    | R1     |
| ANFO estequiométrico       | 94,5 % AN / 5,5 % FO, BO ≈ 0 (3 NH₄NO₃ + CH₂ → 7 H₂O + CO₂ + 3 N₂)                     | [PSU-MNG230 8.2.1]; R1 F17 `[P5 p32]` | R1     |
| Práctica del curso         | 94:6 («94:6, no 94,3:5,7»), un leve exceso de combustible; BO de la mezcla 94/6 ≈ −2 % | R1 F17 `[V2-04-1 p19]`; [LAPSE 2023]  | R1     |
| Mezcla lineal              | BO_mezcla = Σ wᵢ·BOᵢ (p. ej. 0,945·20 − 0,055·342 ≈ 0)                                 | Definición                            | R1     |

Efectos:

- Falta de combustible (BO > 0) → NO y NO₂, humos naranja, menos energía (610 cal/g frente a ≈ 940 del ANFO ideal en el ejemplo del curso) `R1 F17 [P5 p32]`. R1.
- Exceso de combustible (BO < 0) → CO (820 cal/g en el ejemplo) `R1 F17`. R1. Por eso se prefiere un pequeño exceso de diésel: la subdosis baja el rendimiento y la sobredosis solo aumenta los gases [Wikipedia ANFO, que cita a fabricantes]. R1s.
- El ANFO pierde diésel por absorción en el terreno (_wicking_) y se disuelve con agua: ambas cosas empujan a NOx [NIOSH-NOx]. R1.
- En laboratorio, el exceso de diésel, la urea, el aluminio y el polvo de carbón redujeron NO y NO₂ [NIOSH-NOx]. R1.

### 5.2 Causas de NOx y controles (AEISG-NOx, Ed. 2, 2011, §5)

| Causa                                                              | Indicio                                     | Control                                                                                      | Estado |
| ------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Producto no resistente al agua en taladro húmedo o desaguado       | NOx intermitente, taladros con agua         | Producto según agua; sondar todos los taladros; medir la recarga; cargar primero los húmedos | R1     |
| Agua dinámica                                                      | Taladros derrumbados                        | Cargar y disparar sin espera; mangas; conocer la hidrología del tajo                         | R1     |
| Permanencia larga                                                  | Más NOx cuanto más espera                   | Minimizar la permanencia; < 3 días = «corta» como guía                                       | R1     |
| Falta de confinamiento o de alivio en estrato blando               | NOx frecuente en zonas blandas              | Cara libre, menor factor de carga, tiempos que den alivio, voladuras más chicas              | R1     |
| Desensibilización entre taladros o entre decks (presión de muerte) | Taladros muy juntos, desviación, decks      | Separación y tiempos adecuados; control de perforación                                       | R1     |
| Cebo insuficiente o mal ubicado                                    | Producto residual                           | Cebo compatible, ubicado en producto sin diluir                                              | R1     |
| Cordón detonante en el taladro                                     | NOx donde se usa cordón                     | Minimizar el cordón dentro del taladro                                                       | R1     |
| Mezcla con lodo o detritus en el fondo                             | Taladros húmedos                            | Bolsa de gas en el fondo, protectores de collar                                              | R1     |
| Taco que penetra en un producto bombeable                          | Productos fluidos                           | Gasificar antes de tapar; sellar con bolsa                                                   | R1     |
| Mucha carga en un solo evento                                      | Intensidad proporcional a los kg            | Voladuras más pequeñas, menor factor de carga                                                | R1     |
| Mala formulación o calibración del camión                          | NOx en todas las voladuras con ese producto | Calibración, densidad de copa                                                                | R1     |

El OSMRE añade que la presión de muerte por retardos insuficientes entre taladros grandes puede emitir NO₂ [OSMRE-M3 «Millisecond delay»] (R1). Los humos naranja se asocian a permanencia excesiva, agua o mala gasificación `R1 F13, F17 [P2-C34 s21]` (R1).

### 5.3 Escala visual y exposición

- **Escala de humos AEISG:** 0 sin NOx · 1 leve · 2 amarillo-naranja menor · 3 naranja · 4 naranja-rojo · 5 rojo-púrpura [AEISG-NOx App.]. R1.
- **NO₂:** el umbral de olor va de 0,04 a 5 ppm; IDLH 20 ppm; 80 ppm durante 3–5 min causa opresión en el pecho; el edema pulmonar puede ser retardado [AEISG-NOx Tabla 1]. R1.
- **AEGL del NO₂ (ppm) para 10 min / 30 min / 60 min / 4 h / 8 h:** AEGL-1 0,5 en todos; AEGL-2 20 / 15 / 12 / 8,2 / 6,7; AEGL-3 34 / 25 / 20 / 14 / 11 [AEISG-NOx App. 6]. R1.
- **NO:** por debajo de 80 ppm, exposiciones cortas no deberían constituir peligro; para planificar emergencias se usan los AEGL del NO₂ [AEISG-NOx App. 6]. R1.
- **Gestión:** zona de exclusión con la nube a favor del viento; no reingresar hasta que la nube se disipe [AEISG-NOx §7.3.6]. R1.
- **CO:** sale del balance negativo y de la combustión incompleta (R1 F17). El terreno caliente también puede generar CO y H₂S [AEISG-RG §5.4.6]. R1.

---

## 6. Fragmentación (P80 objetivo)

### 6.1 Modelo de la app

Kuz-Ram (FC-26, en R2): X50 = A·(V/Q)^0,8·Q^(1/6)·(115/RWS)^(19/30), con X50 en cm. Curva de Rosin-Rammler con índice de uniformidad n de Cunningham. X80 = X50·(ln 5/ln 2)^(1/n). Swebrec/KCO en FC-27 (R1). El agente pide `get_analysis` y no recalcula a mano.

### 6.2 Factor de roca A (índice de volabilidad de Lilly, adaptado por Cunningham)

A = 0,06·(RMD + JF + RDI + HF), con JF = JPS + JPA. En Cunningham 1987 el JF aparece dos veces por una errata; en 2005 se quitó el término directo y queda A = 0,06·(RMD + RDI + HF) con RMD = JF si hay diaclasas [Cunningham 2005]; [Sanchidrián y Ouchterlony 2017]. R1s. El primer usa la forma de la hoja del curso, R1 F24 `[X-D1 Factor de Roca]`. **[DUDA]** El agente no elige la forma: la que manda es la de la app (FC-26).

| Término                                | Valores                                                                                                                                                                                | Fuente                                        | Estado |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------ |
| RMD (descripción del macizo)           | 10 pulverulento o friable · JF si tiene diaclasas verticales · 50 masivo                                                                                                               | [Cunningham 1987/2005] vía [S&O 2017]; R1 F24 | R1s    |
| JPS (espaciamiento de diaclasas), 2005 | 10 si < 0,1 m · 20 entre 0,1 y 0,3 m · 80 entre 0,3 m y 95 % del menor entre el tamaño de sobretamaño y el de la malla · 50 si es mayor; × 1 junta cerrada, 1,5 abierta, 2 con relleno | [Cunningham 2005] vía [S&O 2017]              | R1s    |
| JPA (ángulo de diaclasas)              | 20 buzando fuera de la cara · 30 rumbo perpendicular · 40 buzando hacia la cara · 10 horizontal (Lilly)                                                                                | idem                                          | R1s    |
| RDI (densidad)                         | 0,025·ρ[kg/m³] − 50 (= 25·SG − 50)                                                                                                                                                     | idem; R1 F24                                  | R1     |
| HF (dureza)                            | E/3 si E < 50 GPa; UCS/5 si E ≥ 50 GPa                                                                                                                                                 | idem; R1 F24                                  | R1     |
| Rango de A                             | ≈ 3–13 (rocas muy blandas a duras homogéneas)                                                                                                                                          | R1 F23 `[P1-S6 p12]`                          | R1     |
| Ejemplo                                | ρ 2,6, E 30 GPa, diaclasas verticales a 0,2 m que buzan fuera de la cara → A = 5,7                                                                                                     | R1 F24                                        | R1     |

**Clases de roca que usa el agente** (para que la conversación sea simple: «continua o fracturada»). Son un mapeo propuesto que el ingeniero debe confirmar (R0 como clasificación; los valores de cada término son R1s):

| Clase            | Descripción oral                             | RMD            | JPS   | Ks de Konya | Explosivo preferente                                                 |
| ---------------- | -------------------------------------------- | -------------- | ----- | ----------- | -------------------------------------------------------------------- |
| `masiva`         | Continua, pocas diaclasas, bloques > malla   | 50             | 50    | 0,95        | Alta VOD y densidad (emulsión, HA rico)                              |
| `fracturada`     | Diaclasada, bloques de 0,1–1 m               | JF = JPS + JPA | 20–80 | 1,10        | Equilibrio choque/gas (HA medio)                                     |
| `muy_fracturada` | Muy fracturada, friable o en bloques < 0,1 m | 10             | 10    | 1,30        | Energía de gas (ANFO o HA bajo); cuidar la fuga de gases y los humos |

Respaldo para el explosivo preferente: R1 F18 y F24 `[V1-02S p7-9; P4-C6 p4]`, roca dura → VOD alta; roca fisurada → energía de gas. R1.

### 6.3 Cómo se mueve el P80

- X50 crece con A y con el diámetro, y baja con el factor de carga Q/V: X50 ∝ (V/Q)^0,8 (FC-26; R1 F23 `[P1-S6 p10]`). R2.
- Apretar la malla (bajar B y S con el mismo Ø) sube Q/V y baja el X50. Subir S/B baja n (curva más abierta). Si S/B > 2, n cae (R1 F23). R1.
- Una desviación de perforación W baja n en un factor (1 − W/B) (R1 F30). R1.
- Retardos entre 1 y 17 ms/ft de burden (≈ 3–56 ms/m) dieron la fragmentación más fina a escala 1:10. Por debajo de 1 ms/ft se comporta como precorte (bloques); por encima de 17 ms/ft las cargas actúan independientes (más grueso) [Stagg 1987]. R1.
- Caso de mina: QA/QC de perforación y accesorios bajaron el P80 de 22,2 a 13,4 cm `R1 F30 [V1-04M p30]`. R1.
- El Kuz-Ram subestima los finos (por eso existen JKMRC y Swebrec) (R1 F23; RM-11). R1.

### 6.4 Objetivos por destino

| Destino                      | Criterio                                                                                                                                         | Fuente                                                           | Estado                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------- |
| Planta o chancadora primaria | Más fino. Referencia de la industria: P80 de alimentación a la primaria entre 200 y 600 mm según el chancador, y 150–250 mm a la entrada del SAG | Webinar de un proveedor (K-Mine)                                 | R0 (fuente comercial) |
| Planta                       | El bloque máximo no debe atorar la chancadora; los bloques > 1 m suelen requerir reducción secundaria                                            | idem                                                             | R0                    |
| Botadero (desmonte)          | Más grueso: el límite lo pone la cuchara de la pala o el cargador (bolones y excavabilidad), no la planta                                        | Práctica; R1 F20 (pila apretada para pala, suelta para cargador) | R0                    |
| Stock (blending)             | Igual que planta si se reprocesa                                                                                                                 | Práctica                                                         | R0                    |
| Mine-to-mill                 | Una voladura de mayor energía subió hasta 15 % el rendimiento del SAG (Porgera)                                                                  | [Porgera, onemine]                                               | R1s                   |

**El P80 objetivo lo da el ingeniero o la planta.** El agente no inventa una cifra: pregunta el tamaño de admisión de la chancadora o el P80 deseado y, si no hay dato, lo deja como parámetro.

### 6.5 Voladura mixta (mineral y desmonte): submalla

- Dentro del polígono, cada zona de mineral recibe su propia malla más apretada o una carga mayor (submalla), y la de desmonte, una malla más abierta. El agente propone el **mismo Ø con distinta carga** o **distinto esquema con la misma carga por taladro**, que son las dos opciones del curso ante cambios litológicos `R1 F24 [P4-C6 p4; P1-S5 p22-25]` (R1).
- La frontera entre submallas se dibuja respetando el contacto de leyes del modelo de bloques; la secuencia mueve el mineral sin cruzar al desmonte (§9). Para la regla de transición (filas de ajuste) no se encontró fuente: queda en R0.

---

## 7. Factor de carga y energía

| Indicador   | Referencias                                                                                | Fuente                            | Estado |
| ----------- | ------------------------------------------------------------------------------------------ | --------------------------------- | ------ |
| FC (kg/m³)  | Carbón 0,2 · esquisto 0,3 · arenisca 0,5 · basalto fracturado 0,4 · granito resistente 0,8 | R1 F08 `[P4-C4 p6]`; FC-13        | R1     |
| PF (kg/t)   | Mina de roca dura: 0,37 → 0,58 al apretar de 7 × 8 a 5,5 × 6,5; otro proyecto 0,18–0,24    | R1 F08 `[V1-04M p24, p30]`; FC-14 | R1     |
| FE (MJ/t)   | 0,66–0,87 en un caso de mina                                                               | R1 F08; FC-15                     | R1     |
| Advertencia | El FC solo no basta: dos mallas con el mismo FC pueden diferir 15 % en energía             | R1 F08 `[P4-C6 p25]`              | R1     |

---

## 8. Amarre, retardos y tiros cortados

### 8.1 Tiempos guía

| Regla                               | Valor guía                                                                                                    | Fuente                               | Estado            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------- |
| Entre taladros (pirotécnico)        | 3–9 ms por m de espaciamiento                                                                                 | R1 F20 `[P4-C5 p19-20]`; DF-19 (3–8) | R1 / R0 en la app |
| Entre filas (pirotécnico)           | 10–15 ms por m de burden (3 en condiciones adversas); en la app, 6–12                                         | R1 F20; DF-19                        | R1 / R0 en la app |
| Burden de alivio                    | 15–20 ms/m en roca dura; 20–25 en media o blanda; 30–40 en contornos                                          | R1 F20 `[P4-C5 p30]`                 | R1                |
| Pila según equipo                   | Apretada 6–12 ms/m (pala); suelta 12–30 ms/m (cargador); < 6 ms/m, sobreexcavación                            | R1 F20 `[P5 p69-71]`                 | R1                |
| Entre filas frente a entre taladros | Entre filas ≥ 2–3 veces el retardo entre taladros                                                             | R1 F20 `[P5 p67]`                    | R1                |
| Extremos                            | Entre filas > 150 ms puede perder confinamiento; < 35 ms expulsa el taco (proyección)                         | R1 F20/F27 `[P5 p77-80]`             | R1                |
| Roca                                | Fracturada o estructurada: ≤ 60 ms entre filas; blanda: ≥ 75 ms                                               | R1 F20 `[P5 p72]`                    | R1                |
| Hagan                               | Entre taladros, rara vez < 4 ms/m de burden; entre filas, 4–8 ms/m de burden efectivo                         | [Hagan 1977]                         | R1                |
| OSMRE                               | Regla conservadora: 2 ms/ft de burden (≈ 6,6 ms/m) para máxima fragmentación                                  | [OSMRE-M3]                           | R1                |
| Ventana de coincidencia             | 8 ms, semiabierta [t, t + 8): define la MIC                                                                   | FC-23, DF-12; [30 CFR 816.67(d)(3)]  | R3                |
| Dispersión                          | Pirotécnico 1–5 % (hasta 7 % en baja precisión); electrónico 0,01 %                                           | R1 F22; DF-15                        | R1                |
| Burden efectivo                     | Distancia a la cara abierta en el instante del disparo (FC-22); alivio mínimo de 3 ms por m de burden (DF-21) | FC-22, DF-21                         | R3 / R0           |
| Orden invertido                     | Un vecino más cerca de la cara que sale después: aviso                                                        | CK-10                                | R0                |

### 8.2 Tiros cortados (cut-offs)

**Mecanismo.** El movimiento de la roca o la onda de un taladro que ya salió desplaza o corta la línea de superficie, el tubo de choque o la propia columna de un vecino antes de que su señal haya llegado. Resultado: explosivo sin detonar en la pila. Es muy peligroso al excavar y genera humos [DN-NONEL p47]; R1 §2.4 n.º 75. R1.

**Datos físicos.** La fragmentación ocurre entre 5 y 15 ms después de la detonación. La roca sale a 15–30 m/s (50–100 ft/s), es decir, 0,15–0,3 m cada 10 ms [OSMRE-M3]. R1.

| Regla de prevención                                                                                                                                                                                                             | Fuente                                           | Estado |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| Diseñar para que todos (o el máximo posible) los retardos de superficie se hayan encendido antes de que empiece el movimiento de terreno. Si no se puede, que los no encendidos queden lo más lejos posible del punto de inicio | [DN-SL]                                          | R1     |
| Usar retardo en el taladro (p. ej. 500 ms de fondo con 17–176 ms en superficie): el taladro detona después de que el frente de encendido de superficie ya avanzó, por lo que es más difícil cortarlo                            | [DN-NONEL p48]; R1 F22                           | R1     |
| Sin retardo en el taladro: no superar 1 ms por cada 30 cm de espaciamiento entre taladros (1 ms/ft; 3 m → ≤ 10 ms, 6 m → ≤ 20 ms)                                                                                               | [DN-NONEL p47]                                   | R1     |
| Ubicar el conector de retardo junto al taladro o fila que retarda; cubrir los bloques de conexión con detritus                                                                                                                  | [DN-NONEL pp. 47, 70-75]                         | R1     |
| Compromiso: retardos de superficie largos → frente de encendido corto → más cortes; retardos de fondo largos → la dispersión pirotécnica puede invertir el orden                                                                | [IM 2017, EDD]; R1 F22                           | R1s    |
| Electrónicos: todos los detonadores reciben la señal antes del primer disparo, lo que elimina el corte de línea, aunque no la desensibilización o el corte de la columna por movimiento                                         | R1 F22 (dispersión); principio de funcionamiento | R0     |

**Chequeo propuesto para la app** (R0; se calcula con los tiempos de `FC-21`): para cada taladro _i_ que detona en t_det,i, todos los taladros _j_ dentro de un radio de influencia (propuesto: 2–3 B o 2 filas; sin fuente) deben tener su detonador de fondo **ya encendido**, es decir, t_sup,j < t_det,i. Si no, se marca riesgo de corte. El margen ≥ 2–3 filas es práctica corriente sin fuente localizada (R0).

### 8.3 Secuencia y dirección

- Las isócronas van lo más paralelas posible a la cara libre. La fila de inicio es perpendicular a la dirección de desplazamiento deseada `R1 F21 [P4-C5 p29; P5 p75]`. R1.
- Retardos cortos entre taladros y largos entre filas → más desplazamiento y lanzamiento. Al revés, menos `R1 F21 [P4-C7 p16]`. R1.
- Con disparos en varios bancos, sale primero el inferior `R1 F21 [P4-C8 p8]`. R1.
- El amarre decide el desplazamiento (RM-20, R1; Yang y Kavetsky 1990; Zhang et al. 2021).

---

## 9. Esponjamiento, desplazamiento y dilución

| Regla                                                                 | Valor                                                                                          | Fuente              | Estado                  |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------- | ----------------------- |
| Esponjamiento V_suelto/V_in situ                                      | 1,5 por defecto (típico 1,35–1,6; la pila recién volada suele quedar en 1,2–1,5)               | FC-41               | R1                      |
| Ángulo de reposo                                                      | 37° (34–37° en material seco)                                                                  | FC-42               | R1                      |
| Velocidad de cara (Richards & Moore)                                  | V0 = k·(√m/B)^1,3; k 13,5 en roca competente blanda, 27 en dura                                | FC-45               | R1                      |
| Modelo de pila de la app                                              | Bloques que salen normal a la superficie libre al detonar su taladro, en tiro parabólico       | FC-39, FC-37, FC-43 | R1/R0                   |
| Desplazamiento medido (ejemplo)                                       | Banco de 7,5 m (Husab): techo del mineral 6,6–9,2 m en horizontal; base 3,2–4,0 m              | [Husab 2024]        | R1s (solo de ese sitio) |
| Pérdida de mineral teórica sin corregir por movimiento                | 9–24 % según la orientación de los polígonos de mineral respecto de la dirección de movimiento | [Thornton 2009]     | R1s                     |
| El material se mueve hacia donde hay menos resistencia: la cara libre | [Husab 2024]; R1 F21                                                                           | R1s                 |

**Uso en el agente.** El modelo de bloques de 10 × 10 × 15 m se subdivide en sub-bloques. La app (pila por bloques, FC-39) rastrea dónde cae cada sub-bloque y lo devuelve a su bloque padre para asignar el destino (planta, stock o botadero). El agente debe:

1. Preguntar los destinos y la geometría de mineral y desmonte.
2. Proponer una dirección de salida que **no cruce** el mineral hacia el desmonte. Lo ideal es mover en paralelo al contacto o desde el desmonte hacia afuera, para que el mineral quede compacto.
3. Pedir a la app la pila resultante y la mezcla por destino antes de afirmar nada.

Todo lo cuantitativo (k, n, alcance) sale de la app y está en R0/R1 de calibración.

---

## 10. Vibración (PPV) y carga máxima por retardo

### 10.1 Leyes (las calcula la app)

- Campo lejano: PPV = K·(R/√Q)^(−β); Q admisible = (R/SD_adm)² (FC-24, FC-25, en R3). K y β son **del sitio**; los defaults de la app (K = 1,14 m/s, β = 1,6) están en R0 (CT-04).
- Campo cercano: Holmberg–Persson (FC-28), daño por bandas de ¼, 1, 4 y 8 veces el VPPc (FC-33).
- Distancia escalada de cubo para la proyección (SDOB) ≠ de raíz cuadrada para la vibración (RM-08).

### 10.2 Límites de referencia (configurables por estructura, DF-14)

| Receptor                                               | Límite                                                                                                                                                     | Fuente                                       | Estado                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| Vivienda, revoque sobre listones (baja frecuencia)     | 12,7 mm/s (0,5 in/s)                                                                                                                                       | [USBM RI 8507]                               | R1s                                                                              |
| Vivienda, drywall moderno (baja frecuencia)            | 19 mm/s (0,75 in/s)                                                                                                                                        | [USBM RI 8507]                               | R1s                                                                              |
| Cualquier vivienda, f > 40 Hz                          | 50,8 mm/s (2,0 in/s)                                                                                                                                       | [USBM RI 8507]                               | R1s                                                                              |
| Curva USBM                                             | 4,8 mm/s a 1 Hz → 12,7 mm/s entre 2,7 y 10 Hz → 50,8 mm/s desde 40 Hz                                                                                      | [USBM RI 8507, App. B]                       | R1s                                                                              |
| Regulación OSMRE (EE. UU.) por distancia               | 0–300 ft (0–91 m): 31,75 mm/s · 301–5000 ft (92–1524 m): 25,4 mm/s · > 5000 ft: 19,05 mm/s                                                                 | [30 CFR 816.67(d)(2)]                        | R1                                                                               |
| Distancia escalada sin monitoreo (OSMRE)               | Ds = 50 / 55 / 65 ft/lb^½ (≈ 22,6 / 24,9 / 29,4 m/kg^½) para las mismas bandas; W = (D/Ds)² por cada 8 ms                                                  | [30 CFR 816.67(d)(3)]                        | R1                                                                               |
| DIN 4150-3 (1999), fundación, 1–10 / 10–50 / 50–100 Hz | Comercial e industrial 20 / 20–40 / 40–50 mm/s · viviendas 5 / 5–15 / 15–20 · sensibles o patrimonio 3 / 3–8 / 8–10                                        | [DIN 4150-3:1999 Tabla 1] vía [BigBuild VIC] | R1s (valores de estructuras sensibles sin confirmar; existe la revisión de 2016) |
| DIN 4150-3, piso superior                              | 40 / 15 / 8 mm/s                                                                                                                                           | idem                                         | R1s                                                                              |
| Roca intacta (talud, campo cercano)                    | < 254 mm/s sin fracturas; 254–635 mm/s, descostramiento ligero por tracción; 635–2540 mm/s, agrietamiento fuerte y radial; > 2540 mm/s, el macizo se rompe | [Bauer y Calder 1978] vía [Shahrood JME]     | R1s                                                                              |
| Caso de mina (talud)                                   | VPPc = 3110 mm/s; criterio de daño ¼·VPPc = 777,5 mm/s                                                                                                     | R1 F25 `[V1-04M p24]`; FC-33                 | R1                                                                               |
| Onda aérea (OSMRE)                                     | 134 / 133 / 129 dB lineal pico (según la frecuencia de corte del equipo: 0,1 / 2 / 6 Hz); 105 dBC                                                          | [30 CFR 816.67(b)]                           | R1                                                                               |

**Regla del agente.** El límite que vale es el del **EIA o la autorización de la operación** (DF-14: el valor de demostración de la app es 10 mm/s y no es norma). El agente pregunta qué límite aplica y su fuente. Con ese límite, la app calcula la MIC admisible (FC-25) y el agente propone retardos taladro a taladro o decks hasta cumplir.

**Palancas contra la vibración:** menos kg por retardo (decks, retardo por deck, menor Ø), más tiempo entre cargas (> 8 ms, electrónicos), precorte como filtro y salida alejada del receptor (R1 F25; FC-23).

---

## 11. Proyección (flyrock) y onda aérea

| Regla                                | Valor guía                                                                                                                                           | Fuente                                  | Estado |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------ |
| Taco mínimo                          | ≥ 0,7·B (aviso si es menor); rango 0,7–1,3·B o 15–25·Ø                                                                                               | CK-02; [OSMRE-M3]                       | R1     |
| Material del taco                    | Anguloso; tamaño ≈ 0,05·Ø (Konya) a 0,15·Ø (Atlas), es decir, ≈ 0,1·Ø; 6–14 mm para Ø 50–130 mm                                                      | R1 F06 `[P4-C4 p5]`; RM-04              | R1     |
| No usar agua como taco en superficie | —                                                                                                                                                    | RM-01                                   | R1     |
| SDOB (Chiappetta), cortes en m/kg^⅓  | < 0,62 cráter violento · 0,62–0,92 incontrolado · 0,92–1,44 controlado · 1,44–1,84 muy controlado (sin proyección) · > 1,84 sin efecto en superficie | FC-18, FC-34                            | R3     |
| Avisos de la app                     | SD < 0,4 severo; < 1,2 bajo (configurables)                                                                                                          | CK-08, DF-20                            | R1/R0  |
| Lundborg (envolvente máxima)         | L_max [m] = 260·d^(2/3), fragmento T [m] = 0,1·d^(2/3), con d en pulgadas                                                                            | FC-29                                   | R1     |
| Richards & Moore                     | Frente: L = (k²/g)·(√m/B)^2,6 · cráter: igual con el taco en lugar de B · _rifling_: × sen 2θ; k = 13,5 (blanda) a 27 (dura), calibrar en sitio      | FC-45; [R&M 2004] vía [ReTII], [Maptek] | R1s    |
| Factor de seguridad                  | Algunos programas lo aplican a la distancia (2D) o a la velocidad (3D): no son equivalentes                                                          | [Maptek BlastLogic]                     | R1     |
| Desviación del modelo                | En un sitio, R&M se desvió 69–93 % del alcance medido: hay que calibrar                                                                              | [ReTII/UNP]                             | R1s    |
| Retardo entre filas < 35 ms          | Expulsa el taco                                                                                                                                      | R1 F20 `[P5 p77]`                       | R1     |
| Causas                               | Burden reducido en la cara, taco corto, secuencia invertida, simpatía, cordón expuesto                                                               | R1 F27 `[P4-C5 p9]`                     | R1     |
| Onda aérea                           | Ley de cubo P = k·(R/W^⅓)^(−β), β 1,2–1,5; crece con taco insuficiente o cordón expuesto                                                             | FC-30; R1 §2.5 n.º 82                   | R1     |

---

## 12. Lista de verificación del agente antes de entregar un diseño

1. Entrevista completa (§1). Lo que falte queda como parámetro marcado «sin dato».
2. Clase de roca → factor de roca y escala de malla (§2, §6). Luego `generate_pattern` y la verificación de rigidez (CK-01) y S/B.
3. Agua → producto (§3). Lo valida el aviso `waterIncompatible`.
4. Terreno reactivo o caliente → solo inhibido; permanencia según ensayo; iniciadores ≤ 70 °C (§4).
5. Precorte (≥ 100 ms antes o voladura aparte), buffer de 0,5–0,8 de la malla de producción y taco de 0,7·B (§2).
6. Tiempos dentro de la guía (§8.1), sin orden invertido (CK-10) y con el chequeo de corte (§8.2).
7. MIC y PPV dentro del límite del receptor (§10); SDOB y taco (§11).
8. Riesgo de NOx: agua, permanencia, confinamiento (§5).
9. Dirección de salida y destino por bloque (§9).
10. Informar **solo** los números que devuelven las herramientas. Decir qué es guía (R0/R1) y pedir confirmación al ingeniero.

---

## 13. Fuentes

**Del proyecto**

- `docs/theory/references/R1-MINING-PRIMER.md` (fichas F01–F30 y claves del curso P1–P5, V1–V2, X-…).
- `docs/theory/02-CALCULATION-SPEC.md`; `docs/RULES.md` (RM, FC, CK, DF, CT).

**Externas** (consultadas el 09/10/2026 salvo indicación)

- **[AEISG-RG]** AEISG, _Code of Practice: Elevated Temperature and Reactive Ground_, Ed. 5, abril de 2020. https://www.aeisg.org.au/wp-content/uploads/ELEVATED-TEMPERATURE-AND-REACTIVE-GROUND-COP-EDITION-5-APRIL-2020-1.pdf (Ed. 4, 2017: https://www.worksafe.wa.gov.au/system/files/documents/2024-12/aeisg_elevated_temp_reactive_grnd_cop_ed4__march17.pdf)
- **[AEISG-NOx]** AEISG, _Code of Good Practice: Prevention and Management of Blast Generated NOx Gases in Surface Blasting_, Ed. 2, agosto de 2011. https://www.worksafe.wa.gov.au/system/files/documents/2024-12/aeisg_cop_nox_edition_02aug2011.pdf
- **[DN-NONEL]** Dyno Nobel, _Product Application Manual: NONEL® & PRIMACORD®_, marzo de 2011, pp. 47-48. https://www.dynonobel.com/siteassets/resource-hub/product-application-guides/41160-nonelprimacord-manual.pdf
- **[DN-SL]** Dyno Nobel, ficha técnica NONEL® SL. https://www.dynonobel.lat/globalassets/dyno-nobel-shared-assets/resource-hub/technical-information/north-america/initiation-systems/nonel/sl.pdf
- **[DN-TITAN]** Dyno Nobel, fichas TITAN 2000/3000/5000. https://dynonobel.com.au/siteassets/product-hub/tech-info/titan-3000-matrix.pdf · https://dynonobel.com.au/siteassets/product-hub/tech-info/titan-5000-matrix.pdf
- **[OSMRE-M3]** OSMRE, Blaster Training, _Module 3: Surface-Blast Design_. https://www.osmre.gov/sites/default/files/inline-files/Module3_0.pdf
- **[30 CFR 816.67]** EE. UU., _Use of explosives: control of adverse effects_. https://www.law.cornell.edu/cfr/text/30/816.67
- **[USBM RI 8507]** Siskind, Stagg, Kopp y Dowding (1980), _Structure Response and Damage Produced by Ground Vibration from Surface Mine Blasting_. Cifras tomadas de resúmenes: https://www.omnidots.com/en/blog/isee/usbm-guidelines-for-structural-safety · https://sahris.sahra.org.za/sites/default/files/additionaldocs/Appendix%20M%20Vibration%20and%20Blasting_0.pdf
- **[DIN 4150-3]** DIN 4150-3:1999 (revisada en 2016), _Erschütterungen im Bauwesen – Teil 3_. Tabla reproducida en https://bigbuild.vic.gov.au/__data/assets/pdf_file/0019/51076/MT-Technical-Appendix-I-Noise-and-Vibration-Appendix-E.pdf
- **[FHWA 3.6]** FHWA, _Context Sensitive Rock Slope Design_, cap. 3.6 (voladura controlada). https://www.fhwa.dot.gov/clas/ctip/context_sensitive_rock_slope_design/ch_3_6.aspx
- **[Konya, Rock Products 2016]** C. J. y A. Konya, «Precision presplitting design aspects». https://rockproducts.com/2016/06/13/precision-presplitting-design-aspects/
- **[Austin Powder]** _Blaster's Guide_ (precorte W = D²/28). https://austinpowder.com/canada/blasters-guide/
- **[911M-CB]** 911Metallurgist, «Controlled blasting» (l = 90·d²). https://www.911metallurgist.com/blog/controlled-blasting/
- **[Stagg 1987]** M. S. Stagg, «Influence of blast delay time on rock fragmentation: one-tenth scale tests», _Int. J. Surface Mining_ 1(4):215-222. https://stacks.cdc.gov/view/cdc/219777
- **[Hagan 1977]** T. N. Hagan, «Good delay timing: prerequisite of efficient bench blasts», _AusIMM Proceedings_ 1977. https://www.ausimm.com/publications/conference-proceedings/the-ausimm-proceedings-1977/good-delay-timing-prerequisite-of-efficient-bench-blasts/
- **[Cunningham 1987/2005]** C. V. B. Cunningham, «Fragmentation estimations and the Kuz-Ram model – four years on» (2nd FRAGBLAST, 1987) y «The Kuz-Ram fragmentation model – 20 years on» (Brighton Conference, EFEE 2005). Valores tomados de **[S&O 2017]**: Sanchidrián y Ouchterlony, _Rock Mech. Rock Eng._ (2017). https://link.springer.com/article/10.1007/s00603-016-1131-9
- **[Bauer y Calder 1978]** _Open pit and blast seminar_, Queen's University. Tabla tomada de https://jme.shahroodut.ac.ir/article_3257_29e54d6a0c50bb063a959d746d86a3ce.pdf
- **[R&M 2004]** Richards y Moore, «Flyrock control – by chance or design», ISEE 2004. https://www.onemine.org/documents/flyrock-control-by-chance-or-design ; ecuaciones en https://journal.itny.ac.id/index.php/ReTII/article/download/5413/1980 ; uso en software: https://help.maptek.com/blastlogic/2025.2/topics/menus-and-tools/analysis/Modelling/modelling-fly-rock-modelling.htm
- **[PSU-MNG230 8.2.1]** Penn State, _Mixing ANFO and the Oxygen Balance_. https://courses.ems.psu.edu/mng230/node/685
- **[LAPSE 2023]** Mezclas de AN con combustibles orgánicos (BO de ANFO 94/6). https://psecommunity.org/wp-content/plugins/wpor/includes/file/2305/LAPSE-2023.35496-1v1.pdf
- **[NIOSH-NOx]** Sapko et al., «Chemical and physical factors that influence NOx production during blasting – exploratory study» (NIOSH/ISEE). https://onemine.org/documents/chemical-and-physical-factors-that-influence-nox-production-during-blasting-exploratory-study
- **[Thornton 2009]** «The implications of blast-induced movement to grade control», 7th Int. Mining Geology Conf., AusIMM. https://www.ausimm.com/publications/conference-proceedings/seventh-international-mining-geology-conference-2009/the-implications-of-blast-induced-movement-to-grade-control
- **[Husab 2024]** _Blasting_ 41(3):104 (movimiento medido en Husab). https://www.researching.cn/articles/OJ1bf9eefff7409031
- **[IM 2017, EDD]** International Mining, «Blasters realising value of longer delays allowed by EDDs». https://im-mining.com/2017/08/17/blasters-realising-value-longer-delays-allowed-edds/
- **[Porgera]** «Implementation of Mine to Mill blast optimisation at Porgera Gold Mine». https://onemine.org/documents/implementation-of-mine-to-mill-blast-optimisation-at-porgera-gold-mine
- **[K-Mine]** Webinar «Fragmentation by the numbers» (fuente comercial, R0). https://k-mine.com/streams/fragmentation-by-the-numbers-how-blast-design-creates-real-plant-value

**Libros de referencia no consultados directamente** (para subir de R1s a R1 al contrastar): ISEE _Blasters' Handbook_ (18.ª ed.); Persson, Holmberg y Lee, _Rock Blasting and Explosives Engineering_ (1994); Konya y Walter, _Surface Blast Design_ (1990); SME _Mining Engineering Handbook_; manuales técnicos de Orica y Enaex.

## 14. Pendientes y sin fuente

- Distancia entre el precorte y el buffer (0,4–0,6 B): solo una presentación (R0).
- Regla de «filas por delante» del frente de encendido contra los cortes: sin fuente primaria. Dyno Nobel solo pide que se enciendan todos los retardos antes del movimiento (R1).
- P80 objetivo para la chancadora y relación con la boca de admisión: solo una fuente comercial (R0).
- Diámetro crítico del ANFO: sin cifra en las fuentes leídas.
- DIN 4150-3, valores para estructuras sensibles de 1–50 Hz: sin confirmar en la edición vigente.
- Forma de A en Cunningham 1987 frente a 2005 (JF duplicado): decidir con el ingeniero cuál usa FC-26 (ver P-08).
- Tabla de Konya de constantes de tiempo TH/TR por tipo de roca: no se incluyó por no haber podido verificarla.
- Reglas de transición entre submallas de mineral y desmonte: sin fuente (R0).
