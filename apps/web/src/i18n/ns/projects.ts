/**
 * Proyectos de una mina y su apertura en el editor (D-14). `satisfies` exige las mismas claves en
 * ambos idiomas.
 */
export const es = {
  'projects.title': 'Proyectos',
  'projects.empty': 'Esta mina todavía no tiene proyectos',
  'projects.emptyHint': 'Crea uno vacío con el nombre del banco o importa un .cronos.json.',
  'projects.emptyReviewer': 'Cuando un diseñador cree un proyecto, aparecerá aquí.',
  'projects.holes': '{n} taladros',
  'projects.by': '{author}, {date}',
  'projects.open': 'Abrir',
  'projects.new': 'Proyecto nuevo',
  'projects.newName': 'Nombre del proyecto nuevo',
  'projects.import': 'Importar .cronos.json',
  'projects.importHint': 'Un proyecto guardado en el navegador o descargado; entra como versión 1.',
  'projects.initialMessage': 'Versión inicial',
  'projects.importedMessage': 'Importado de {file}',
  'projects.loading': 'Abriendo el proyecto…',
  'projects.readOnly': 'Solo lectura',
  'projects.readOnlyHint': 'Tu rol (revisor) permite ver y comentar, no editar.',
  'projects.readOnlyAttempt': 'Solo lectura: tu rol no permite editar ({label}).',
  'projects.backToMine': 'Volver a la mina',
  'projects.error.crsMismatch': 'El EPSG del proyecto no coincide con el de la mina.',
  'projects.error.invalid': 'El archivo no es un proyecto válido.',
};

export const en = {
  'projects.title': 'Projects',
  'projects.empty': 'This mine has no projects yet',
  'projects.emptyHint': 'Create an empty one named after the bench, or import a .cronos.json.',
  'projects.emptyReviewer': 'When a designer creates a project, it will show up here.',
  'projects.holes': '{n} holes',
  'projects.by': '{author}, {date}',
  'projects.open': 'Open',
  'projects.new': 'New project',
  'projects.newName': 'New project name',
  'projects.import': 'Import .cronos.json',
  'projects.importHint': 'A project saved in the browser or downloaded; it becomes version 1.',
  'projects.initialMessage': 'Initial version',
  'projects.importedMessage': 'Imported from {file}',
  'projects.loading': 'Opening the project…',
  'projects.readOnly': 'Read-only',
  'projects.readOnlyHint': 'Your role (reviewer) can view and comment, not edit.',
  'projects.readOnlyAttempt': 'Read-only: your role cannot edit ({label}).',
  'projects.backToMine': 'Back to the mine',
  'projects.error.crsMismatch': 'The project EPSG does not match the mine.',
  'projects.error.invalid': 'The file is not a valid project.',
} satisfies Record<keyof typeof es, string>;
