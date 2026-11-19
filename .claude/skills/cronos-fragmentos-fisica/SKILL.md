---
name: cronos-fragmentos-fisica
description: Úsala cuando trabajes la discretización de la roca volada en Cronos — pasar de bloques iguales a una población de fragmentos con tamaño, forma, velocidad, ángulo y giro propios — en la pila de banco (core/src/muckpile) o subterránea (core/src/underground/muckpile.ts), o cuando toques Kuz-Ram/Swebrec/KCO para muestrear fragmentos, el factor de volumen, el corte de finos, la dispersión de velocidad, proyecciones o arrastre. Keywords - fragmentos, discretización, partículas, muckpile, pila, tamaño de fragmento, forma, L:I:S, Swebrec, Kuz-Ram, velocidad por fragmento, giro, proyecciones, finos, cuele, anillos.
---

# Cronos · Física de fragmentos

## Principio

**La curva de fragmentación no cambia: cambia cómo se muestrea.** Kuz-Ram + Swebrec (KCO) ya están
(`fragmentation/fragmentation.ts`, `underground/fragmentation.ts` con zonas del frente). El trabajo es
generar una **población de fragmentos que conserva el volumen** y darle a cada uno forma, velocidad,
dirección y giro, sin romper los indicadores de la pila (throw, desplazamiento, volumen, clases de
tamaño), que deben seguir saliendo del modelo cinemático y de la curva completa.

## Reglas del dominio (no negociables)

1. **Determinista.** Nada de `Math.random()`. Hash sin estado por contador:
   `u = hash01(semilla(voladura, taladro, fragmento), canal)`. Mueve `hash01` de
   `underground/muckpile.ts` a un util común de `core` y úsalo con canales fijos (tabla abajo). El
   resultado no puede depender del orden ni del número de workers.
2. **P(x) es fracción de VOLUMEN pasante.** Nunca sortees tamaños con la inversa de P y le des a cada
   uno volumen x³: sesga hacia los grandes. Número por clase = V_clase / (k_v·x̄³).
3. **Volumen exacto.** Σ volumen de fragmentos dibujados + volumen fino bajo el corte = volumen in situ
   del taladro (error < 1e-6 relativo). Es un test obligatorio.
4. **Los indicadores no dependen de lo dibujado.** Clases de tamaño sobre la curva completa; las
   proyecciones se marcan y se excluyen de throw y desplazamiento.
5. **Procedencia en cada constante:** [M] medido, [F] fórmula publicada, [NV] no verificado en el
   original, [S] supuesto calibrable, [CG] criterio de diseño. Lo que no sea [M]/[F] va a
   `docs/QUESTIONS.md` como supuesto S-xx y se expone como parámetro.
6. **Valores esperados en tests que no salen de la misma fórmula** (regla de dominio 2 del repo).

## 1. Tamaño: población por clases (método recomendado)

```
clases log: x_0 = x_corte < … < x_M = xmax   (12 por década)
V_i  = V_taladro · [P(x_{i+1}) − P(x_i)]
N_i  = V_i / (k_v · x̄_i³),   x̄_i = √(x_i·x_{i+1})   (redondeo con arrastre del resto a la clase siguiente)
x    = inversa de P restringida a [P(x_i), P(x_{i+1})] con u del canal 0; reescala para que Σ = V_i
Swebrec inversa:  x(P) = xmax · exp(−ln(xmax/x50) · (1/P − 1)^(1/b))
b = 2·ln2·ln(xmax/x50)·n   (o b fijo por roca si se calibró: abanico fragmentación–energía)
k_v = 0,45 [S] (0,4–0,6): volumen = k_v·x³ con x = tamaño de criba
```

- **Corte adaptativo por presupuesto** de instancias (bisección sobre las clases): 50 000 escritorio,
  15 000 Quest/móvil; piso 0,03 m. El volumen V·P(x_corte) es **fino**: va al heightmap de la pila y,
  en vuelo, a partículas proxy (≈ 15 % del presupuesto, cada una con V_fino/N_proxy).
- **Orden de magnitud** (`references/nfrag.py`): ronda UG 16 m² × 4 m con x50 ≈ 8 cm → con corte 10 cm
  ≈ 17 000 fragmentos y solo 40 % del volumen. **La pila UG se ve sobre todo como grava: es correcto.**
  Banco (1 taladro, 270 m³, x50 0,3 m) → corte 0,2 m ≈ 10 000 fragmentos, 68 % del volumen.
- **Subterráneo:** usa la curva de **su zona** (arranque, ayudas, contorno, zapateras;
  `faceFragmentationZones`), no la mezcla: el arranque es fino (x50 2–3 cm), el contorno grueso y en
  lajas. Anillos: `ringFragmentationZone`; mejora pendiente: variar a lo largo del abanico (collar
  fino, pie grueso).
- **Reparto espacial** (S-22 con ruido): ordena posiciones por s = d_carga/B + ζ, ζ ~ N(0; 0,3), y
  asígnales los tamaños ordenados. Fino cerca de la carga, grueso en el taco, sin capas perfectas.

## 2. Forma

| Magnitud | Defecto | Rango | Fuente |
|---|---|---|---|
| I/L | Beta media 0,72, d.e. 0,10 | 0,45–0,98 | [M] Sun et al. 2014 (roca triturada, láser 3D) |
| S/I | Beta media 0,50, d.e. 0,12 | 0,2–0,95 | [M] Sun 2014 |
| S/I con familia de juntas dominante / contorno | 0,35 / −0,1 | — | [S] |
| Caras del fragmento medio | ≈ 6,6 caras, 8,9 vértices («cuboide») | — | [M] Domokos et al. 2020 PNAS |

- Escala cada fragmento con ejes (L, I, S) tales que su volumen sea k_v·x³ (x ≈ I).
- **Juntas:** con familias en el dominio, mezcla 50/50 las razones con los espaciamientos s1:s2:s3 y
  alinea el eje S con el polo de la familia más cerrada (±15°). Sin juntas: cuaternión uniforme
  (Shoemake, canales 4–6).
- **No uses Voronoi de Poisson como forma estadística** (≈ 15,5 caras: parece grano, no roca volada).
  Las geometrías salen de cortes planos sucesivos: ver `cronos-fragmentos-render`.

## 3. Velocidad, dirección, giro

```
v_i = v_local(p_i) · exp(σ·z_i − σ²/2) · clamp((x_i/x50)^(−β), 0,6, 1,6)
σ = 0,30 [S] (0,2–0,4; reproduce Jharia 13–28 m/s y El Aljibe 4–17 m/s [M])
β = 0,15 [S] (0–0,3) — NO hay medición a escala de voladura de v vs tamaño: es un supuesto
dirección: cono von Mises-Fisher alrededor de la media; 1σ 12° banco, 18° cuele [S]
giro: ω = κ_ω·(v/L)·u, κ_ω = 0,25 [S], u ⊥ v ± 30° (≈ 1–20 rad/s)
arrastre: a = ρ_aire·C_d·(Área/4)·v²/(2m), C_d ≈ 1; ignorable si x ≥ 0,1 m y vuelo < 3 s (< 5 % g)
```

- **v_local** es la del modelo existente en la posición del fragmento: banco = Zhang / carga escalada /
  Richards-Moore × exp(−λr/B) × taco × piso; UG = UG-P1..P3 (Richards-Moore con topes 3–25 m/s,
  `stopeFactor`, `cavingFactor`). Hoy UG ya multiplica por `0,25 + 1,05·u^1,2`: reemplázalo por la
  lognormal para no aplicar dos dispersiones.
- **Por rol en el frente (UG):** cuele axial ±20°; ayudas hacia el hueco abierto ±15°; zapateras con
  10–25° hacia arriba (levantan la pila); contorno v × 0,5 hacia el centro; anillos 2–8 m/s al slot.
- **Proyecciones:** fracción 5·10⁻⁴ de los fragmentos más chicos (< 0,1 m) del tramo del collar con
  v = min(v_Lundborg(T = x), 3·v_local) (v ∝ 1/T, FC-29). Marcadas, fuera de los indicadores, con
  arrastre.
- **Validación de rangos:** alcance UG de frentes 10–25 m (USBM RI 7356, UG-P8) y balance
  L_pila ≈ A·avance·η·swell/(W·h̄) ≈ 3–6 × avance; SLC 0,4–1,6 m de desplazamiento (Kiruna).

## 4. Canales del hash

| Canal | Uso | Canal | Uso |
|---|---|---|---|
| 0 | tamaño dentro de la clase | 7–8 | z de velocidad (Box-Muller) |
| 1 | I/L | 9–10 | cono de dirección |
| 2 | S/I | 11–12 | eje de giro |
| 3 | forma base de la biblioteca | 13–15 | posición dentro de la celda |
| 4–6 | cuaternión uniforme | 16 | ζ del reparto espacial |

Beta: usa Kumaraswamy (CDF inversa cerrada) ajustada a media y d.e., o tabla.

## 5. Contrato de datos (core → worker → engine)

Arreglos planos transferibles, en la línea de `MuckpileBlocks`: por fragmento `parent` (bloque o
taladro), `size`, `axes` (L, I, S), `quat`, `shape` (u8), `v0`, `omega`, `launchTime`,
`impactTime`, `destination`, `flags` (proyección, proxy fino). En UG, la trayectoria con rebote se
calcula para el bloque padre y cada fragmento la hereda con desfase rígido + dispersión propia; solo
las proyecciones y los fragmentos > p80 se integran aparte si el presupuesto lo permite.

## 6. Checklist antes de dar por terminado

- [ ] Volumen exacto por taladro y por zona (test).
- [ ] Histograma en volumen de la población dibujada + fino reproduce P(x) (KS en volumen < 0,02).
- [ ] Medias de I/L y S/I dentro de ±0,02 del objetivo con 10⁴ fragmentos.
- [ ] Mismo resultado con 1 y con N workers y en dos corridas (determinismo).
- [ ] Indicadores de la pila iguales (± tolerancia documentada) a los de antes del cambio.
- [ ] Rendimiento: ronda UG típica y banco de 500 taladros dentro del presupuesto de tiempo del perf test.
- [ ] Reglas nuevas en `docs/RULES.md` (§9 UG-P / FC-44), supuestos en `docs/QUESTIONS.md`, decisión en
      `docs/DECISIONS.md`, y los huecos de `references/investigacion-2026-11-19.md` §5 actualizados.
- [ ] Verificación visual con `cronos-verificar-ui` y `cronos-fragmentos-render`.

## Referencias

`references/investigacion-2026-11-19.md`: informe completo con fórmulas, tablas medidas, parámetros
por defecto (§6) y bibliografía con DOI (§7). Primarias clave: Ouchterlony 2005 (Swebrec),
Cunningham 1987/2005, Fonseca de Castro 2021 (frentes por zona), Domokos et al. 2020, Sun et al. 2014,
Herrero et al. ISEE 2026 (El Aljibe), Richards & Moore 2004, Lundborg (proyecciones).
