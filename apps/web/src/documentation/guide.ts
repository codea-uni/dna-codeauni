/**
 * «Funciones del programa»: guía de uso por pantalla (Open Pit y Underground), para qué sirve cada
 * panel y los pasos típicos. Texto de la Documentación; mantener al día cuando cambie un panel.
 */
import type { Text } from './content';

const t = (es: string, en: string): Text => ({ es, en });

export interface GuideItem {
  title: Text;
  /** Para qué sirve. */
  purpose: Text;
  /** Pasos típicos. */
  steps: Text[];
  /** Panel de la cinta que lo abre (id de `WORKSPACE_PANELS`), si hay. */
  panel?: string;
}

export interface GuideChapter {
  id: string;
  title: Text;
  intro: Text;
  items: GuideItem[];
}

export const guideChapters: GuideChapter[] = [
  {
    id: 'guide.start',
    title: t('Cómo se organiza Cronos', 'How Cronos is organised'),
    intro: t(
      'Cronos tiene dos herramientas conectadas por la mina: Open Pit (voladuras de banco) y Underground (frentes, chimeneas y tajeos). Ambas comparten la topografía, los levantamientos, los perímetros y los puntos de control de vibración de la mina.',
      'Cronos has two tools connected by the mine: Open Pit (bench blasts) and Underground (faces, raises and stopes). Both share the mine topography, surveys, perimeters and vibration control points.',
    ),
    items: [
      {
        title: t('Minas y proyectos', 'Mines and projects'),
        purpose: t(
          'Cada proyecto es una voladura (o un conjunto de escenarios) dentro de una mina. El tipo del proyecto decide qué paneles se ven.',
          'Each project is a blast (or a set of scenarios) within a mine. The project type decides which panels are shown.',
        ),
        steps: [
          t(
            'Elija la mina y la herramienta (Open Pit o Underground) en la página de inicio.',
            'Choose the mine and the tool (Open Pit or Underground) on the home page.',
          ),
          t(
            'Cree un proyecto nuevo o abra un ejemplo completo desde «Primeros pasos».',
            'Create a new project or open a complete example from «Getting started».',
          ),
          t(
            'Los cambios se guardan con historial: deshacer y rehacer funcionan en todas las herramientas.',
            'Changes are saved with history: undo and redo work in every tool.',
          ),
        ],
      },
      {
        title: t('Cinta, ventanas y panel derecho', 'Ribbon, windows and right panel'),
        purpose: t(
          'La cinta superior abre cada herramienta en una ventana flotante que se puede mover, acoplar o cerrar; el plano 3D queda siempre visible. El panel derecho tiene Selección, Vista y Resultados.',
          'The top ribbon opens each tool in a floating window that can be moved, docked or closed; the 3D view stays visible. The right panel holds Selection, View and Results.',
        ),
        steps: [
          t(
            'Una herramienta gris todavía no aplica: el aviso dice qué falta (por ejemplo, cargar los taladros).',
            'A greyed-out tool does not apply yet: the notice says what is missing (for example, charging the holes).',
          ),
          t(
            'Escape cierra la ventana activa; los atajos del plano no actúan mientras escribe en un campo.',
            'Escape closes the active window; canvas shortcuts do not act while typing in a field.',
          ),
        ],
      },
      {
        title: t('Transparencia de los cálculos', 'Calculation transparency'),
        purpose: t(
          'Cada resultado tiene un botón «Detalle» que muestra el modelo, la fórmula, los valores que está usando ese cálculo, la confianza, los supuestos y las reglas de respaldo. Donde hay varias metodologías implementadas, un selector permite elegir la que use su equipo.',
          'Every result has a «Details» button showing the model, the formula, the values that calculation is using, the confidence, the assumptions and the supporting rules. Where several methodologies are implemented, a selector lets you choose the one your team uses.',
        ),
        steps: [
          t(
            'Pulse «Detalle» junto al resultado: se despliega debajo, en la misma ventana.',
            'Press «Details» next to the result: it opens below, in the same window.',
          ),
          t(
            'Cambie la metodología en el selector: el cálculo se rehace con el modelo elegido y se guarda en el proyecto.',
            'Change the methodology in the selector: the calculation reruns with the chosen model and is saved in the project.',
          ),
          t(
            '«Ver en Documentación» lleva a la ficha completa del modelo en «Modelos y fórmulas».',
            '«Open in Documentation» goes to the model’s full entry in «Models and formulas».',
          ),
        ],
      },
      {
        title: t('Asistente IA', 'AI assistant'),
        purpose: t(
          'Diseña conversando (texto o voz): pregunta las condiciones del sitio, aplica malla, carga y amarre, y predice P80, PPV y proyección con los mismos modelos del programa.',
          'Designs by conversation (text or voice): asks for site conditions, applies pattern, charge and tie-up, and predicts P80, PPV and flyrock with the program’s own models.',
        ),
        steps: [
          t(
            'Abra «Asistente IA» en la cinta y describa la voladura.',
            'Open «AI assistant» in the ribbon and describe the blast.',
          ),
          t(
            'Revise cada cambio en el plano; todo se puede deshacer.',
            'Review every change on the canvas; everything can be undone.',
          ),
        ],
        panel: 'ai',
      },
    ],
  },
  {
    id: 'guide.surface',
    title: t('Open Pit: pantallas y paneles', 'Open Pit: screens and panels'),
    intro: t(
      'Flujo típico de una voladura de banco: perímetro y cara libre → malla → carga → tiempos → análisis (energía, fragmentación, vibración, pila) → escenarios y reporte.',
      'Typical bench-blast flow: perimeter and free face → pattern → charging → timing → analysis (energy, fragmentation, vibration, muckpile) → scenarios and report.',
    ),
    items: [
      {
        title: t('Voladura', 'Blast'),
        purpose: t(
          'Datos del banco (altura, cota, cara), roca, convenciones de sobreperforación y parámetros de cálculo.',
          'Bench data (height, elevation, face), rock, subdrilling conventions and calculation parameters.',
        ),
        steps: [
          t(
            'Defina altura de banco, roca y densidad antes de generar la malla.',
            'Set bench height, rock and density before generating the pattern.',
          ),
        ],
        panel: 'blast',
      },
      {
        title: t('Topografía', 'Topography'),
        purpose: t(
          'Importa levantamientos (superficie del banco, cara), perímetros y el modelo geotécnico de bloques.',
          'Imports surveys (bench surface, face), perimeters and the geotechnical block model.',
        ),
        steps: [
          t(
            'Importe la superficie o elija una de la mina; dibuje o importe el perímetro.',
            'Import the surface or pick one from the mine; draw or import the perimeter.',
          ),
          t(
            'Con un modelo geotécnico activo («Roca desde modelo geotécnico») la roca de cada taladro sale de su bloque.',
            'With an active geotechnical model («Rock from geotechnical model») each hole’s rock comes from its block.',
          ),
        ],
        panel: 'topography',
      },
      {
        title: t('Generar malla y grupos', 'Pattern and groups'),
        purpose: t(
          'Crea la malla (cuadrada, rectangular o tresbolillo) dentro del perímetro, con burden teórico de referencia; los grupos separan precorte, buffer y producción.',
          'Creates the pattern (square, rectangular or staggered) inside the perimeter, with a theoretical burden reference; groups separate presplit, buffer and production.',
        ),
        steps: [
          t(
            'Marque la cara libre, elija tipo, burden y espaciamiento y genere.',
            'Mark the free face, choose type, burden and spacing and generate.',
          ),
          t(
            'Use «Burden teórico» (Ash, Konya-Walter, Andersen) para comparar.',
            'Use «Theoretical burden» (Ash, Konya-Walter, Andersen) to compare.',
          ),
        ],
        panel: 'pattern',
      },
      {
        title: t('Carguío', 'Charging'),
        purpose: t(
          'Columna de cada taladro: explosivo, decks, taco, booster y agua. Calcula kg, factor de carga, SDOB y costos.',
          'Each hole’s column: explosive, decks, stemming, booster and water. Computes kg, loading factor, SDOB and costs.',
        ),
        steps: [
          t(
            'Aplique una regla de carga a todos o por grupo; edite decks en el editor de columna.',
            'Apply a charge rule to all holes or per group; edit decks in the column editor.',
          ),
          t(
            'El semáforo de SDOB en la vista avisa riesgo de proyección.',
            'The SDOB traffic light in the view warns of flyrock risk.',
          ),
        ],
        panel: 'charge',
      },
      {
        title: t('Tiempos', 'Timing'),
        purpose: t(
          'Amarre y retardos: tiempos de detonación, isócronas, burden efectivo y carga máxima por retardo.',
          'Tie-up and delays: firing times, isochrones, effective burden and maximum charge per delay.',
        ),
        steps: [
          t(
            'Amarre automático desde el taladro de inicio o a mano; reproduzca la secuencia.',
            'Automatic tie-up from the initiation hole or by hand; play the sequence.',
          ),
        ],
        panel: 'timing',
      },
      {
        title: t('Energía', 'Energy'),
        purpose: t(
          'Mapa de PPV de campo cercano (Holmberg–Persson) o densidad de carga y halos de daño en múltiplos del PPV crítico.',
          'Near-field PPV map (Holmberg–Persson) or charge density, and damage halos as multiples of the critical PPV.',
        ),
        steps: [
          t(
            'Active el mapa, elija la cota o el terreno y revise «Detalle» para ver K, α y β.',
            'Enable the map, choose the elevation or terrain and check «Details» for K, α and β.',
          ),
        ],
        panel: 'energy',
      },
      {
        title: t('Fragmentación', 'Fragmentation'),
        purpose: t(
          'Curva granulométrica, P20/P50/P80, sobretamaño y finos con Kuz-Ram y Swebrec o Rosin-Rammler.',
          'Size curve, P20/P50/P80, oversize and fines with Kuz-Ram and Swebrec or Rosin-Rammler.',
        ),
        steps: [
          t(
            'Elija la metodología (Cunningham 1987 o 2005) y la curva; las entradas se llenan solas desde la voladura.',
            'Choose the methodology (Cunningham 1987 or 2005) and the curve; inputs fill in from the blast.',
          ),
        ],
        panel: 'fragmentation',
      },
      {
        title: t('Vibración', 'Vibration'),
        purpose: t(
          'PPV en puntos de control y mapa, sobrepresión, proyección (Lundborg), límites por tipo de punto y calibración con sismógrafos.',
          'PPV at control points and map, airblast, flyrock (Lundborg), limits by point type and seismograph calibration.',
        ),
        steps: [
          t(
            'Agregue puntos de control (o use los de la mina) y sus límites.',
            'Add control points (or use the mine’s) and their limits.',
          ),
          t(
            'Elija la ley (USBM, Ambraseys-Hendron o Langefors-Kihlström) y calíbrela con mediciones.',
            'Choose the law (USBM, Ambraseys-Hendron or Langefors-Kihlström) and calibrate it with records.',
          ),
        ],
        panel: 'vibration',
      },
      {
        title: t('Pila de material', 'Muckpile'),
        purpose: t(
          'Desplazamiento y forma de la pila, clases de tamaño, dominios (dilución), animación y calibración con una superficie medida.',
          'Displacement and pile shape, size classes, domains (dilution), animation and calibration against a measured surface.',
        ),
        steps: [
          t(
            'Elija el modelo de velocidad, calcule la pila y compare con el levantamiento posterior.',
            'Choose the velocity model, compute the pile and compare it with the post-blast survey.',
          ),
        ],
        panel: 'muckpile',
      },
      {
        title: t('Escenarios, librería y resultados', 'Scenarios, library and results'),
        purpose: t(
          'Escenarios compara variantes del diseño; Librería guarda explosivos, accesorios y rocas con su ficha; Resultados resume carga, tiempos, chequeos y costos y exporta el reporte.',
          'Scenarios compares design variants; Library stores explosives, accessories and rocks with their data sheet; Results summarises charge, timing, checks and costs and exports the report.',
        ),
        steps: [
          t(
            'Duplique el escenario, cambie un parámetro y compare indicadores lado a lado.',
            'Duplicate the scenario, change a parameter and compare indicators side by side.',
          ),
        ],
        panel: 'scenarios',
      },
    ],
  },
  {
    id: 'guide.underground',
    title: t('Underground: pantallas y paneles', 'Underground: screens and panels'),
    intro: t(
      'El panel Subterránea diseña en 2D (frente, abanicos o plantilla por método), lleva el diseño al 3D sobre la labor y lo analiza. Carguío, Tiempos, Energía, Fragmentación y Vibración aplican igual que en Open Pit.',
      'The Underground panel designs in 2D (face, rings or method template), takes the design to 3D on the working and analyses it. Charging, Timing, Energy, Fragmentation and Vibration work as in Open Pit.',
    ),
    items: [
      {
        title: t('Método de minado', 'Mining method'),
        purpose: t(
          'Plantillas UG-01 a UG-20 (desarrollo, chimeneas, tajeos) con malla, explosivo y secuencia típicos de manuales.',
          'UG-01 to UG-20 templates (development, raises, stopes) with handbook pattern, explosive and sequence.',
        ),
        steps: [
          t(
            'Elija el método, ajuste los parámetros (burden 0 = Langefors automático) y revise el factor de carga objetivo.',
            'Choose the method, adjust the parameters (burden 0 = automatic Langefors) and check the target powder factor.',
          ),
          t(
            '«Llevar al diseño 3D» crea los taladros en la voladura activa.',
            '«Send to 3D design» creates the holes in the active blast.',
          ),
        ],
        panel: 'underground',
      },
      {
        title: t('Frente de túnel', 'Tunnel face'),
        purpose: t(
          'Ronda por el método sueco de Holmberg: alivio, secciones del cuele, ayudas, zapateras y contorno (con voladura suave opcional).',
          'Round by the Holmberg Swedish method: relief, cut squares, stoping, lifters and contour (optional smooth blasting).',
        ),
        steps: [
          t(
            'Defina sección, diámetros, alivios y explosivo; revise avance, factor de carga y el chequeo empírico N.',
            'Set the section, diameters, relief holes and explosive; check advance, powder factor and the empirical N check.',
          ),
          t(
            'Ubique el frente en la labor (estación) y envíe al 3D.',
            'Place the face on the working (station) and send to 3D.',
          ),
        ],
        panel: 'underground',
      },
      {
        title: t('Abanicos (tajeo)', 'Rings (stope)'),
        purpose: t(
          'Anillos de taladros largos desde la galería: espaciamiento de fondos, collar alternado, carga y KPI por anillo y por disparo.',
          'Long-hole rings from the drive: toe spacing, alternating collars, charge and KPIs per ring and per firing.',
        ),
        steps: [
          t(
            'Defina galería, tajeo, pivote, S_toe y burden; revise taladros truncados y factor de carga.',
            'Set drive, stope, pivot, S_toe and burden; check truncated holes and powder factor.',
          ),
        ],
        panel: 'underground',
      },
      {
        title: t('Análisis', 'Analysis'),
        purpose: t(
          'Halos de energía en el plano del frente o del abanico, simulación de la voladura, pila de material, acoplamiento y corte por onda, cubicación y fragmentación por zonas.',
          'Energy halos on the face or ring plane, blast simulation, muckpile, coupling and wave cut-off, volume and fragmentation by zone.',
        ),
        steps: [
          t(
            '«Simular voladura» reduce la ventana a una barra y anima la secuencia en 3D.',
            '«Simulate blast» shrinks the window to a bar and animates the sequence in 3D.',
          ),
          t(
            'Revise los avisos de acoplamiento y corte; ajuste la eficiencia de avance y la calibración C.',
            'Check coupling and cut-off warnings; adjust advance efficiency and calibration C.',
          ),
        ],
        panel: 'underground',
      },
      {
        title: t('Vibración entre superficie y subterránea', 'Surface–underground vibration'),
        purpose: t(
          'Puntos de control 3D por tipo (comunidad, estructura, talud, labor) con distancia al segmento de carga y leyes por zona.',
          '3D control points by type (community, structure, slope, working) with distance to the charge segment and laws by zone.',
        ),
        steps: [
          t(
            'Use la ley subterránea calibrada; sin calibrar, el PPV es orientativo.',
            'Use the calibrated underground law; uncalibrated, PPV is indicative.',
          ),
        ],
        panel: 'vibration',
      },
    ],
  },
];
