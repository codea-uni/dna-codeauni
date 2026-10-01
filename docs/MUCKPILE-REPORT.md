# Informe: desplazamiento de la masa en «Banco sobre topografía (completo)»

**Fecha:** 2026-09-30 · **Hito:** A7 (pila de material, D-17) · **Proyecto:** ejemplo `topoSector`, «Demo · Banco sobre topografía (completo)», voladura «Banco 3385 · Sector Sur».

Este documento registra la matemática que usa Cronos para calcular la voladura y el desplazamiento de la masa. También registra el proceso que llevó a explicar por qué, en este proyecto de **dos escalones**, el lado derecho (Este) de la pila sale mucho más lejos que el resto. Todos los números se reprodujeron con el código (ver §8) y los pasos a mano se verificaron contra él.

---

## 0. Conclusión en corto

- **El lado derecho sale lejos por un solo taladro.** El taladro **1** (Este, primera fila) quedó a **2,24 m** de la cresta. Su burden efectivo es 2,24 m frente a los 6 m de diseño, porque las filas de la malla son rectas y la cresta es curva: en ese extremo se mete 5 m hacia el Sur.
- **La velocidad sale el doble y el vuelo, el triple.** Con la velocidad de burden de Zhang (v ∝ 1/B), el taladro 1 sale a **44,3 m/s**, contra ≈ 19 m/s de un taladro típico del frente. Además vuela **por encima del banco 3370** (el segundo escalón) y cae al nivel 3355, 15 m más abajo: vuela 4,5 s en lugar de 2,8 s. Velocidad y caída se multiplican: su bloque más lejano llega a **186 m**, contra 40–66 m en el resto del frente.
- **Es poco material, pero es una alarma.** El taladro 1 mueve el **1 %** del volumen, y el **84 %** de la masa se desplaza menos de 10 m. La pila «larga» del Este es una lengua delgada. Aun así es una señal real de diseño: un taladro de 229 mm con 447 kg y 2,24 m de burden frontal es riesgo de reventón de cara y proyección. La revisión del diseño ya lo marca («Alivio muy cercano») y las flechas de A5 le dan un alcance de 147 m.
- **Sus tres vecinos no se mueven, y eso es un defecto del modelo.** Los taladros **2, 3 y 4** están todavía más cerca de la cresta (1,44, 0,76 y 0,27 m) y el modelo no los mueve: quedan fuera de la validez de Zhang (B/Ø < 7, supuesto S-09) y se tratan como «sin velocidad». Queda como pregunta abierta **P-23**.
- **Durante el análisis aparecieron y se corrigieron dos errores:**
  - el perímetro «Próxima voladura · banco 3370», sin taladros, se estaba volando;
  - fuera del levantamiento el terreno se suponía a la cota del piso (3370) y no a la del banco de abajo (3355).

---

## 1. El proyecto: dos escalones

| Dato                  | Valor                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terreno               | Talud de 3 bancos con topografía (TIN del levantamiento «Sector Sur · dron», 2026-09-20): niveles 3400 → 3385 → 3370 → 3355 hacia el Norte        |
| Voladura              | Banco 3385: techo en el terreno (≈ 3385,4), **piso 3370**, H = 15 m, cara a 70°                                                                   |
| Perímetro 1           | Del pie de la cara de arriba (+6 m) a la **cresta** del banco (cara libre: 12 aristas al Norte, sobre la cresta)                                  |
| Perímetro 2           | «Próxima voladura · banco 3370», piso 3355, **sin taladros** (el escalón de abajo)                                                                |
| Malla                 | Tresbolillo B = 6 m, S = 7 m, Ø 229 mm, J = 1,5 m; 7 filas; **107 taladros**                                                                      |
| Carga (producción)    | Fondo 3 m de ANFO pesado 30/70 + columna de ANFO + taco 4,5 m + booster 450 g; buffer (2 filas del fondo): ANFO y taco 5 m                        |
| Amarre                | Nonel: fondo 500 ms, superficie 17 ms entre taladros y 42 ms entre filas, **salida en V** (el primer disparo es el taladro 3, en el extremo Este) |
| Roca                  | Pórfido, ρ_r = 2650 kg/m³, UCS 120 MPa, E 45 GPa                                                                                                  |
| Totales               | 46,3 t de explosivo; factor de carga 0,678 kg/m³; factor de potencia 0,256 kg/t; disparo de 500 a 973 ms                                          |
| Parámetros de la pila | Zhang; lanzamiento 10° (pie) → 30° (cresta); esponjamiento 1,5; reposo 37°; bloque 1,5 m; taco ×0,5; piso ×0,7; λ = 0,2; k fila = 0,7             |

**Los dos escalones importan.** Delante de la cresta del banco 3385 está el banco 3370, una franja de ≈ 20 m que es el perímetro 2. Después viene la cara que baja a 3355. El material lento cae sobre el banco 3370. El rápido lo salta y cae al 3355, con 15 m más de caída y por eso más vuelo.

---

## 2. La matemática, paso a paso

Unidades SI internas (m, kg, s, rad, J/kg, kg/m³). Entre paréntesis va la regla de `docs/RULES.md` y su estado R0–R4. Los ejemplos numéricos son del taladro 1 y del taladro 14, un taladro típico del centro del frente.

### 2.1 Carga por taladro (FC-10, FC-12: R3)

Densidad lineal de carga (π/4 exacto) y masa de cada tramo:

```
DCL = (π/4)·Ø²·ρ_e            Q = Σ DCL_i · L_i
```

Taladro 1: L = 16,92 m. Tramos desde la boca: taco 0–4,50 m, ANFO 4,50–13,92 m (9,42 m) y ANFO pesado 13,92–16,92 m (3,00 m).

```
(π/4)·0,229² = 0,041187 m²
ANFO:          0,041187 · 800  = 32,95 kg/m · 9,42 m = 310,4 kg
ANFO pesado:   0,041187 · 1100 = 45,31 kg/m · 3,00 m = 135,9 kg
Q_explosivo = 446,1 kg  (+ 0,45 kg de booster = 446,6 kg)
```

### 2.2 Tiempo de detonación (FC-21…23: R3)

Es el camino más corto (Dijkstra) por el amarre de superficie más el retardo de fondo: t = t_superficie + 500 ms.

La V arranca en el taladro 3 (500 ms). Sus vecinos de fila 2 y 4 salen a 517 ms y el taladro 1 a 534 ms (dos conectores de 17 ms). El último taladro dispara a 973 ms.

### 2.3 Burden efectivo y dirección de salida (FC-22, P-16: R3)

Para cada taladro, en el instante en que dispara, se mide la distancia a la **superficie libre más cercana**. Las candidatas son dos:

- la cara libre dibujada (las aristas de la cresta);
- el frente que dejaron los taladros que dispararon al menos `reliefRate`·B antes (3 ms/m × 6 m = 18 ms). Ese frente se aproxima con el segmento entre el taladro detonado más cercano y su vecino detonado.

```
B_ef = min( dist(boca, cara libre), dist(boca, frente detonado) )
u    = vector unitario en planta desde la boca hacia ese punto  (dirección de salida)
```

Taladro 1: nada disparó antes cerca de él, así que B_ef = distancia a la cresta = **2,24 m** y u = (−0,007; 1,000), hacia el Norte.
Taladro 14: B_ef = 5,24 m y u = (0,118; 0,993).

**Por eso la secuencia manda:** si otro amarre deja a un taladro aliviado por su vecino, u apunta hacia ese vecino y la masa se abre hacia ese lado. En el test del ejemplo «Pila de material», salir desde el Oeste o desde el Este invierte el sentido lateral.

### 2.4 Velocidad inicial por taladro: Zhang, Chi & Yi (2021) (FC-36: R3)

```
v_B = √[ π·c_B·ρ_e·e_e·c_e / (2·ρ_r·tan θ) ] · (d / B_ef)
```

con c_B = 0,12, θ = 45° y c_e = L_carga/H. ρ_e y e_e son promedios ponderados por masa. Validez: carga acoplada y **B/Ø ≥ 7** (S-09).

Taladro 1: ρ_e = 446,1 / (0,041187 · 12,42) = 872 kg/m³; e_e = (310,4·3,70 + 135,9·3,55)/446,3 = 3,654 MJ/kg; c_e = 12,42/15 = 0,828.

```
π·0,12·872·3,654e6·0,828 / (2·2650·1) = 187 781      √ = 433,3 m/s
Taladro 1:   v = 433,3 · 0,229/2,24 = 44,3 m/s     (B/Ø = 9,8 ≥ 7: válido)
Taladro 14:  v = 433,3 · 0,229/5,24 = 18,9 m/s
Taladro 21:  v = 433,3 · 0,229/4,42 = 22,4 m/s     (extremo Oeste: la cresta también se acerca)
Taladros 2, 3, 4: B/Ø = 6,3; 3,3; 1,2 < 7 → fuera de validez → sin velocidad
```

La relación clave es **v ∝ 1/B_ef**: con la mitad de burden, el doble de velocidad.

Las otras dos leyes, intercambiables en el panel, se describen en `core/src/muckpile/README.md`:

- v₀ = k·(Q^⅓/B)^n (FC-40, R0);
- V₀ = k·(√m/B)^1,3 (Richards & Moore 2004, FC-45, R1).

### 2.5 Reducción por fila (FC-37: R0)

```
v_taladro = v · k^(fila − 1),   k = 0,7,   fila = max(1, ⌊dist_cara/B_nominal + ½⌋)
```

Los taladros 1, 14 y 21 son fila 1, así que no se reducen. La 7.ª fila sale con 0,7⁶ = 0,12 de su velocidad: casi no se mueve.

### 2.6 Discretización en bloques (FC-39, S-19)

1. Cada perímetro **con taladros cargados** se cubre con celdas de 1,5 m, recortadas con el polígono para que el área sea exacta en el borde.
2. Cada columna va del piso (3370) al techo del terreno (TIN) y se parte en capas de ≈ 1,5 m: 21 499 bloques y **70 750 m³** in situ.
3. Cada bloque se asigna al taladro cuyo **eje** queda más cerca en planta a la cota del bloque (Voronoi 3D).

### 2.7 Velocidad de cada bloque (FC-43: R0, S-21)

```
v_bloque = v_taladro · [0,5 si está sobre el tope de la carga] · [0,7 si es la capa del piso] · e^(−0,2·r/B)
α        = 10° + (30° − 10°) · z_rel          (z_rel = altura relativa en el banco)
v₀       = v_bloque · (cos α·u_x, cos α·u_y, sin α)
```

Bloque más lejano del taladro 1: centro en (184,3; 81,8; 3380,17), a r = 1,57 m del eje y bajo el tope de la carga (3380,9).

```
factor = e^(−0,2·1,57/6) = 0,949    →  v = 44,33·0,949 = 42,08 m/s
z_rel  = 0,65                        →  α = 10 + 20·0,65 = 23,0°
v_h = 42,08·cos 23° = 38,74 m/s      v_z = 42,08·sin 23° = 16,44 m/s
```

### 2.8 Tiro parabólico e impacto (FC-39)

```
x(t) = x₀ + v_x t        y(t) = y₀ + v_y t        z(t) = z₀ + v_z t − ½ g t²     (g = 9,80665)
```

La trayectoria se sigue en pasos de ≤ ½ celda hasta cortar la superficie **actual** (terreno + material ya depositado) mientras baja, y el corte se refina por bisección. Sobre un terreno a cota z_c, el tiempo de vuelo cerrado es:

```
t = [ v_z + √(v_z² + 2 g (z₀ − z_c)) ] / g
```

| Bloque (taladro)   | z₀     | Cae a z_c            | t de vuelo | Alcance v_h·t | Impacto (Norte) | Posición final | Desplazamiento |
| ------------------ | ------ | -------------------- | ---------- | ------------- | --------------- | -------------- | -------------- |
| 1 (Este, B 2,24 m) | 3380,2 | 3355,5 (2.º escalón) | 4,48 s     | 173,4 m       | v = 255,1       | v = 267,8      | **186 m**      |
| 14 (centro)        | 3380,1 | 3361,0 (pila)        | 2,83 s     | 47,4 m        | v = 130,3       | v = 137,3      | 54 m           |
| 21 (Oeste)         | 3380,0 | 3359,7               | 2,98 s     | 54,3 m        | v = 143,5       | v = 155,3      | 66 m           |
| 8 (Este, fila 2)   | 3380,0 | 3358,1               | 2,78 s     | 37,8 m        | v = 118,0       | v = 119,3      | 39 m           |

Verificación a mano del taladro 1, con z₀ − z_c = 3380,17 − 3355,54 = 24,63 m: t = (16,44 + √(16,44² + 2·9,80665·24,63))/9,80665 = (16,44 + 27,45)/9,80665 = **4,48 s**, igual que el código. El alcance es 38,74 · 4,48 = 173,4 m.

### 2.9 Depósito, esponjamiento y reposo (FC-41 y FC-42: R1)

- **Esponjamiento:** cada bloque deposita V·1,5 en las 4 celdas vecinas del punto de impacto, con pesos bilineales que suman 1. Fuente: López Jimeno et al. (1995), tabla 1.4.
- **Reposo 37°** (USGS OFR 03-143, 34–37°): la pila se relaja por avalancha. Mientras una celda con material suelto supere el desnivel estable hacia un vecino, le pasa la mitad del exceso, sin tocar el terreno fijo:

  ```
  Δh_max = tan φ · d    (d = 1,5 m de lado, 2,12 m en diagonal)
  exceso = (h_i − h_j) − Δh_max  >  1 mm   →   se traslada min(exceso/2, suelto_i)
  ```

  El volumen se conserva exacto: pila 106 126 m³ = 70 750 × 1,5 (error 4·10⁻¹⁰). Ninguna pendiente con material supera 37° + 1 mm.

### 2.10 Posición final y atributos (S-23; FC-44 y S-22)

- **Posición final:** los bloques se apilan **en orden de llegada** en la columna libre más cercana a su impacto, hasta llenar la pila relajada. Lo primero en caer queda abajo. Por eso el bloque del taladro 1 termina 12,7 m más allá de su impacto: la pila local ya estaba llena.
- **Tamaño de fragmento:** Kuz-Ram (Cunningham 1987) con la carga y el factor de carga **de cada taladro**:

  ```
  x50 [cm] = A · K^−0,8 · Q^(1/6) · (115/RWS)^(19/30)       A = 0,06·(RMD + RDI + HF)
  A = 0,06·(50 + (0,025·2650 − 50) + 45/3) = 0,06·81,25 = 4,875
  Taladro típico: K ≈ 0,68 kg/m³, Q = 447 kg, RWS ≈ 99 → x50 ≈ 4,875·1,361·2,765·1,100 ≈ 20 cm
  n ≈ 1,6 (malla y cargas promedio);    tamaño del bloque = x_c·(−ln(1 − p))^(1/n),  x_c = x50/(ln 2)^(1/n)
  ```

  p es el cuantil del bloque dentro de su taladro: los más cercanos a la columna explosiva son los finos y los de la zona del taco, los gruesos. Resultado de la pila: 23 % < 10 cm, 27 % de 10–20 cm, 34 % de 20–40 cm, 12 % de 40–60 cm y 4 % > 60 cm.

### 2.11 Indicadores

| Indicador             | Definición                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Throw                 | Distancia máxima de la cara libre a una celda fuera del perímetro con pila de espesor ≥ 0,1 m    |
| Desplazamiento        | \|destino − origen\| en planta por bloque: máximo y medio ponderado por volumen                  |
| Drop                  | (techo antes − superficie después) dentro del perímetro, máximo y medio; negativo = hinchamiento |
| Esponjamiento lateral | Cuánto sale la pila del ancho del perímetro, perpendicular a la dirección media                  |
| Altura máxima         | Cota máxima de la pila − piso del banco                                                          |

---

## 3. Registro del proceso: cómo se llegó a la conclusión

1. **Observación del usuario:** en el proyecto «(completo)», de dos escalones, «el lado derecho se va súper lejos».
2. **Reproducción fuera de la interfaz:** se armó el mismo ejemplo en Node con `buildSectorExample()`, se decodificó el TIN del levantamiento y se corrió `computeMuckpile` con esa superficie, igual que en el worker. Resultado inicial: throw 159,8 m y pie de la pila por franja de 20 m (Este `u` desde el origen del sector):

   | Franja u (m)       | 60    | 80    | 100   | 120   | 140   | **160**   | **180**   |
   | ------------------ | ----- | ----- | ----- | ----- | ----- | --------- | --------- |
   | Pie de la pila (v) | 158,3 | 156,8 | 143,3 | 138,8 | 135,8 | **237,8** | **245,3** |

   La cresta está en v ≈ 85–95: el Este tiene un pie 100 m más adelante que el resto.

3. **Diagnóstico por taladro:** se agruparon los bloques por taladro y se ordenaron por desplazamiento máximo. Los resultados:
   - el taladro 1 domina (270 bloques, media 97 m, máximo 159 m, v₀ hasta 43,7 m/s);
   - los 16 siguientes (fila 1) quedan entre 44 y 69 m;
   - los de mayor alcance después del 1 están en el extremo **Oeste** (21, 20, 19): allí la cresta también se acerca (B_ef 4,4–5,0 m).
4. **Por qué el taladro 1:**
   - Su B_ef es 2,24 m, contra 5–6 m del resto del frente.
   - Las filas de la malla son rectas, pero la cresta sigue una curva de ±5 m (`crestV = 90,46 + 5·sin(2πu/260 + 0,3)`). En u ≈ 184 la cresta llega a su punto más al Sur (≈ 85,5): la primera fila, que solo tiene 4 taladros en ese tramo, queda casi encima de ella.
   - La V arranca justo ahí (taladro 3, 500 ms), así que esos taladros solo tienen la cara original como superficie libre.
5. **Verificación a mano:** la carga (§2.1), Zhang (§2.4), el ángulo, el factor de atenuación (§2.7) y el tiempo de vuelo (§2.8) coinciden con el código dentro del redondeo.
6. **Corrección 1, perímetro sin taladros:**
   - _Síntoma:_ el perímetro 2 aportaba 6030 bloques (18 463 m³) que se desplazaban hasta 27 m. El volumen in situ salía 89 214 m³.
   - _Causa:_ se volaban todos los perímetros dibujados, y los bloques del perímetro 2 tomaban la velocidad del taladro cargado más cercano.
   - _Corrección:_ solo se vuela un perímetro con taladros cargados dentro. El otro queda como terreno intacto y la interfaz lo avisa («1 perímetro sin taladros cargados no se vuela»).
   - _Resultado:_ in situ 70 750 m³. Test nuevo en `muckpile.test.ts`.
7. **Corrección 2, terreno fuera del levantamiento:**
   - _Síntoma:_ el levantamiento cubre hasta v = 200 m y el material del taladro 1 cae más allá. Allí el modelo usaba la regla sin topografía (S-20: «piso de la voladura», 3370), lo que dejaba una pared falsa de 15 m en v = 200 sobre el nivel real, 3355.
   - _Corrección:_ con topografía, fuera del levantamiento se prolonga la cota del borde más cercano.
   - _Resultado:_ el bloque cae a 3355,5 en lugar de 3370. Vuela 4,48 s en vez de 3,78 s y el throw pasa de 159,8 a **183,8 m**.
8. **Hallazgo sin corregir, discontinuidad de validez:**
   - Los taladros 2, 3 y 4 tienen B/Ø < 7, Zhang no los cubre y el modelo los deja sin velocidad (490 bloques quietos).
   - Es inconsistente: más cerca de la cara debería ser **más** violento, no menos.
   - No se inventó una regla. Queda como **P-23** en `docs/QUESTIONS.md` para que decida el ingeniero.
9. **Otros hallazgos:**
   - El escenario «En escalón» de este ejemplo deja **79 de 107 taladros sin tiempo** (el amarre en escalón no cubre la malla recortada por la cresta curva). No sirve para comparar la pila hasta completar ese amarre.
   - La revisión del diseño ya marca «Alivio muy cercano» en la esquina Este.

---

## 4. ¿Por qué el lado derecho se va tan lejos?

Se juntan tres factores y se multiplican:

1. **Geometría del diseño:** la primera fila en el Este queda a 0,3–2,2 m de la cresta curva. Es un burden frontal muy chico para 447 kg en 229 mm.
2. **Ley de velocidad:** v ∝ 1/B_ef. Con 2,24 m frente a 5,24 m la velocidad sube 2,3 veces (44,3 contra 18,9 m/s).
3. **Dos escalones:** a esa velocidad, el material salta el banco 3370 (≈ 20 m de ancho) y cae al 3355. Con 25 m de caída en lugar de ≈ 19 m, el vuelo dura 4,5 s en lugar de 2,8 s.

El alcance horizontal sale v_h·t = 38,7 × 4,48 = 173 m, contra 16,8 × 2,83 = 47 m: **3,7 veces más**. A eso se suman ≈ 13 m del asentamiento de la pila.

¿Es real? El número exacto no está calibrado (§6). El **sentido** sí es real: un burden frontal de 2,2 m con un taladro completo es un riesgo conocido de reventón de la cara y de proyección (el semáforo de SDOB no lo ve, porque mira el taco hacia arriba y no el burden hacia la cara). Opciones de rediseño que el modelo permite evaluar:

- quitar o descargar los taladros 1–4;
- una fila de adelante con menos carga (buffer) o con deck de aire;
- rehacer la primera fila siguiendo la cresta;
- iniciar la V desde el centro para que la esquina salga aliviada.

---

## 5. Resultados finales (después de las dos correcciones)

| Indicador                       | Valor                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Volumen in situ / de la pila    | 70 750 m³ / 106 126 m³ (× 1,5; error 4·10⁻¹⁰)                                              |
| Throw                           | **183,8 m** (taladro 1); en el resto del frente, 40–70 m                                   |
| Desplazamiento medio / máximo   | 6,8 m / 186 m                                                                              |
| Distribución del desplazamiento | < 10 m: 84,3 % · 10–20: 6,4 % · 20–40: 3,5 % · 40–60: 4,7 % · 60–100: 0,5 % · > 100: 0,6 % |
| Drop medio / máximo             | −3,9 m (la pila queda más alta que el banco: hinchamiento) / 5,3 m                         |
| Altura máxima sobre el piso     | 24,7 m (cota 3394,7), contra la pared del banco 3400 atrás                                 |
| Esponjamiento lateral           | 5,4 m                                                                                      |
| Dirección media                 | (0,074; 0,997): Norte, levemente al Este                                                   |
| Último impacto                  | 5,12 s                                                                                     |
| Bloques / quietos               | 21 499 / 490 (taladros 2, 3 y 4; P-23)                                                     |
| Cálculo                         | ≈ 0,4 s en Node                                                                            |

Pie de la pila por franja: u 60–80 → v ≈ 157; u 100–140 → v ≈ 136–143; **u 160–180 → v ≈ 253–269**.

Secciones Sur–Norte (throw a lo largo de la sección, desde el último punto in situ):

| Sección (u) | Throw   | Mayor bajada | Mayor subida |
| ----------- | ------- | ------------ | ------------ |
| 80 (Oeste)  | 62,9 m  | 3,6 m        | 6,6 m        |
| 124         | 49,4 m  | 2,7 m        | 7,7 m        |
| 150         | 47,1 m  | 1,1 m        | 9,0 m        |
| 184 (Este)  | 174,4 m | 1,1 m        | 8,8 m        |

---

## 6. Sensibilidad (mismo proyecto, un parámetro por vez)

| Variante                                 | Throw    | Despl. medio | Drop medio | Altura máx. |
| ---------------------------------------- | -------- | ------------ | ---------- | ----------- |
| **Base** (Zhang, atenuaciones S-21)      | 183,8 m  | 6,8 m        | −3,9 m     | 24,7 m      |
| Sin atenuaciones (taco, piso, distancia) | 212,3 m  | 11,4 m       | −2,9 m     | 24,1 m      |
| Ángulo de reposo 34°                     | 183,8 m  | 7,0 m        | −3,8 m     | 24,4 m      |
| Esponjamiento 1,3                        | 183,8 m  | 6,9 m        | −1,5 m     | 22,2 m      |
| Ley de potencia k = 10, n = 1 (R0)       | > 400 m¹ | 9,3 m        | −4,5 m     | 25,2 m      |
| Richards & Moore k = 13,5 (roca blanda)  | > 400 m¹ | 12,2 m       | −4,2 m     | 25,1 m      |
| Richards & Moore k = 27 (roca dura)      | > 400 m¹ | 26,3 m       | −2,3 m     | 23,5 m      |

¹ Los taladros 2–4 (B_ef < 1,5 m) sí tienen velocidad con las leyes de potencia, y con B → 0 se disparan: la grilla se recorta a 400 m de alcance (aviso «llegaron al borde»).

**Lectura:**

- El esponjamiento y el reposo cambian la **forma y la altura** de la pila, no el throw.
- El modelo de velocidad y las atenuaciones cambian el throw de 1,2 a más de 2 veces.
- Sin un levantamiento de la pila real, el número es una estimación. Hay que calibrar k y n con la sección de calibración del panel.

---

## 7. Limitaciones y preguntas abiertas

- **P-23 (abierta):** qué hacer con los taladros fuera de la validez de Zhang (B_ef/Ø < 7). Opciones:
  - (a) dejarlos quietos, como hoy (subestima);
  - (b) usar la velocidad en el límite, v(B = 7·Ø) (en este proyecto, 61,9 m/s);
  - (c) marcarlos como proyección y excluirlos de la pila con un aviso bloqueante.

  No hay fuente para elegir; decide el ingeniero.

- **Calibración:** k de fila, atenuaciones y ángulos son R0. No hay caso de referencia publicado de forma de pila: Yang & Kavetsky (1989, 1990) dejan sus parámetros «para calibrar con datos de campo».
- **Modelo cinemático:**
  - no hay choques en vuelo, ni frenado por la roca de atrás, ni rodadura después del impacto (el modo física de Rapier los muestra, pero es solo visual);
  - la posición final de cada bloque es una asignación que llena la pila (S-23).
- **Ejemplo:** el escenario «En escalón» deja 79 taladros sin tiempo.

---

## 8. Cómo reproducirlo

- **Interfaz:**
  1. `pnpm dev` (o `pnpm dev:online` → mina Cuajone).
  2. Abrir «Banco sobre topografía (completo)», ir a la pestaña **Pila** y pulsar «Calcular desplazamiento».
  3. En la planta se ven la lengua del Este y las flechas; en 3D (tecla 3), los vóxeles.
  4. «Trazar sección» en u ≈ 184 y en u ≈ 124 para comparar los perfiles.
  5. En **Vista**, «Desplazamiento (flechas)» muestra el alcance de A5 (taladro 1: 147 m).
- **Código:** `simulateMuckpile(muckpileInput(project, blastId, SurfaceIndex.build(tin)), params)` en `packages/core/src/muckpile/`. Las fórmulas están en su `README.md`.
- **Tests:** `pnpm test` (`muckpile.test.ts`: conservación, reposo, secuencia, calibración y perímetro sin taladros).

---

## 9. Actualización A7b: la cara libre con su ángulo (mismo proyecto)

Pedido del usuario: ocultar la cara libre en 3D para ver el material, y que el ángulo y el alto de la cara sean configurables y entren en la voladura, la energía y el desplazamiento.

**Qué cambió en la matemática (FC-46, geometría pura):**

1. **Cara de cada perímetro:** ángulo β y alto h, propios o los del banco. El pie queda a `h·cot β` de la cresta. En este proyecto, el botón «Medir en la topografía» da **69,8° y 15,0 m**; el levantamiento sintético se generó con caras de 70° y 15 m.
2. **Roca bajo el talud:** la cuña entre la cresta y el pie ahora se vuela:

   ```
   V_cuña = ½·h²·cot β · L = ½·15²·cot 70°·≈120 m ≈ 4 910 m³   (el código da 4 897 m³)
   ```

   Volumen in situ: 70 750 → **75 647 m³**.

3. **Burden a la cota de cada bloque** (si la cara libre gobierna el burden del taladro):

   ```
   B(z) = B_ef + min(h, z_boca − z)·cot β − (desvío del eje hacia la cara)
   v_bloque = v_taladro · (B_ef / B(z))^e      (e = 1 en Zhang; n en las leyes de potencia)
   ```

   Taladro 1 (B_ef = 2,24 m en la cresta), bloque a 5 m bajo la boca: B = 2,24 + 5·cot 70° = 2,24 + 1,82 = 4,06 m. Su velocidad baja de 44,3 a **24,5 m/s** (×0,55). Al pie, B = 2,24 + 5,46 = 7,70 m y v = 12,9 m/s.

4. **Lanzamiento según la cara:** el ángulo medio es 90° − β = 20°, con ±10° entre pie y cresta.

**Resultado:** el throw pasa de 183,8 a **72,8 m** y el desplazamiento máximo de 186 a 75 m. La lengua del Este sigue siendo la más larga (el taladro 1 tiene el burden más chico en la cresta), pero ahora solo la parte alta del frente sale rápida, que es lo que muestra un talud inclinado: el pie tiene más burden que la cresta.

**Vista 3D:**

- Conmutadores «Caras libres (talud, 3D)» y «Planos del banco (techo y piso, 3D)», en Diseño → Cara libre y en Pila → Capas.
- Con la pila calculada, **la topografía previa se recorta** en el perímetro volado y en su talud, y se ve la pila sobre el banco y delante de la cara.

**Energía:** en el plano de evaluación no hay valor en el aire delante de la cara, ni por encima del terreno (S-25).
