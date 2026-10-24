// Exporta los proyectos de ejemplo de Cronos a JSON (uno por archivo) en la carpeta indicada, para
// probar el servicio por HTTP y para la prueba de carga: `tsx src/scripts/export-examples.ts <carpeta>`.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES } from '@cronos/core';

const out = process.argv[2] ?? '.';
for (const ex of EXAMPLES) {
  const { project } = await ex.build();
  writeFileSync(join(out, `${ex.id}.json`), JSON.stringify(project));
  console.log(ex.id, project.blasts.map((b) => b.holes.length).join(','));
}
