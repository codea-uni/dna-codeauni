# 04 — Casos de referencia (CR)

Un caso de referencia es un ejemplo con **entradas y resultados conocidos** que el motor de cálculo debe reproducir. Es la base de las pruebas automáticas y del indicador I3 (guía, sección 10).

Reglas de uso:
- El valor esperado se escribe en la prueba **tal como aparece aquí** (o en la fuente), nunca calculado con el código que se está probando.
- Donde la fuente redondea pasos intermedios, la prueba usa la **tolerancia indicada**. Si el motor calcula sin redondear, la diferencia debe caer dentro de esa tolerancia.
- Estado de cada caso: **Listo** (datos completos), **Por verificar** (falta contrastar con la fuente), **Por crear** (lo construye el dev), **Datos aparte** (los datos reales se entregan por separado).

Tolerancias generales: geométricos y algebraicos, error relativo ≤ 10⁻⁶ · literatura, dentro del redondeo de la fuente (se indica en cada caso) · tiempos de detonación, exactos al milisegundo · PPV con el mismo K y β, ±1 %.

| ID | Caso | Hito | Estado |
|---|---|---|---|
| CR-01 | "Mina Esperanto": burden, taco, sobreperforación, espaciamiento, carga y factor de carga | G3, G4 | Listo |
| CR-02 | Diseño "MEQ73 11 pulg": carga, densidad media, factores, SD, Kuz-Ram | G4 (Kuz-Ram en F2) | Listo (contrastado con código) |
| CR-03 | Pequeño diámetro (cantera), encartuchado | G4 | Listo |
| CR-04 | Malla de banco de 180 taladros con tres tipos | G2, G3, G4, G7 | Datos aparte |
| CR-05 | Mini-malla de tiempos (2 × 3 taladros) | G5, G6 | Propuesta abajo; el dev la valida |
| CR-06 | Registros de vibración a 100, 200 y 300 m | G6 | Candidato |
| CR-07 | Kuz-Ram independiente | F2 | Por conseguir |

---

## CR-01 — "Mina Esperanto" (banco, taladros verticales)

**Entradas.** Andesita ρ_roca = 2,6 t/m³, estratos buzando hacia la cara, pocas estructuras. ANFO ρ = 0,78 t/m³ (780 kg/m³), VOD = 4 700 m/s. Ø = 12¼" (0,31115 m). Altura de banco H = 15 m.

| Paso | Fórmula | Valor de la fuente | Valor sin redondear | Tolerancia |
|---|---|---|---|---|
| 1. Burden de Ash | B[ft] = Kb·Ø[in]/12, Kb = 25 | 7,8 m (25,5 ft) | 7,779 m | ±0,05 m |
| 2. Burden de Konya–Walter | B[ft] = (2·ρe/ρr + 1,5)·Ø[in]·Kd·Ks; Kd = 0,95, Ks = 1,10 | 8,2 m (26,9 ft) | 8,194 m | ±0,05 m |
| 3. Burden operativo | Dato del usuario (dentro de ≈ ±10 % del teórico) | B = 8 m | 8 m | exacto |
| 4. Taco | T = 0,7·B | 5,6 m | 5,6 m | exacto |
| 5. Sobreperforación | J = 0,3·B | 2,4 m | 2,4 m | exacto |
| 6. Rigidez | H/B | (< 4) | 1,875 | 10⁻⁶ |
| 7. Espaciamiento | H/B < 4 → S = (H + 7B)/8 | 8,9 m | 8,875 m | ±0,05 m |
| 8. Longitud de carga | L_c = H + J − T | 11,8 m | 11,8 m | 10⁻⁶ |
| 9. Carga por taladro | Q = π/4·Ø²·L_c·ρe | ≈ 700 kg | 699,85 kg | ±0,5 % |
| 10. Volumen por taladro | V = H·B·S | 1 068 m³ (con S = 8,9) | 1 065 m³ | ±0,3 % |
| 11. Factor de potencia | PF = Q/(V·ρ_r) | 0,253 kg/t (253 g/t) | 0,2527 kg/t | ±1 % |
| 12. Factor de carga | FC = Q/V | 0,657 kg/m³ | 0,6571 kg/m³ | ±1 % |

Chequeo cruzado disponible en la fuente (se usa en G3 para comparar modelos de burden): Andersen B[ft] = √(Ø[in]·L[ft]).

**Voladura amortiguada (buffer)** del mismo ejemplo (para G4 en adelante): pozos de 9⅞" con W = 380 kg y quebradura Q_b = 5 m. B_buf = [W·1000/(FC·K_BP·H·ρ_r·SBR)]^0,5 con K_BP = 1 y SBR = S/B ≈ 1,1 → **5,9 ≈ 6 m**; S_buf = 1,15·B_buf = **6,9 m**; distancia precorte–buffer DST = [K_BP·(D_buf·S_buf·B_buf)/(D_prod·S_prod·B_prod)]^0,5·Q_b = **3,4 m**. (FC en g/t con las unidades de la fuente; contrastar dimensionalmente al implementar.)

**Precorte** del mismo ejemplo (Fase 2): Ø 6½", explosivo ρ = 1,1 g/cc, VOD 3,5 km/s, UCS 50 MPa, RT 8 MPa, pozo seco (n = 1,25), 2 m superiores sin carga (13 m de 15 m cargados). Imponiendo Pb = UCS: f = (UCS/(110·ρ·VOD²))^(1/n) = 0,0664; D_exp = √(f·D_pozo²·l_pozo/l_exp) = 1,80" → se adopta **1¾"**; con 1¾": f = 0,0628 → Pb = 110·f^n·ρ·VOD² = **46,6 MPa**; espaciamiento E ≤ D_pozo·(Pb + RT)/RT = **1,12–1,13 m**; factor de carga lineal ≤ **1,53–1,54 kg/m²**.

---

## CR-02 — Diseño "MEQ73 11 pulg" (emulsión gasificada, carga de fondo)

**Entradas.** H = 15 m; J = 1 m; Ø = 11"; S = 8,5 m; B = S/1,15; ρ_roca = 2,69 t/m³; densidad de la emulsión 1,38 g/cc; carga de fondo 7,8 m; esponjamiento (gasificación) 0,9 m; sin carga superior, decks ni aire; potencia 3,036 MJ/kg; VOD 5 400 m/s.

| # | Cálculo | Fórmula | Valor esperado | Tolerancia |
|---|---|---|---|---|
| 1 | Burden | B = S/1,15 | 7,391 m | 10⁻³ |
| 2 | Longitud del taladro | L = H + J | 16 m | exacto |
| 3 | Volumen por taladro | V = B·S·H | 942,39 m³ | 10⁻³ |
| 4 | Toneladas por taladro | V·ρ_r | 2 535,03 t | 10⁻³ |
| 5 | Densidad lineal | DCL = 0,507·ρ·Ø²[in²] | 84,659 kg/m | 0,1 % (con π/4 exacto: 84,61) |
| 6 | Carga por taladro | Q = DCL·7,8 | 660,34 kg | 0,1 % |
| 7 | Densidad media tras gasificar | ρ_med = Q/[(7,8 + 0,9)·0,507·Ø²] | 1,2372 g/cc | 0,1 % |
| 8 | Taco | T = L − 7,8 − 0,9 | 7,30 m | exacto |
| 9 | Factor de carga | Q/V | 0,7007 kg/m³ | 0,1 % |
| 10 | Factor de potencia | Q/(V·ρ_r) | 0,2605 kg/t | 0,1 % |
| 11 | Energía por taladro y factor de energía | Q·3,036; ÷ toneladas | 2 004,8 MJ; 0,791 MJ/t | 0,1 % |
| 12 | Razones geométricas | H/B; S/B; T/B; J/B; T/Ø | 2,03; 1,15; 0,99; 0,135; 26,1 | 10⁻² |
| 13 | Profundidad escalada de enterramiento (SD) | kg/m = ρ_med·Ø²[mm]/1275 = 75,75; L_w = 10·Ø = 2,794 m; W = 211,65 kg; D = T + L_w/2 = 8,697 m; SD = D/W^(1/3) | 1,459 | 0,5 % |
| 14 | Presión de detonación / de taladro | PD = 0,25·ρ_med·VOD²·10⁻⁶; PB = 0,5·PD | 9,02 GPa; 4,51 GPa | 0,5 % |
| 15 | Kuz-Ram (F2) | A = 5,2 (ilustrativo), W = 0,3 m, f_m = 1,1; X50 = A·(V/Q)^0,8·Q^(1/6)·(115/RWS)^0,633, RWS = 80,67 | X50 = 25,5 cm; n = 1,04; Xc = 36,4 cm | 1 % |
| 16 | Costo de voladura (F2, opcional) | Q·0,4313 US$/kg + accesorios 36,603 US$ | 321,40 US$/taladro | 0,1 % |
| 17 | Costo de perforación | 9 US$/m · 16 m | 144 US$/taladro | exacto |

**Contraste con código** (Python, para verificar que los valores anteriores salen de las fórmulas; recalculado y coincidente):

```python
import math
def banco(H=15, J=1, D_in=11, S=8.5, rho_r=2.69, rho0=1.38, Lf=7.8, Lsw=0.9,
          mj_kg=3.036, rws=80.667, A=5.2, W=0.3, fm=1.1):
    B = S/1.15; L = H+J; V = B*S*H; ton = V*rho_r
    dcl = 0.507*rho0*D_in**2; Q = dcl*Lf
    rho_med = Q/((Lf+Lsw)*0.507*D_in**2); T = L-Lf-Lsw
    D_mm = D_in*25.4; kgm = rho_med*D_mm**2/1275; Lw = 10*D_mm/1000
    SD = (T+Lw/2)/(Lw*kgm)**(1/3)
    X50 = A*(V/Q)**0.8*Q**(1/6)*(115/rws)**0.633
    return dict(B=B, V=V, ton=ton, dcl=dcl, Q=Q, rho_med=rho_med, T=T,
                FC=Q/V, PF=Q/ton, FE=Q*mj_kg/ton, SD=SD, X50=X50,
                PD_GPa=0.25*rho_med*5400**2*1e-6)
# esperado: B 7.391, Q 660.34, rho_med 1.2372, T 7.30, FC 0.7007, PF 0.2605,
#           FE 0.791, SD 1.459, X50 25.5 cm, PD 9.02 GPa
```

**Otros tres diseños de la misma familia** (para pruebas con decks; los valores de "SD corregido" y de la densidad por tramo están recalculados por tramo, no con la hoja original):

| Diseño | Ø | S (m) | B (m) | Carga | Q (kg) | Ton/taladro | FC (kg/m³) | PF (kg/t) | SD corregido |
|---|---|---|---|---|---|---|---|---|---|
| "Actual" | 12¼" | 8,0 | 6,96 | fondo 7,8 (+0,9), aire superior 1,3, taco 6,0 | 818,9 | 2 245,6 | 0,981 | 0,365 | 1,14 |
| MEQ73 (base, arriba) | 11" | 8,5 | 7,39 | fondo 7,8 (+0,9), taco 7,3 | 660,3 | 2 535,0 | 0,701 | 0,260 | 1,46 |
| MEQ73 (con deck) | 11" | 7,5 | 6,52 | fondo 4,9 (+0,45), deck 1,3, superior 3,9 (+0,45), taco 5,0 | 745,0 | 1 973,6 | 1,015 | 0,377 | 1,07 |
| MEQ73 (aire inferior) | 11" | 6,5 | 5,65 | aire inf. 1,0, fondo 4,9, superior 3,9 (+0,9), taco 5,3 | 745,0 | 1 482,4 | 1,352 | 0,503 | 1,16 |

**Advertencias que el software debe emitir para CR-02** (verificaciones de cordura): H/B = 2,03 (rigidez regular); S = 8,5 vs. (H + 7B)/8 = 8,34 (coherente); taco 7,3 m ≈ 1,0·B (dentro de 0,7–1,3 B) pero ≈ 26·Ø (por encima de 15–25·Ø); J/B = 0,135 (bajo frente a 0,2–0,5); burden vs. autores: Andersen 7,32 m, Ash (Kb 30) 8,38 m, Konya 8,15 m.

**Errores conocidos de la hoja de origen — no replicar:** la densidad media en diseños con carga superior divide la carga total entre solo la altura de la carga de fondo (da 2,27 y 2,48 g/cc, imposibles); una celda resta kg de metros; presiones en kbar rotuladas como MPa; una columna mezcla US$/taladro con US$/t. La densidad se calcula **por tramo**.

---

## CR-03 — Pequeño diámetro (cantera), explosivo encartuchado

**Entradas.** Roca dura, UCS = 150 MPa (120–180). Banco H = 10 m. Perforación con martillo en cabeza Ø = 89 mm, **inclinada 20°**. Hidrogel encartuchado de 75 mm (1,2 g/cc) en el fondo y ANFO a granel (0,8 g/cc) en la columna. Reglas de la tabla para roca dura (múltiplos del diámetro): J = 12·Ø, T = 32·Ø, B = 35·Ø, S = 43·Ø, carga de fondo 40·Ø.

| Cálculo | Valor de la fuente | Nota de redondeo |
|---|---|---|
| Sobreperforación J = 12·Ø | 1,1 m (exacto 1,068) | |
| Longitud L = H/cos20° + (1 − 20/100)·J | 11,5 m | 1,068 → 1,1 en la fuente |
| Taco T = 32·Ø | 2,8 m | 2,848 |
| Burden B = 35·Ø; espaciamiento S = 43·Ø | 3,1 m; 3,8 m | 3,115; 3,827 |
| Volumen V_R = B·S·H/cos20° | 125,4 m³ | con B, S redondeados |
| Rendimiento V_R/L | 10,9 m³/m | |
| Carga de fondo l_f = 40·Ø | 3,6 m | 3,56 |
| Densidad lineal de fondo (el diámetro medio del cartucho sube 10 % por el peso de la columna): π/4·0,0825²·1 200 | 6,4 kg/m | |
| Carga de fondo Q_f | 23,0 kg | |
| Longitud de columna l_c = 11,5 − 2,8 − 3,6 | 5,1 m | |
| Densidad lineal de columna: π/4·0,089²·800 | 5,0 kg/m | |
| Carga de columna Q_c | 25,5 kg | |
| Carga total | 48,5 kg | |
| Consumo específico CE = 48,5/125,4 | 0,387 kg/m³ | |

**Tolerancia:** 2 % en las magnitudes finales si el motor calcula sin redondear pasos intermedios (recalculado sin redondeo: Q = 48,2 kg y CE = 0,380 kg/m³); exacta si se reproducen los redondeos de la tabla paso a paso. La prueba debe cubrir **taladro inclinado** y **carga con dos productos** (encartuchado y granel).

---

## CR-04 — Malla de banco de 180 taladros, tres tipos (importación y flujo completo)

Datos reales: **se entregan aparte** como archivo CSV (una fila por taladro, sin encabezado: ID, Este, Norte, Cota; coordenadas UTM en metros). Mientras llegan, construye un archivo sintético con la **misma estructura** (180 filas; cuatro prefijos de ID: `A` 32 filas, `B` 32, `C` 32, `BF` 84; cotas con diferencias de 1 a 3 m entre grupos) y con las trampas de la sección 5 de `03 - Modelo de datos e importacion`.

Diseño de los tres tipos de taladro que se cargan sobre esa malla:

| Tipo | Ø | Burden × espaciamiento | Sobreperforación | Banco | Carga | Iniciación |
|---|---|---|---|---|---|---|
| Producción | 12¼" | 9 m × 10 m | 2 m | 16 m | taco 7,5 m; explosivo tipo HA73 en 10,5 m | electrónica |
| Producción fila A | 12¼" | igual | 2 m | 16 m | taco superior 2,2 m; taco intermedio 7,9 m; HA64 en dos decks (5,7 m + 2,2 m) | electrónica |
| Buffer | 9⅞" | 3,5 m × 4 m | 1 m | 16 m | taco 4,5 m; cámara de aire 7,9 m; HA64 en 4,6 m | electrónica |

**Qué valida:** importación con posición correcta sobre mapa (G2), grupos y decks (G3, G4), tonelaje y factor de carga (G4), reporte (G7). Los valores esperados de tonelaje y factor de carga se calculan **a mano** con las fórmulas de `02` para los tres tipos (Augusto los escribe en la prueba, el ingeniero de minas los revisa) y se contrastan con el software de referencia si hay demo (indicador I7).

---

## CR-05 — Mini-malla de tiempos (2 × 3 taladros) — propuesta para validar

Geometría en metros (coordenadas locales; cara libre = la recta y = 0, con el material a y > 0):

| Taladro | E | N | | Taladro | E | N |
|---|---|---|---|---|---|---|
| A1 | 0 | 3 | | B1 | 0 | 6 |
| A2 | 3,5 | 3 | | B2 | 3,5 | 6 |
| A3 | 7 | 3 | | B3 | 7 | 6 |

Burden nominal 3 m, espaciamiento 3,5 m. Cada taladro lleva un detonador con **retardo de fondo de 500 ms** (igual en todos) y una carga de **100 kg**. Ventana de MIC: 8 ms, semiabierta: los taladros con tiempos en [t, t + 8) se suman.

**Amarre 1 (en fila, inicio en A1).** Conectores de superficie: A1→A2 17 ms; A2→A3 17 ms; A1→B1 45 ms; B1→B2 17 ms; B2→B3 17 ms.

| Taladro | A1 | A2 | A3 | B1 | B2 | B3 |
|---|---|---|---|---|---|---|
| Tiempo de detonación (ms, con retardo de fondo) | 500 | 517 | 534 | 545 | 562 | 579 |
| Tiempo relativo al primero (ms) | 0 | 17 | 34 | 45 | 62 | 79 |
| Burden efectivo (m) | 3,0 | 3,0 | 3,0 | 3,0 | 3,0 | 3,0 |

MIC = 100 kg (ningún par cae dentro de 8 ms).

**Amarre 2 (en V, inicio en A2).** A2→A1 17; A2→A3 17; A2→B2 42; B2→B1 17; B2→B3 17.
Tiempos relativos: A2 = 0; A1 = 17; A3 = 17; B2 = 42; B1 = 59; B3 = 59. **MIC = 200 kg** (A1 y A3 coinciden; B1 y B3 coinciden).

**Amarre 3 (entre taladros muy juntos).** Como el 1, pero A1→A2 5 ms y A2→A3 5 ms. Tiempos relativos: A1 = 0; A2 = 5; A3 = 10; B1 = 45; B2 = 62; B3 = 79. Ventana [0, 8) contiene A1 y A2; ventana [5, 13) contiene A2 y A3. **MIC = 200 kg**.

**Amarre 4 (borde de la ventana).** Como el 1, pero con A1→B1 = 42 ms: A3 = 34 y B1 = 42 (diferencia de exactamente 8 ms). Convención propuesta: **no se agrupan** (ventana semiabierta) → MIC = 100 kg. *Convención por confirmar por el ingeniero de minas (R0).*

**Amarre 5 (secuencia inválida: la fila trasera antes que la delantera).** Inicio en B1; B1→B2 17; B2→B3 17; B1→A1 45; A1→A2 17; A2→A3 17. Tiempos relativos: B1 = 0; B2 = 17; B3 = 34; A1 = 45; A2 = 62; A3 = 79. **Burden efectivo de B1, B2 y B3 = 6,0 m** (la cara libre más cercana en ese instante es la original, a 6 m) y el software emite una **advertencia** de cara libre no despejada; el de A1, A2, A3 = 3,0 m.

Modelo de burden efectivo usado en este caso: distancia del taladro a la cara libre más cercana **en el instante en que detona**, donde las caras libres son la original más los taladros que ya detonaron antes (tratados como puntos; parámetro "tiempo mínimo de alivio" = 0 ms por defecto). Es una **hipótesis de trabajo (R0)**: el dev la implementa y el ingeniero de minas la valida o corrige.

---

## CR-06 — Registros de vibración (candidato)

Picos medidos de velocidad de partícula (mm/s) en registros de un curso de I-Blast, a 100, 200 y 300 m del disparo. A **200 m**: 3,81 / 3,05 / 3,94; a **300 m**: 3,30 / 2,79 / 3,43 (los de 100 m se completan con el ingeniero de minas).

**Limitación:** falta confirmar la carga por retardo de cada registro. Sin ella **no se puede ajustar K y β**; el caso se usa solo cuando esa carga esté confirmada. Mientras tanto, la prueba de PPV usa el ejemplo hecho a mano de abajo.

**Ejemplo a mano para G6 (K y β ilustrativos, no de sitio).** PPV = K·(R/√Q)^(−β) con K = 1 140, β = 1,6, Q = 100 kg:
- R = 200 m → distancia escalada 20 → **PPV = 9,45 mm/s** (9,4462)
- R = 300 m → distancia escalada 30 → **PPV = 4,94 mm/s** (4,9375)

---

## CR-07 — Kuz-Ram independiente (F2)

Se necesita un ejemplo **publicado** de la literatura (Cunningham, 1983/2005; índice de volabilidad de Lilly, 1986) con entradas y salidas numéricas. Hasta conseguirlo, el ejemplo de CR-02 (X50 = 25,5 cm) sirve **solo como prueba de regresión**, no como evidencia independiente (su fórmula es la misma del código).
