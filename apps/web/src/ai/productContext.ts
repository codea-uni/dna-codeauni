import { projectKind } from '@cronos/core';
import { isCrossView, useProjectSession } from '../server/projectSession';
import { session } from '../session';

const NAME = { surface: 'Cronos Open Pit', underground: 'Cronos Underground' } as const;

/**
 * Herramienta en uso y tipo del proyecto para el asistente (va en el prompt del sistema y en cada
 * nota de contexto): Cronos Open Pit (bancos a cielo abierto) o Cronos Underground (frentes y
 * abanicos). Si el proyecto es de la otra herramienta, está abierto solo para verlo.
 */
export function productContext(): string {
  const kind = projectKind(session.document.project);
  const cur = useProjectSession.getState().current;
  const tool = cur?.tool ?? kind;
  const parts = [
    `Tool in use: ${NAME[tool]}. Project type: ${kind === 'underground' ? 'underground (tunnel faces with the Swedish method and stope rings: use the underground tools; there is no bench pattern, free face or muckpile)' : 'surface / open pit (benches, pattern, free face, muckpile)'}.`,
  ];
  if (cur && isCrossView(cur))
    parts.push(
      `This project belongs to ${NAME[kind]} and is open ONLY FOR VIEWING from ${NAME[tool]}: you can read the design, holes, parameters and results, but every change is blocked. If the user wants to design or change anything, say it is done in ${NAME[kind]} and offer to open this project there (open_project with this project name and tool "${kind}") or to create a new ${kind} project in this mine (open_project create with type "${kind}").`,
    );
  parts.push(
    'Both tools share the mine topography, surveys and perimeters. Projects of the other type of the same mine can be listed with workspace and opened with open_project (with tool set to the current one they open view-only).',
  );
  return parts.join(' ');
}
