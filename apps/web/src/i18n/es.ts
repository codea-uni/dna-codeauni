/**
 * Textos de la interfaz en español: fuente de las claves (D-11). Términos mineros según el
 * glosario de docs/theory/references/R1 §2. `{nombre}` se reemplaza con `t(clave, { nombre })`.
 */
import * as app from './ns/app';
import * as auth from './ns/auth';
import * as core from './ns/core';
import * as panelsA from './ns/panelsA';
import * as panelsB from './ns/panelsB';

export const es = {
  ...app.es,
  ...auth.es,
  ...core.es,
  ...panelsA.es,
  ...panelsB.es,
  'toolbar.newProject': 'Proyecto nuevo',
  'toolbar.openProject': 'Abrir proyecto',
  'toolbar.saveProject': 'Guardar proyecto',
  'toolbar.import': 'Importar',
  'toolbar.importCsv': 'Taladros desde CSV…',
  'toolbar.importDxf': 'Taladros, perímetros y topografía desde DXF…',
  'toolbar.export': 'Exportar',
  'toolbar.exportCsv': 'Taladros a CSV',
  'toolbar.exportDxf': 'Plano a DXF',
  'toolbar.exportPdf': 'Informe PDF',
  'toolbar.undo': 'Deshacer',
  'toolbar.undoNamed': 'Deshacer: {label}',
  'toolbar.redo': 'Rehacer',
  'toolbar.redoNamed': 'Rehacer: {label}',
  'toolbar.settings': 'Ajustes del proyecto',
  'settings.title': 'Ajustes del proyecto',
  'settings.close': 'Cerrar',
  'settings.name': 'Nombre',
  'settings.crs': 'Sistema de coordenadas',
  'settings.epsg': 'Código EPSG',
  'settings.epsgHint': 'Obligatorio para importar (H-101). Perú: UTM WGS 84 zonas 17S, 18S y 19S.',
  'settings.crsName': 'Nombre del CRS',
  'settings.units': 'Unidades de visualización',
  'settings.unitsHint': 'Solo cambian lo que se muestra; los datos se guardan en SI.',
  'settings.length': 'Longitud',
  'settings.diameter': 'Diámetro',
  'settings.language': 'Idioma',
  'import.needsCrs':
    'Define el sistema de coordenadas (código EPSG) del proyecto antes de importar.',
  'toolbar.versions': 'Versiones autoguardadas',
  'versions.title': 'Versiones autoguardadas',
  'versions.hint':
    'Se guarda solo en este navegador, como máximo una versión por minuto; se conservan las 20 más recientes de cada proyecto.',
  'versions.empty': 'Todavía no hay versiones guardadas.',
  'versions.holes': '{n} taladros',
  'versions.restore': 'Restaurar',
  'versions.confirm':
    '¿Reemplazar el proyecto actual por la versión del {date}? Podrás volver a él desde esta lista.',
  'versions.restored': 'Recuperado «{name}» del {date}',
  'versions.unavailable': 'El autoguardado no está disponible en este navegador.',
  'toolbar.importGeoJson': 'Taladros, perímetros y caras libres desde GeoJSON…',
  'toolbar.importBoundariesCsv': 'Perímetros desde CSV…',
  'toolbar.exportGeoJson': 'Plano a GeoJSON',
  'groups.title': 'Grupos de taladros',
  'groups.hint':
    'Precorte, buffer y producción se cargan y amarran distinto (RM-18). Selecciona con el lazo y crea o asigna el grupo; luego selecciona el grupo para cargarlo o darle tiempos.',
  'groups.new': 'Nuevo grupo con la selección',
  'groups.assign': 'Asignar selección',
  'groups.unassign': 'Quitar selección de su grupo',
  'groups.select': 'Seleccionar sus taladros',
  'groups.remove': 'Borrar grupo',
  'groups.holes': '{n} taladros',
  'groups.none': 'Sin grupos.',
  'groups.defaultName': 'Grupo {n}',
  'groups.kind.presplit': 'Precorte',
  'groups.kind.buffer': 'Buffer',
  'groups.kind.production': 'Producción',
  'groups.kind.other': 'Otro',
  'groups.presplit.pb': 'Pb = {pb} MPa (UCS de la roca: {ucs} MPa) · f = {f}',
  'groups.presplit.spacing': 'Espaciamiento {s} {u} · máximo E = D·(Pb + RT)/RT = {e} {u}',
  'groups.presplit.noRt':
    'Falta la resistencia a tracción de la roca: no se calcula el espaciamiento máximo.',
  'groups.presplit.suggest': 'Carga para Pb = UCS: Ø {d} {u}',
  'groups.presplit.noCharge': 'Carga los taladros del grupo para calcular el precorte.',
  'groups.buffer.suggest':
    'Buffer sugerido: B = {b} {u} · S = 1,15·B = {s} {u} (con {w} kg por taladro y el FC de la producción, {pf} kg/t)',
  'groups.buffer.needProduction':
    'Para sugerir el buffer hace falta un grupo de producción con malla y carga, y la roca.',
  'groups.source': 'Fórmulas del curso (R1 F26, caso CR-01): orientan, no bloquean.',
  'burden.title': 'Burden teórico',
  'burden.hint':
    'Referencia para elegir el burden operativo; no bloquea (docs/theory/02 §1). Kd y Ks salen de las tablas de Konya y Walter (1990).',
  'burden.explosive': 'Explosivo',
  'burden.model': 'Modelo',
  'burden.reference': 'Referencia',
  'burden.use': 'Usar',
  'burden.ash': 'Ash (Kb)',
  'burden.konya': 'Konya–Walter',
  'burden.andersen': 'Andersen (L = H + J)',
  'burden.outOfRange':
    'El burden operativo ({b}) difiere {pct} % de la referencia: fuera de ±10 %.',
  'burden.stiffness': 'Rigidez H/B = {r} ({rating})',
  'burden.rating.poor': 'pobre',
  'burden.rating.fair': 'regular',
  'burden.rating.good': 'bueno',
  'burden.rating.excellent': 'excelente',
  'burden.spacing': 'Espaciamiento sugerido',
  'burden.stemming': 'Taco sugerido (0,7·B)',
  'burden.subdrill': 'Sobreperforación sugerida (0,3·B)',
  'burden.applySubdrill': 'Aplicar a la plantilla',
  'pattern.equilateral': 'Equilátera (S = 2B/√3)',
  'pattern.noFreeFace':
    'Malla generada sin cara libre: el burden no se mide desde una cara (RM-06). Marca la cara libre del perímetro con la herramienta C.',
  'scenarios.title': 'Escenarios',
  'scenarios.hint':
    'Un escenario es una variante completa del diseño (malla, cargas, amarre, retardos y parámetros). Guarda el diseño actual, modifícalo y compara los indicadores lado a lado.',
  'scenarios.save': 'Guardar diseño actual como escenario',
  'scenarios.namePrompt': 'Nombre del escenario',
  'scenarios.defaultName': 'Escenario {n}',
  'scenarios.none': 'Sin escenarios guardados.',
  'scenarios.load': 'Cargar',
  'scenarios.loadConfirm': '¿Reemplazar el diseño actual por «{name}»? Puedes deshacerlo.',
  'scenarios.remove': 'Borrar',
  'scenarios.compare': 'Comparar',
  'scenarios.current': 'Actual',
  'scenarios.computing': 'Calculando…',
  'scenarios.kpi.holes': 'Taladros (cargados)',
  'scenarios.kpi.explosive': 'Explosivo [kg]',
  'scenarios.kpi.drilled': 'Perforado [m]',
  'scenarios.kpi.loadingFactor': 'Factor de carga [kg/m³]',
  'scenarios.kpi.powderFactor': 'Factor de potencia [kg/t]',
  'scenarios.kpi.energyFactor': 'Factor de energía [MJ/t]',
  'scenarios.kpi.duration': 'Duración [ms]',
  'scenarios.kpi.mic': 'Carga máx. por retardo [kg]',
  'scenarios.kpi.micExtended': 'Con ventana ampliada [kg]',
  'scenarios.kpi.ppv': 'PPV máx. [mm/s]',
  'scenarios.kpi.exceedances': 'Puntos sobre el límite',
  'scenarios.kpi.checks': 'Errores / advertencias',
  'toolbar.exportPng': 'Plano a imagen PNG',
  'toolbar.copyTsv': 'Copiar tabla de taladros (hoja de cálculo)',
  'scenarios.copy': 'Copiar tabla',
  'toolbar.demo': 'Demostración (recorrido automático para video)',
  'demo.prev': 'Anterior',
  'demo.ch.intro': 'Cronos',
  'demo.ch.design': 'Diseño de malla',
  'demo.ch.charge': 'Carga por tramos',
  'demo.ch.view3d': 'Vista 3D',
  'demo.ch.timing': 'Amarre y tiempos',
  'demo.ch.sequence': 'Secuencia de detonación',
  'demo.ch.burden': 'Burden efectivo',
  'demo.ch.sdob': 'Semáforo de proyección',
  'demo.ch.displacement': 'Desplazamiento',
  'demo.ch.damage': 'Daño en la roca',
  'demo.ch.fragmentation': 'Fragmentación',
  'demo.ch.vibration': 'Vibración',
  'demo.ch.scenarios': 'Escenarios',
  'demo.ch.review': 'Revisión del diseño',
  'demo.ch.language': 'Bilingüe',
  'demo.ch.end': 'Resumen',
  'demo.fragmentation':
    'Fragmentación: tamaño medio y curva granulométrica con Kuz-Ram y Swebrec (P50 y P80), sobretamaño y finos.',
  'demo.pause': 'Pausar',
  'demo.resume': 'Continuar',
  'demo.next': 'Siguiente',
  'demo.exit': 'Salir (Esc)',
  'demo.intro':
    'Cronos: diseño y simulación de voladuras en el navegador. Ejemplo: banco de producción de ≈250 taladros, con coordenadas UTM y la cara libre al norte.',
  'demo.design':
    'Diseño: malla en tresbolillo generada dentro del perímetro y alineada a la cara libre. Grupos de producción y buffer, y burden teórico por Ash, Konya–Walter y Andersen.',
  'demo.charge':
    'Carga por tramos: explosivo de fondo, columna y taco, con booster. Kilos por taladro, factor de carga y profundidad escalada de enterramiento (SDOB) del taladro seleccionado.',
  'demo.view3d': 'Vista 3D del banco: cada tramo de la columna con el color de su material.',
  'demo.timing':
    'Tiempos: amarre en V desde la cara libre, con retardos de superficie y de fondo. Isócronas y tiempo de cada taladro.',
  'demo.sequence':
    'Simulación de la secuencia de detonación, taladro por taladro, en cámara lenta.',
  'demo.burden':
    'Burden efectivo: distancia de cada taladro a la cara libre en el momento en que sale, contando el alivio de los que ya salieron.',
  'demo.sdob':
    'Semáforo de proyección: la profundidad escalada de enterramiento de cada taladro por bandas (cráter, incontrolada, controlada, muy controlada).',
  'demo.displacement':
    'Desplazamiento: velocidad del burden (Zhang 2021) y alcance hacia la cara que se abre, taladro por taladro.',
  'demo.damage':
    'Daño en la roca: Holmberg–Persson cerca de la carga, con contornos en ¼, 1, 4 y 8 veces la velocidad crítica de la roca.',
  'demo.vibration':
    'Vibración: PPV por distancia escalada en los puntos de monitoreo, con límites por tipo de estructura y la carga admisible por retardo.',
  'demo.scenarios':
    'Escenarios: el mismo diseño con salida en V, en fila y en escalón, comparados lado a lado (carga por retardo, PPV y factores).',
  'demo.review':
    'Revisión del diseño: avisos de taco, sobreperforación, confinamiento, agua, booster, tiempos y cara libre, con las reglas del ingeniero.',
  'demo.language': 'Toda la interfaz está disponible en español e inglés.',
  'demo.end':
    'Cada cálculo se verifica con los casos de referencia del ingeniero de minas. Informe PDF, DXF, GeoJSON y CSV disponibles.',
};

export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;
