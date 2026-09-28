/**
 * Textos de la interfaz en español: fuente de las claves (D-11). Términos mineros según el
 * glosario de docs/theory/references/R1 §2. `{nombre}` se reemplaza con `t(clave, { nombre })`.
 */
export const es = {
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
};

export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;
