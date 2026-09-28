import type { Messages } from './es';

/** English UI texts. `satisfies Messages`: a missing or extra key is a compile error (D-11). */
export const en = {
  'toolbar.newProject': 'New project',
  'toolbar.openProject': 'Open project',
  'toolbar.saveProject': 'Save project',
  'toolbar.import': 'Import',
  'toolbar.importCsv': 'Holes from CSV…',
  'toolbar.importDxf': 'Holes, boundaries and topography from DXF…',
  'toolbar.export': 'Export',
  'toolbar.exportCsv': 'Holes to CSV',
  'toolbar.exportDxf': 'Plan to DXF',
  'toolbar.exportPdf': 'PDF report',
  'toolbar.undo': 'Undo',
  'toolbar.undoNamed': 'Undo: {label}',
  'toolbar.redo': 'Redo',
  'toolbar.redoNamed': 'Redo: {label}',
} satisfies Messages;
