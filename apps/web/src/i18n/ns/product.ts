/**
 * Las dos herramientas de Cronos: Open Pit (superficial) y Underground (subterráneo), conectadas
 * por la mina. `satisfies` exige las mismas claves en ambos idiomas.
 */
export const es = {
  'product.surface': 'Cronos Open Pit',
  'product.underground': 'Cronos Underground',
  'product.kind.surface': 'Open Pit (superficial)',
  'product.kind.underground': 'Underground (subterráneo)',
  'product.badge.surface': 'Open Pit',
  'product.badge.underground': 'Underground',
  'product.enter.surface': 'Entrar a Open Pit',
  'product.enter.underground': 'Entrar a Underground',
  'product.enterHint.surface':
    'Bancos a cielo abierto: malla, cara libre, simulación de la pila y vibración.',
  'product.enterHint.underground':
    'Túneles, chimeneas y tajeos: métodos de minado, labores reales y simulación.',
  'product.count': '{n} proyectos',
  'product.countOne': '1 proyecto',
  'product.projectsOf': 'Proyectos de {tool}',
  'product.empty': 'Esta mina todavía no tiene proyectos de {tool}.',
  'product.newIn': 'Proyecto nuevo de {tool}',
  'product.shared':
    'La topografía, los levantamientos y los perímetros de la mina se comparten entre ambas herramientas.',
  'product.others': 'Proyectos de {tool} de esta mina (solo visualización)',
  'product.othersEmpty': 'No hay proyectos de {tool} en esta mina.',
  'product.view': 'Ver',
  'product.viewOthers.surface': 'Ver proyectos superficiales de esta mina',
  'product.viewOthers.underground': 'Ver proyectos subterráneos de esta mina',
  'product.othersLoading': 'Cargando proyectos…',
  'product.goToMine': 'Ir a {tool} en esta mina',
  'product.crossView': 'Solo visualización · proyecto de {tool}',
  'product.crossViewHint':
    'Estás en {current}: puedes ver el diseño, los taladros y los resultados, pero no editarlos.',
  'product.workHere': 'Trabajar aquí',
  'product.backTo': 'Volver a {tool}',
  'product.workDialogTitle': '¿Quieres hacer un proyecto de perforación y voladura aquí?',
  'product.workDialogBody':
    'Esto se hace en {tool}. Ahí puedes trabajar en este proyecto o crear uno nuevo en la misma mina, con la misma topografía.',
  'product.openThere': 'Abrir este proyecto en {tool}',
  'product.createThere': 'Crear un proyecto nuevo en {tool}',
  'product.keepViewing': 'Seguir viendo',
  'product.attempt': 'Solo visualización: «{label}» se hace en {tool}.',
};

export const en = {
  'product.surface': 'Cronos Open Pit',
  'product.underground': 'Cronos Underground',
  'product.kind.surface': 'Open Pit (surface)',
  'product.kind.underground': 'Underground',
  'product.badge.surface': 'Open Pit',
  'product.badge.underground': 'Underground',
  'product.enter.surface': 'Enter Open Pit',
  'product.enter.underground': 'Enter Underground',
  'product.enterHint.surface':
    'Open-pit benches: pattern, free face, muckpile simulation and vibration.',
  'product.enterHint.underground':
    'Drifts, raises and stopes: mining methods, real workings and simulation.',
  'product.count': '{n} projects',
  'product.countOne': '1 project',
  'product.projectsOf': '{tool} projects',
  'product.empty': 'This mine has no {tool} projects yet.',
  'product.newIn': 'New {tool} project',
  'product.shared': 'The mine topography, surveys and perimeters are shared by both tools.',
  'product.others': '{tool} projects of this mine (view only)',
  'product.othersEmpty': 'There are no {tool} projects in this mine.',
  'product.view': 'View',
  'product.viewOthers.surface': 'View surface projects of this mine',
  'product.viewOthers.underground': 'View underground projects of this mine',
  'product.othersLoading': 'Loading projects…',
  'product.goToMine': 'Go to {tool} in this mine',
  'product.crossView': 'View only · {tool} project',
  'product.crossViewHint':
    'You are in {current}: you can see the design, holes and results, but not edit them.',
  'product.workHere': 'Work here',
  'product.backTo': 'Back to {tool}',
  'product.workDialogTitle': 'Do you want to make a drill and blast project here?',
  'product.workDialogBody':
    'This is done in {tool}. There you can work on this project or create a new one in the same mine, with the same topography.',
  'product.openThere': 'Open this project in {tool}',
  'product.createThere': 'Create a new project in {tool}',
  'product.keepViewing': 'Keep viewing',
  'product.attempt': 'View only: “{label}” is done in {tool}.',
} satisfies Record<keyof typeof es, string>;
