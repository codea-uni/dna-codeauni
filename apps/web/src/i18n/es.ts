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
};

export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;
