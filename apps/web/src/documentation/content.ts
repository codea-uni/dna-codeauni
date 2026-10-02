/** Equations follow packages/core/src (not the older calculation specification).
 * Keep this reference in sync when the calculation modules change.
 */
export interface Text {
  es: string;
  en: string;
}
const t = (es: string, en: string): Text => ({ es, en });
const math = String.raw;
export interface Equation {
  name: Text;
  tex: string;
  detail: Text;
}
export interface Chapter {
  id: string;
  title: Text;
  intro: Text;
  panels: string[];
  equations: Equation[];
  notes: Text[];
}
const eq = (es: string, en: string, tex: string, detailEs: string, detailEn: string): Equation => ({
  name: t(es, en),
  tex,
  detail: t(detailEs, detailEn),
});

export const chapters: Chapter[] = [
  {
    id: 'conventions',
    title: t('Unidades y convenciones', 'Units and conventions'),
    panels: ['blast', 'library'],
    intro: t(
      'Kronos calcula en el Sistema Internacional. Las unidades visibles se convierten al presentar o editar un valor; el redondeo de pantalla no cambia el cálculo.',
      'Kronos calculates in SI units. Display units are converted when presenting or editing a value; display rounding does not change the calculation.',
    ),
    equations: [
      eq(
        'Conversiones de uso frecuente',
        'Common conversions',
        math`\begin{aligned}1\,\mathrm{ms}&=10^{-3}\,\mathrm{s} &1\,\mathrm{mm}&=10^{-3}\,\mathrm{m}\\1\,\mathrm{g/cm^3}&=10^3\,\mathrm{kg/m^3} &1\,\mathrm{MPa}&=10^6\,\mathrm{Pa}\\1\,\mathrm{t}&=10^3\,\mathrm{kg} &1\,\mathrm{MJ}&=10^6\,\mathrm{J}\end{aligned}`,
        'Longitud: m; masa: kg; tiempo: s; densidad: kg/m³; presión: Pa; energía: J. Los ángulos internos están en radianes.',
        'Length: m; mass: kg; time: s; density: kg/m³; pressure: Pa; energy: J. Internal angles are in radians.',
      ),
      eq(
        'Orientación del taladro',
        'Hole orientation',
        math`\alpha_{\mathrm{rad}}=\alpha_{\mathrm{deg}}\frac{\pi}{180}`,
        'Coordenadas: x al Este, y al Norte, z hacia arriba. Azimut desde el Norte en sentido horario. Inclinación α desde la vertical; 0° corresponde a un taladro vertical.',
        'Coordinates: x East, y North, z up. Azimuth is clockwise from North. Inclination α is measured from vertical; 0° is a vertical hole.',
      ),
    ],
    notes: [
      t(
        'Cada tema define sus símbolos localmente: una misma letra puede representar magnitudes distintas en modelos diferentes. Los coeficientes empíricos dependen de las unidades indicadas.',
        'Symbols are defined locally in each topic: the same letter may represent different quantities in different models. Empirical coefficients depend on the stated units.',
      ),
      t(
        'Los accesos «Ajustar en…» abren las herramientas reales del proyecto. Los cambios conservan sus validaciones, permisos e historial de deshacer. Las ecuaciones son de referencia; los parámetros se editan en esas herramientas.',
        '“Adjust in…” opens the actual project tools. Changes retain their validation, permissions and undo history. Equations are reference material; parameters are edited in those tools.',
      ),
    ],
  },
  {
    id: 'geometry',
    title: t('Geometría y perforación', 'Geometry and drilling'),
    panels: ['blast', 'pattern'],
    intro: t(
      'La longitud depende de la cota de boca, el piso, la inclinación y la convención de sobreperforación seleccionada.',
      'Length depends on collar elevation, floor, inclination and the selected subdrilling convention.',
    ),
    equations: [
      eq(
        'Sobreperforación vertical',
        'Vertical subdrilling',
        math`L=\max\!\left(0,\frac{z_c-z_f+J}{\cos\alpha}\right)`,
        'L: longitud (m); zc: cota de boca (m); zf: cota de piso (m); J: sobreperforación vertical (m); α: inclinación. Es la convención por defecto.',
        'L: length (m); zc: collar elevation (m); zf: floor elevation (m); J: vertical subdrilling (m); α: inclination. This is the default convention.',
      ),
      eq(
        'Convención López Jimeno',
        'López Jimeno convention',
        math`L=\max\!\left(0,\frac{z_c-z_f}{\cos\alpha}+\left(1-\frac{\alpha_{\mathrm{deg}}}{100}\right)J\right)`,
        'Esta alternativa aplica una corrección empírica de J con α en grados. Se selecciona en los parámetros del banco.',
        'This alternative applies an empirical correction to J using α in degrees. It is selected in the bench parameters.',
      ),
      eq(
        'Coordenadas del fondo',
        'Toe coordinates',
        math`\begin{aligned}x_f&=x_c+L\sin\alpha\sin\theta\\y_f&=y_c+L\sin\alpha\cos\theta\\z_f&=z_c-L\cos\alpha\end{aligned}`,
        'θ: azimut; (xc, yc, zc): boca; (xf, yf, zf): fondo del taladro. Todas las coordenadas y L están en metros.',
        'θ: azimuth; (xc, yc, zc): collar; (xf, yf, zf): hole toe. All coordinates and L are in metres.',
      ),
    ],
    notes: [
      t(
        'El piso de diseño y el fondo del taladro son distintos cuando existe sobreperforación. La topografía puede modificar la cota de boca y, por tanto, la longitud.',
        'Design floor and hole toe differ when subdrilling is present. Topography can change the collar elevation and therefore the length.',
      ),
    ],
  },
  {
    id: 'pattern',
    title: t('Burden y malla', 'Burden and pattern'),
    panels: ['pattern', 'blast'],
    intro: t(
      'Las relaciones teóricas orientan la elección de la malla. B es burden, S espaciamiento, H altura de banco, D diámetro y L longitud; todos en metros.',
      'Theoretical relationships guide pattern selection. B is burden, S spacing, H bench height, D diameter and L length; all in metres.',
    ),
    equations: [
      eq(
        'Ash',
        'Ash',
        math`B=K_bD`,
        'Kb: coeficiente adimensional elegido para la referencia de burden.',
        'Kb: dimensionless coefficient selected for the burden reference.',
      ),
      eq(
        'Konya–Walter en SI',
        'Konya–Walter in SI',
        math`B=12\left(2\frac{\rho_e}{\rho_r}+1.5\right)D K_d K_s`,
        'ρe y ρr: densidades de explosivo y roca en las mismas unidades. Kd y Ks: factores de estratificación y estructura. El factor 12 convierte la relación original de pies y pulgadas.',
        'ρe and ρr: explosive and rock densities in the same units. Kd and Ks: bedding and structure factors. The factor 12 converts the original feet/inches relationship.',
      ),
      eq(
        'Andersen en metros',
        'Andersen in metres',
        math`B=0.3048\sqrt{\frac{D}{0.0254}\frac{L}{0.3048}}`,
        'D y L se introducen en metros; la expresión conserva la relación empírica original en pulgadas y pies.',
        'D and L are in metres; the expression preserves the original empirical relationship in inches and feet.',
      ),
      eq(
        'Rigidez y espaciamiento sugerido',
        'Stiffness and suggested spacing',
        math`r=\frac{H}{B},\qquad S=\begin{cases}(H+7B)/8&r<r_0\\1.4B&r\ge r_0\end{cases}`,
        'r0: umbral de rigidez, por defecto 4. La calificación usa: pobre r<2; regular 2≤r<3; buena 3≤r<4; excelente r≥4.',
        'r0: stiffness threshold, default 4. Ratings: poor r<2; fair 2≤r<3; good 3≤r<4; excellent r≥4.',
      ),
      eq(
        'Tresbolillo equilátero y proporciones iniciales',
        'Equilateral staggered pattern and initial ratios',
        math`S=\frac{2B}{\sqrt3},\qquad T=0.7B,\qquad J=0.3B`,
        'T: taco; J: sobreperforación. Son referencias iniciales; el diseño conserva los valores de malla y carga que el usuario aplique.',
        'T: stemming; J: subdrilling. These are initial references; the design retains the pattern and charge values applied by the user.',
      ),
    ],
    notes: [],
  },
  {
    id: 'charge',
    title: t('Carga y explosivos', 'Charge and explosives'),
    panels: ['charge', 'library'],
    intro: t(
      'El carguío se organiza por tramos, desde el fondo hacia la boca. La masa usa la densidad y geometría de cada producto y tramo.',
      'Charging is organised into decks from toe to collar. Mass uses the density and geometry of each product and deck.',
    ),
    equations: [
      eq(
        'Densidad lineal',
        'Linear charge density',
        math`A=\frac{\pi D_e^2}{4},\qquad q=\rho_e A`,
        'A: sección (m²); De: diámetro efectivo o diámetro del taladro (m); ρe: densidad del producto o del tramo (kg/m³); q: carga lineal (kg/m). Sin diámetro efectivo, un producto encartuchado usa q = masa del cartucho / longitud del cartucho.',
        'A: cross section (m²); De: effective or hole diameter (m); ρe: product or deck density (kg/m³); q: linear charge (kg/m). Without an effective diameter, a packaged product uses q = cartridge mass / cartridge length.',
      ),
      eq(
        'Masa por tramo y por taladro',
        'Deck and hole mass',
        math`m_j=q_j\max(0,\ell_j-s_j),\qquad Q=\sum_jm_j+Q_{\mathrm{primas}}`,
        'ℓj: longitud final del tramo (m); sj: incremento de longitud por esponjamiento (m). La masa por taladro usada en análisis incluye las primas.',
        'ℓj: final deck length (m); sj: length increase due to swelling (m). Hole mass used in analysis includes primers.',
      ),
      eq(
        'Energía de los productos',
        'Product energy',
        math`E=\sum_jm_je_j+\sum_p m_pe_p`,
        'ej y ep: energía específica (J/kg). Las primas aportan energía solo si tienen un explosivo conocido en la librería. E se calcula en J.',
        'ej and ep: specific energy (J/kg). Primers contribute energy only when linked to a known explosive in the library. E is calculated in J.',
      ),
      eq(
        'Presiones indicativas y diámetro crítico',
        'Indicative pressures and critical diameter',
        math`\begin{aligned}P_D&=\frac{\rho_e\,\mathrm{VOD}^2}{\gamma+1},&P_B&=\eta P_D\\\mathrm{VOD}(D)&=\begin{cases}\mathrm{VOD}_{\mathrm{ideal}}[1-(D_c/D)^2]&D>D_c\\0&D\le D_c\end{cases}\end{aligned}`,
        'Presiones en Pa; VOD en m/s; γ=3 y η=0,5 por defecto. Dc: diámetro crítico (m). La relación de VOD es una función de referencia, no una corrección automática de todos los cálculos.',
        'Pressures in Pa; VOD in m/s; default γ=3 and η=0.5. Dc: critical diameter (m). The VOD relationship is a reference function, not an automatic correction to every calculation.',
      ),
    ],
    notes: [],
  },
  {
    id: 'volume',
    title: t('Cubicación, factores y costos', 'Volumes, factors and costs'),
    panels: ['blast', 'pattern', 'charge'],
    intro: t(
      'Kronos distingue los factores reales, obtenidos del área cubicada, de los factores nominales de diseño, obtenidos de la malla.',
      'Kronos distinguishes actual factors based on the measured influence area from nominal design factors based on the pattern.',
    ),
    equations: [
      eq(
        'Volumen real y tonelaje',
        'Actual volume and tonnage',
        math`V_i=A_iH,\qquad V=\sum_iV_i,\qquad M_{\mathrm{t}}=\frac{V\rho_r}{1000}`,
        'Ai: área de influencia Voronoi recortada por los perímetros (m²); H: altura del banco (m); ρr: densidad de roca (kg/m³); Mt: toneladas. Para taladros sin perímetro se genera un contorno automático.',
        'Ai: Voronoi influence area clipped to boundaries (m²); H: bench height (m); ρr: rock density (kg/m³); Mt: tonnes. An automatic boundary is generated for holes outside boundaries.',
      ),
      eq(
        'Volumen nominal por taladro',
        'Nominal volume per hole',
        math`V_{\mathrm{nom}}=\begin{cases}BSH&\text{vertical}\\BSH/\cos\alpha&\text{López Jimeno}\end{cases}`,
        'Los agregados nominales solo incluyen taladros asociados a una malla. No sustituyen la cubicación real.',
        'Nominal aggregates include only holes associated with a pattern. They do not replace actual volume calculations.',
      ),
      eq(
        'Factores y rendimiento',
        'Factors and drilling yield',
        math`\begin{aligned}FC&=Q/V&[\mathrm{kg/m^3}]\\FP&=1000Q/(V\rho_r)&[\mathrm{kg/t}]\\FE&=(E/10^6)/M_{\mathrm{t}}&[\mathrm{MJ/t}]\\R_p&=V/\sum_iL_i&[\mathrm{m^3/m}]\end{aligned}`,
        'Q incluye explosivo y primas (kg); E es energía (J). Para los indicadores de diseño se usan las sumas nominales correspondientes. Las divisiones sin volumen válido no representan un factor físico.',
        'Q includes explosive and primers (kg); E is energy (J). Design indicators use the corresponding nominal totals. Divisions without valid volume do not represent a physical factor.',
      ),
      eq(
        'Costos',
        'Costs',
        math`C_{\mathrm{total}}=C_{\mathrm{productos}}+c_{\mathrm{perforación}}\sum_iL_i`,
        'Productos: explosivo por kg, taco por m³, tapones, primas y detonadores por unidad. Los precios no definidos aportan cero al costo calculado.',
        'Products: explosive per kg, stemming per m³, plugs, primers and detonators per unit. Undefined prices contribute zero to calculated cost.',
      ),
    ],
    notes: [
      t(
        'La cubicación de carga usa altura de banco constante. La simulación de pila puede usar topografía y pisos por perímetro; sus volúmenes pueden diferir.',
        'Charge volume uses constant bench height. Muckpile simulation can use topography and per-boundary floors; their volumes may differ.',
      ),
    ],
  },
  {
    id: 'sdob',
    title: t('Confinamiento · SDOB', 'Confinement · SDOB'),
    panels: ['charge'],
    intro: t(
      'La profundidad escalada de enterramiento usa la carga más cercana a la superficie. Evalúa el confinamiento con raíz cúbica de la masa.',
      'Scaled depth of burial uses the explosive deck closest to the surface. It evaluates confinement using the cube root of mass.',
    ),
    equations: [
      eq(
        'Carga de referencia y profundidad escalada',
        'Reference charge and scaled depth',
        math`\ell_w=\min(10D_e,\ell),\quad W=\frac{m}{\ell}\ell_w,\quad \mathrm{SDOB}=\frac{T_c+\ell_w/2}{\sqrt[3]{W}}`,
        'De: diámetro efectivo (m); ℓ y m: longitud final (m) y masa (kg) del tramo superior; Tc: longitud de material confinante sobre ese tramo (m). SDOB en m/kg⅓. Aire y espacio vacío no cuentan como confinamiento.',
        'De: effective diameter (m); ℓ and m: final length (m) and mass (kg) of the upper deck; Tc: confining material length above it (m). SDOB in m/kg⅓. Air and empty space do not count as confinement.',
      ),
      eq(
        'Taco para SDOB objetivo',
        'Stemming for target SDOB',
        math`T=\mathrm{SDOB}_{\mathrm{obj}}\sqrt[3]{W}-5D_e`,
        'La función inversa usa una carga de referencia de 10 diámetros. Para un tramo más corto, la expresión general sustituye 5De por ℓw/2.',
        'The inverse function uses a reference charge of 10 diameters. For a shorter deck, the general expression replaces 5De with ℓw/2.',
      ),
    ],
    notes: [
      t(
        'Cortes por defecto de las bandas: 0,62; 0,92; 1,44; 1,84 m/kg⅓. La profundidad se mide a lo largo del eje, no en vertical. La SDOB desde la boca, que incluye aire, se muestra solo como referencia.',
        'Default band boundaries: 0.62, 0.92, 1.44, 1.84 m/kg⅓. Depth is measured along the axis, not vertically. Collar-based SDOB, which includes air, is provided only as a reference.',
      ),
    ],
  },
  {
    id: 'timing',
    title: t('Tiempos, MIC y alivio', 'Timing, MIC and relief'),
    panels: ['timing', 'view'],
    intro: t(
      'El amarre es una red dirigida. La llegada de señal se calcula por el camino de menor retardo desde los puntos de inicio.',
      'The tie-up is a directed network. Signal arrival follows the minimum-delay path from initiation points.',
    ),
    equations: [
      eq(
        'Tiempo de detonación',
        'Firing time',
        math`t_i=\min_p\left(t_{\mathrm{llegada},i}+d_{ip}\right)`,
        'dip: retardo del iniciador p en el taladro i (s). Si no hay llegada superficial, un detonador electrónico usa el primer tiempo de inicio (o cero). Un taladro sin camino ni iniciador electrónico no recibe un tiempo finito.',
        'dip: delay of initiator p in hole i (s). Without surface arrival, an electronic detonator uses the earliest start time (or zero). A hole with neither a path nor an electronic initiator has no finite firing time.',
      ),
      eq(
        'Máxima carga instantánea',
        'Maximum instantaneous charge',
        math`\mathrm{MIC}=\max_t\sum_{i:\,t\le t_i<t+w}Q_i`,
        'w: ventana de coincidencia (s), 8 ms por defecto; Qi: masa por taladro (kg). El extremo superior es abierto: dos disparos separados exactamente por w no se agrupan.',
        'w: coincidence window (s), default 8 ms; Qi: hole mass (kg). The upper endpoint is open: shots separated by exactly w are not grouped.',
      ),
      eq(
        'Tiempo mínimo para aliviar',
        'Minimum relief time',
        math`t_i-t_j>0,\qquad t_i-t_j\ge r_aB_i`,
        'ra: tasa de alivio (s/m); Bi: burden nominal (m). Solo los taladros anteriores que cumplen ambas condiciones pueden formar el frente de alivio.',
        'ra: relief rate (s/m); Bi: nominal burden (m). Only earlier holes satisfying both conditions can form the relief front.',
      ),
      eq(
        'Guía de retardos',
        'Delay guidance',
        math`g_h=\frac{|t_{i+1}-t_i|}{S},\qquad g_f=\frac{|t_{r+1}-t_r|}{B}`,
        'gh y gf en s/m; la interfaz los expresa en ms/m. Se comparan con los rangos configurados entre taladros y entre filas.',
        'gh and gf in s/m; the interface displays ms/m. They are compared with configured inter-hole and inter-row ranges.',
      ),
    ],
    notes: [
      t(
        'El burden efectivo es una distancia en planta a la cara libre o al frente aproximado por los taladros ya aliviados. El frente se representa por el segmento entre el taladro previo más cercano y su vecino previo; sin vecino, por un punto. Es una aproximación geométrica, no una simulación de fractura.',
        'Effective burden is a plan distance to the free face or the front approximated by relieved holes. The front is represented by the segment from the closest previous hole to its previous neighbour; without a neighbour, by a point. This is a geometric approximation, not a fracture simulation.',
      ),
      t(
        'En vibraciones, cada taladro recibe la mayor carga de las ventanas que lo contienen. Los taladros sin tiempo se consideran individualmente en ese análisis.',
        'In vibration analysis, each hole receives the largest charge of windows containing it. Holes without a firing time are considered individually in that analysis.',
      ),
    ],
  },
  {
    id: 'energy',
    title: t('Campo cercano y mapas', 'Near field and maps'),
    panels: ['energy', 'library'],
    intro: t(
      'El mapa ofrece PPV de campo cercano o densidad de carga suavizada. Son magnitudes distintas y sus escalas no son intercambiables.',
      'The map offers near-field PPV or smoothed charge density. These are different quantities and their scales are not interchangeable.',
    ),
    equations: [
      eq(
        'Holmberg–Persson discretizado',
        'Discrete Holmberg–Persson',
        math`v_i(P)=K\left[\sum_j\frac{q_j\Delta\ell_j}{d_j^{\beta/\alpha}}\right]^\alpha,\qquad v(P)=\max_i v_i(P)`,
        'qj: carga lineal (kg/m); Δℓj: segmento de columna (m); dj: distancia 3D al punto P (m); v: m/s. La columna se discretiza en segmentos de hasta 0,25 m. K, α y β se ajustan en el mapa.',
        'qj: linear charge (kg/m); Δℓj: column segment (m); dj: 3D distance to P (m); v: m/s. The column is discretised into segments up to 0.25 m. K, α and β are adjustable in the map.',
      ),
      eq(
        'Columna vertical, β = 2α',
        'Vertical column, β = 2α',
        math`v=K\left[\frac{q}{R}\left(\arctan\frac{D-G}{R}-\arctan\frac{D-G-L_c}{R}\right)\right]^\alpha`,
        'R: distancia horizontal (m); D: profundidad del fondo de carga (m); G: profundidad del geófono (m); Lc: longitud cargada (m). Es la forma cerrada de referencia para esa geometría.',
        'R: horizontal distance (m); D: charge-bottom depth (m); G: geophone depth (m); Lc: charge length (m). This is the closed reference form for this geometry.',
      ),
      eq(
        'PPV crítica y bandas de daño',
        'Critical PPV and damage bands',
        math`v_c=\frac{R_TV_p}{E_r},\qquad v_{\mathrm{bandas}}\in\{0.25,1,4,8\}\,v_c`,
        'RT: resistencia a tracción (Pa); Vp: velocidad de onda P (m/s); Er: módulo de Young (Pa). Una PPV crítica definida en la roca prevalece sobre esta estimación; sin datos no se inventa un valor.',
        'RT: tensile strength (Pa); Vp: P-wave velocity (m/s); Er: Young’s modulus (Pa). A rock-specific critical PPV overrides this estimate; no value is assumed when data is missing.',
      ),
      eq(
        'Densidad de carga gaussiana',
        'Gaussian charge density',
        math`\rho_Q(P)=\sum_j\frac{m_j}{(2\pi)^{3/2}\sigma^3}\exp\!\left(-\frac{d_j^2}{2\sigma^2}\right)`,
        'mj: masa de cada segmento (kg); σ: ancho de suavizado (m); resultado en kg/m³. Se evalúa sobre un plano horizontal con resolución y radio de influencia configurables.',
        'mj: mass of each segment (kg); σ: smoothing width (m); result in kg/m³. Evaluated on a horizontal plane with configurable resolution and influence radius.',
      ),
    ],
    notes: [
      t(
        'La PPV toma el máximo entre taladros, sin superponer sus picos. El muestreo del mapa usa la carga lineal del producto y la densidad del tramo; actualmente no aplica allí el diámetro efectivo ni la corrección de masa por esponjamiento. En cargas desacopladas puede diferir del análisis de masa.',
        'PPV takes the maximum across holes without superimposing peaks. Map sampling uses product linear charge and deck density; effective diameter and mass correction for swelling are currently not applied there. Decoupled charges may differ from mass analysis.',
      ),
    ],
  },
  {
    id: 'fragmentation',
    title: t('Fragmentación', 'Fragmentation'),
    panels: ['fragmentation', 'library'],
    intro: t(
      'Kuz-Ram calcula el tamaño medio y la uniformidad. Rosin–Rammler y Swebrec convierten esos parámetros en curvas pasantes y percentiles.',
      'Kuz-Ram calculates mean size and uniformity. Rosin–Rammler and Swebrec convert these parameters into passing curves and percentiles.',
    ),
    equations: [
      eq(
        'Factor de roca',
        'Rock factor',
        math`A=0.06(RMD+JPS+JPA+RDI+HF)`,
        'RDI = 0,025ρr − 50 con ρr en kg/m³. HF = Er/3 si Er<50 GPa; de otro modo UCS/5 con UCS en MPa. Sin descripción del macizo, se usa 50 para RMD+JPS+JPA. El factor A definido por el usuario prevalece.',
        'RDI = 0.025ρr − 50 with ρr in kg/m³. HF = Er/3 if Er<50 GPa; otherwise UCS/5 with UCS in MPa. Without rock-mass description, RMD+JPS+JPA defaults to 50. A user-defined A overrides the estimate.',
      ),
      eq(
        'Kuz-Ram',
        'Kuz-Ram',
        math`x_{50}=\frac{A}{100}K^{-0.8}Q^{1/6}\left(\frac{115}{100\,RWS}\right)^{19/30}`,
        'x50 en m; K: factor de carga (kg/m³); Q: carga media por taladro (kg); RWS: potencia relativa con ANFO = 1. El divisor 100 convierte el resultado original de cm a m.',
        'x50 in m; K: loading factor (kg/m³); Q: mean charge per hole (kg); RWS: relative weight strength with ANFO = 1. Division by 100 converts the original cm result to m.',
      ),
      eq(
        'Índice de uniformidad',
        'Uniformity index',
        math`\begin{aligned}n={}&f_m\left(2.2-\frac{14B}{d_{\mathrm{mm}}}\right)\sqrt{\frac{1+S/B}{2}}\left(1-\frac{W}{B}\right)\\&\cdot\left(\frac{|L_b-L_c|}{L}+0.1\right)^{0.1}\frac{L}{H}\end{aligned}`,
        'B, S, W, L, Lb, Lc y H en m; dmm: diámetro en mm. W: desviación de perforación; L: carga total; Lb: carga de fondo; Lc: carga de columna. fm vale 1 en rectangular, 1,1 en tresbolillo y 1,15 en tresbolillo equilátero. Se fuerza n>0 como guarda numérica.',
        'B, S, W, L, Lb, Lc and H in m; dmm: diameter in mm. W: drill deviation; L: total charge length; Lb: bottom charge; Lc: column charge. fm is 1 for rectangular, 1.1 for staggered and 1.15 for equilateral staggered patterns. A numerical guard enforces n>0.',
      ),
      eq(
        'Rosin–Rammler y percentiles',
        'Rosin–Rammler and percentiles',
        math`x_c=\frac{x_{50}}{(\ln2)^{1/n}},\quad P(x)=1-e^{-(x/x_c)^n},\quad x_p=x_c[-\ln(1-p)]^{1/n}`,
        'P y p son fracciones entre 0 y 1. P80 usa p=0,8; los tamaños están en metros. Finos = P(tamaño de finos); sobretamaño = 1−P(tamaño máximo aceptado).',
        'P and p are fractions between 0 and 1. P80 uses p=0.8; sizes are in metres. Fines = P(fines size); oversize = 1−P(maximum accepted size).',
      ),
      eq(
        'Swebrec / KCO',
        'Swebrec / KCO',
        math`P(x)=\left[1+\left(\frac{\ln(x_{\max}/x)}{\ln(x_{\max}/x_{50})}\right)^b\right]^{-1},\qquad b=2\ln2\,\ln\!\frac{x_{\max}}{x_{50}}\,n`,
        'Para 0<x<xmax; P=0 por debajo y P=1 desde xmax. El exponente b de la roca prevalece si está definido. xmax parte de min(B,S) o del tamaño indicado y se limita a al menos 1,05x50.',
        'For 0<x<xmax; P=0 below and P=1 from xmax. A rock-specific b overrides the estimate. xmax starts from min(B,S) or the specified size and is limited to at least 1.05x50.',
      ),
    ],
    notes: [
      t(
        'La estimación global usa promedios de taladros cargados. En la implementación actual, RWS se pondera por longitud de los tramos, no por masa. La malla elegida, la desviación y las propiedades de roca influyen en el resultado.',
        'The global estimate uses averages of loaded holes. In the current implementation, RWS is weighted by deck length, not mass. The selected pattern, drill deviation and rock properties affect the result.',
      ),
    ],
  },
  {
    id: 'vibration',
    title: t('Vibraciones, aire y proyecciones', 'Vibration, airblast and flyrock'),
    panels: ['vibration', 'timing'],
    intro: t(
      'Las leyes de sitio relacionan distancia y carga por retardo. Los coeficientes y límites deben corresponder a las unidades y al sitio del proyecto.',
      'Site laws relate distance and charge per delay. Coefficients and limits must correspond to the project site and units.',
    ),
    equations: [
      eq(
        'Distancia escalada y PPV',
        'Scaled distance and PPV',
        math`SD=\frac{R}{Q^a},\qquad v=k\,SD^{-\beta},\qquad a\in\left\{\frac12,\frac13\right\}`,
        'R: distancia (m); Q: carga por retardo (kg); v: m/s, mostrada en mm/s. a=1/2 para raíz cuadrada y 1/3 para raíz cúbica. El mapa evalúa taladros y toma la respuesta máxima.',
        'R: distance (m); Q: charge per delay (kg); v: m/s, displayed in mm/s. a=1/2 for square-root and 1/3 for cube-root scaling. The map evaluates holes and takes the maximum response.',
      ),
      eq(
        'Distancia y carga admisible',
        'Distance and allowable charge',
        math`R_{\mathrm{lim}}=Q^a\left(\frac{k}{v_{\mathrm{lim}}}\right)^{1/\beta},\qquad Q_{\mathrm{adm}}=\left[\frac{R}{(v_{\mathrm{lim}}/k)^{-1/\beta}}\right]^{1/a}`,
        'vlim: límite de PPV (m/s). El límite explícito del punto prevalece; en su ausencia se toma el menor límite aplicable por estructura y distancia. Sin límite no se emite una evaluación de cumplimiento.',
        'vlim: PPV limit (m/s). An explicit monitoring-point limit takes priority; otherwise the lowest applicable structure/distance limit is used. Without a limit, no compliance assessment is made.',
      ),
      eq(
        'Sobrepresión y nivel sonoro',
        'Airblast and sound level',
        math`P=k_a\left(\frac{R}{\sqrt[3]{Q}}\right)^{-\beta_a},\qquad L_p=20\log_{10}\!\left(\frac{P}{20\cdot10^{-6}\,\mathrm{Pa}}\right)`,
        'P: sobrepresión en Pa; Lp: dB. ka y βa pertenecen a la ley de sobrepresión; son independientes de la ley de vibración.',
        'P: overpressure in Pa; Lp: dB. ka and βa belong to the airblast law and are independent of the vibration law.',
      ),
      eq(
        'Lundborg',
        'Lundborg',
        math`R_f=k_fD^{2/3}F_s,\qquad d_f=0.1\left(\frac{D}{0.0254}\right)^{2/3}`,
        'D: diámetro del taladro (m); Rf: alcance (m); Fs: factor de seguridad; df: tamaño asociado (m). La constante original 260, con D en pulgadas, equivale a kf=260/0,0254⅔ cuando D está en metros.',
        'D: hole diameter (m); Rf: range (m); Fs: safety factor; df: associated size (m). The original constant 260, with D in inches, corresponds to kf=260/0.0254⅔ when D is in metres.',
      ),
    ],
    notes: [
      t(
        'Las leyes son empíricas. Los valores predeterminados no constituyen una calibración del sitio ni un límite normativo automático.',
        'These laws are empirical. Defaults are neither site calibration nor an automatic regulatory limit.',
      ),
    ],
  },
  {
    id: 'presplit',
    title: t('Precorte y buffer', 'Presplit and buffer'),
    panels: ['groups', 'charge', 'library'],
    intro: t(
      'El precorte usa una relación de desacople volumétrico y una ley de presión específica. No debe confundirse con la presión indicativa de una carga acoplada.',
      'Presplit uses volumetric decoupling and a specific pressure law. It differs from the indicative pressure of a coupled charge.',
    ),
    equations: [
      eq(
        'Desacople y presión',
        'Decoupling and pressure',
        math`f=\left(\frac{D_c}{D}\right)^2\frac{\ell_c}{\ell},\qquad P_B[\mathrm{MPa}]=110f^n\rho_e[\mathrm{g/cm^3}]\,\mathrm{VOD}[\mathrm{km/s}]^2`,
        'Dc: diámetro de carga; D: diámetro de taladro; ℓc: longitud cargada; ℓ: longitud del taladro. n=1,25 en seco y 0,9 con agua. Con varios tramos, se suman sus volúmenes y se usan densidad y VOD del tramo más largo.',
        'Dc: charge diameter; D: hole diameter; ℓc: loaded length; ℓ: hole length. n=1.25 dry and 0.9 wet. With multiple decks, volumes are summed and density/VOD come from the longest deck.',
      ),
      eq(
        'Espaciamiento y factor superficial',
        'Spacing and areal loading',
        math`S_{\max}=D\frac{P_B+R_T}{R_T},\qquad \gamma_s=\frac{\pi D_c^2\rho_e}{4S}`,
        'RT: resistencia a tracción en las mismas unidades que PB; Smax en m. Para γs, ρe en kg/m³ y longitudes en m: resultado en kg/m².',
        'RT: tensile strength in the same units as PB; Smax in m. For γs, use ρe in kg/m³ and lengths in m: result in kg/m².',
      ),
      eq(
        'Burden de buffer',
        'Buffer burden',
        math`B_{\mathrm{buf}}=\sqrt{\frac{Q}{FP\,K_{BP}\,H\,\rho_r\,(S/B)}},\qquad S_{\mathrm{buf}}=1.15B_{\mathrm{buf}}`,
        'Q: kg; FP: kg de explosivo/kg de roca (convertir desde kg/t dividiendo por 1000); H: m; ρr: kg/m³. KBP y S/B son adimensionales.',
        'Q: kg; FP: kg explosive/kg rock (divide kg/t by 1000); H: m; ρr: kg/m³. KBP and S/B are dimensionless.',
      ),
      eq(
        'Separación precorte–buffer',
        'Presplit–buffer distance',
        math`DST=Q_b\sqrt{K_{BP}\frac{(DSB)_{\mathrm{buf}}}{(DSB)_{\mathrm{prod}}}}`,
        'Qb: sobreexcavación de producción (m); D, S y B: diámetro, espaciamiento y burden de cada fila (m). Estas relaciones de buffer son referencias del motor.',
        'Qb: production backbreak (m); D, S and B: diameter, spacing and burden of each row (m). These buffer relationships are engine reference functions.',
      ),
    ],
    notes: [],
  },
  {
    id: 'displacement',
    title: t('Desplazamiento', 'Displacement'),
    panels: ['muckpile', 'view'],
    intro: t(
      'El modelo de Zhang, Chi y Yi estima la velocidad inicial del burden. El alcance se calcula con tiro parabólico y reducción por fila.',
      'The Zhang, Chi and Yi model estimates initial burden velocity. Range uses projectile motion and row attenuation.',
    ),
    equations: [
      eq(
        'Velocidad de burden',
        'Burden velocity',
        math`v_B=\sqrt{\frac{\pi c_B\rho_e e_e c_e}{2\rho_r\tan\theta}}\frac{D}{B_{\mathrm{ef}}},\qquad c_e=\min(1,L_c/H)`,
        'ρe y ρr: kg/m³; ee: energía específica J/kg; D, Bef, Lc y H: m; cB: eficiencia ajustable; θ: ángulo del modelo. vB en m/s. Se excluyen cargas desacopladas y relaciones Bef/D<7.',
        'ρe and ρr: kg/m³; ee: specific energy J/kg; D, Bef, Lc and H: m; cB: adjustable efficiency; θ: model angle. vB in m/s. Decoupled charges and Bef/D<7 are excluded.',
      ),
      eq(
        'Atenuación y alcance',
        'Attenuation and range',
        math`\begin{aligned}v_r&=v_Bk_r^{r-1}\\R&=\frac{v_r\cos\alpha}{g}\left[v_r\sin\alpha+\sqrt{(v_r\sin\alpha)^2+2gh}\right]\end{aligned}`,
        'r: fila desde la cara libre; kr: factor por fila; g=9,80665 m/s²; h=H/2. Aquí α es el ángulo de lanzamiento sobre la horizontal, obtenido como 90° menos el ángulo de la cara.',
        'r: row from the free face; kr: row factor; g=9.80665 m/s²; h=H/2. Here α is launch angle above horizontal, computed as 90° minus face angle.',
      ),
    ],
    notes: [
      t(
        'El desplazamiento estimado corresponde al centroide del burden. Los parámetros de energía y reducción por fila requieren calibración del sitio.',
        'Estimated displacement refers to the burden centroid. Energy and row-reduction parameters require site calibration.',
      ),
    ],
  },
  {
    id: 'muckpile',
    title: t('Pila de material y calibración', 'Muckpile and calibration'),
    panels: ['muckpile'],
    intro: t(
      'La pila se calcula por bloques: volumen in situ, asignación al taladro, salida según el amarre, vuelo, depósito con esponjamiento y relajación al ángulo de reposo.',
      'The pile is calculated in blocks: in-situ volume, hole assignment, timed launch, flight, deposition with swelling and relaxation to the angle of repose.',
    ),
    equations: [
      eq(
        'Modelos alternativos de velocidad',
        'Alternative velocity models',
        math`v_0=k\left(\frac{\sqrt[3]{Q}}{B_{\mathrm{ef}}}\right)^n,\qquad v_{\mathrm{RM}}=k\left(\frac{\sqrt{Q/L_c}}{B_{\mathrm{ef}}}\right)^n`,
        'Primera expresión: ley de burden escalado. Segunda: Richards–Moore, con n=1,3 como referencia. Q: kg; Lc y Bef: m. k y n se calibran para cada modelo; no se transfieren entre modelos.',
        'First expression: scaled-burden law. Second: Richards–Moore, with reference n=1.3. Q: kg; Lc and Bef: m. k and n are calibrated for each model and are not transferable between models.',
      ),
      eq(
        'Atenuación local',
        'Local attenuation',
        math`f_v=f_Tf_P\exp(-\lambda d/B),\qquad \alpha(z)=\alpha_{\mathrm{pie}}+(\alpha_{\mathrm{cresta}}-\alpha_{\mathrm{pie}})z`,
        'fT y fP: factores de taco y piso, aplicados solo a sus bloques; λ: decaimiento; d/B: distancia relativa al eje; z: altura relativa entre 0 y 1. Si se vincula a la cara, el ángulo medio sigue la normal de esa cara.',
        'fT and fP: stemming and floor factors, applied only to their respective blocks; λ: decay; d/B: relative axis distance; z: relative height between 0 and 1. When linked to the face, the mean angle follows its normal.',
      ),
      eq(
        'Conservación y reposo',
        'Conservation and repose',
        math`V_{\mathrm{pila}}=F_eV_{\mathrm{in\ situ}},\qquad \frac{|h_i-h_j|}{d_{ij}}\le\tan\varphi`,
        'Fe: factor volumétrico de esponjamiento; φ: ángulo de reposo; hi y hj: cotas de celdas vecinas. La relajación transfiere material entre celdas conservando volumen.',
        'Fe: volumetric swell factor; φ: angle of repose; hi and hj: neighbouring cell elevations. Relaxation transfers material between cells while conserving volume.',
      ),
      eq(
        'Comparación con levantamiento',
        'Survey comparison',
        math`\mathrm{RMSE}=\sqrt{\frac1N\sum_{i=1}^N(z_{i,\mathrm{modelo}}-z_{i,\mathrm{medido}})^2}`,
        'N: muestras coincidentes; cotas y RMSE en m. La calibración busca k y n comparando la superficie calculada con un levantamiento. Resolución y cobertura afectan el ajuste.',
        'N: overlapping samples; elevations and RMSE in m. Calibration searches k and n by comparing the modelled surface with a survey. Resolution and coverage affect the fit.',
      ),
    ],
    notes: [
      t(
        'Los indicadores salen del modelo cinemático. La animación con física no recalcula esos indicadores. El modelo cinemático no resuelve colisiones en vuelo; la posición final por bloque se asigna para llenar la pila relajada.',
        'Indicators come from the kinematic model. Physics animation does not recalculate those indicators. The kinematic model does not solve in-flight collisions; final block positions are assigned to fill the relaxed pile.',
      ),
    ],
  },
  {
    id: 'topography',
    title: t('Topografía y flujo técnico', 'Topography and technical workflow'),
    panels: ['topography', 'scenarios'],
    intro: t(
      'Las superficies trianguladas permiten consultar cotas, apoyar collares y comparar levantamientos. El proyecto reúne geometría, productos, tiempos y parámetros de análisis.',
      'Triangulated surfaces support elevation queries, collar placement and survey comparisons. A project combines geometry, products, timing and analysis parameters.',
    ),
    equations: [
      eq(
        'Interpolación sobre un triángulo',
        'Triangle interpolation',
        math`z(P)=\lambda_1z_1+\lambda_2z_2+\lambda_3z_3,\qquad \lambda_1+\lambda_2+\lambda_3=1`,
        'λi: coordenadas baricéntricas de P en el triángulo; zi: cotas de vértices (m). Fuera de la superficie no hay cota interpolada válida. El diseño puede usar su piso configurado como respaldo donde falte terreno.',
        'λi: barycentric coordinates of P in the triangle; zi: vertex elevations (m). Outside the surface there is no valid interpolated elevation. Design may use its configured floor as fallback where terrain is missing.',
      ),
    ],
    notes: [
      t(
        'Flujo recomendado: banco y roca → perímetro y topografía → malla → carguío → iniciación → análisis. Los paneles indican cuándo falta perforación o carga para poder calcular.',
        'Suggested workflow: bench and rock → boundary and topography → pattern → charging → initiation → analysis. Panels indicate when holes or charge are missing.',
      ),
      t(
        'Los escenarios guardan alternativas del diseño para comparar resultados. La comparación depende de las mismas leyes y parámetros descritos aquí; no es un modelo físico adicional.',
        'Scenarios store design alternatives for result comparison. Comparison depends on the same laws and parameters described here; it is not an additional physical model.',
      ),
      t(
        'Las comprobaciones de diseño distinguen errores de datos, advertencias y referencias empíricas. Un resultado ausente indica falta de datos o una condición fuera del modelo, no necesariamente un valor cero.',
        'Design checks distinguish data errors, warnings and empirical references. A missing result indicates unavailable data or a condition outside the model, not necessarily a zero value.',
      ),
    ],
  },
];
