/**
 * Realidad virtual y aumentada (D-19): botones de la pestaña Vista, menú de la muñeca y ficha del
 * taladro dentro del visor. `satisfies` exige las mismas claves en ambos idiomas.
 */
export const es = {
  'xr.enterVr': 'Entrar en VR',
  'xr.enterAr': 'Maqueta en AR',
  'xr.hint': 'Recorre el tajo en primera persona con un visor (Meta Quest). Solo lectura.',
  'xr.hintAr': 'Maqueta del tajo sobre una mesa real con passthrough (Meta Quest).',
  'xr.error': 'No se pudo abrir el visor: {message}',
  'xr.group': 'Realidad virtual',
  'xr.present': 'Presentar en VR',
  'xr.join': 'Unirse a la presentación',
  'xr.presentHint':
    'Entra al visor como presentador: quienes se unan siguen tu secuencia, capas y taladro.',
  'xr.joinHint': 'Entra al visor y sigue a quien presenta esta versión del proyecto.',
  'xr.room.presenting': 'Presentando · {n} conectados',
  'xr.room.following': 'Sigues a {name}',
  'xr.room.noPresenter': 'Esperando al presentador',

  'xr.menu.energy': 'Energía',
  'xr.menu.vibration': 'Vibración',
  'xr.menu.labels': 'Etiquetas',
  'xr.menu.play': 'Reproducir disparo',
  'xr.menu.pause': 'Pausar',
  'xr.menu.reset': 'Reiniciar',
  'xr.menu.pile': 'Desplazamiento de material',
  'xr.menu.toTable': 'Ver como maqueta',
  'xr.menu.toWalk': 'Escala real',
  'xr.menu.zoomIn': 'Maqueta más grande',
  'xr.menu.zoomOut': 'Maqueta más chica',
  'xr.menu.scale': 'Escala 1:{n}',
  'xr.menu.exit': 'Salir',

  'xr.info.title': 'Taladro {label}',
  'xr.info.charge': 'Carga: {kg} kg',
  'xr.info.delay': 'Retardo: {ms} ms',
  'xr.info.length': 'Longitud: {value} {unit}',
  'xr.info.diameter': 'Diámetro: {value} {unit}',
};

export const en = {
  'xr.enterVr': 'Enter VR',
  'xr.enterAr': 'AR tabletop',
  'xr.hint': 'Walk the pit in first person with a headset (Meta Quest). Read-only.',
  'xr.hintAr': 'Tabletop model of the pit over a real table with passthrough (Meta Quest).',
  'xr.error': 'Could not open the headset: {message}',
  'xr.group': 'Virtual reality',
  'xr.present': 'Present in VR',
  'xr.join': 'Join the presentation',
  'xr.presentHint':
    'Enter the headset as presenter: whoever joins follows your sequence, layers and hole.',
  'xr.joinHint': 'Enter the headset and follow whoever presents this project version.',
  'xr.room.presenting': 'Presenting · {n} connected',
  'xr.room.following': 'Following {name}',
  'xr.room.noPresenter': 'Waiting for the presenter',

  'xr.menu.energy': 'Energy',
  'xr.menu.vibration': 'Vibration',
  'xr.menu.labels': 'Labels',
  'xr.menu.play': 'Play blast',
  'xr.menu.pause': 'Pause',
  'xr.menu.reset': 'Reset',
  'xr.menu.pile': 'Blast movement',
  'xr.menu.toTable': 'View as tabletop',
  'xr.menu.toWalk': 'Real scale',
  'xr.menu.zoomIn': 'Larger model',
  'xr.menu.zoomOut': 'Smaller model',
  'xr.menu.scale': 'Scale 1:{n}',
  'xr.menu.exit': 'Exit',

  'xr.info.title': 'Hole {label}',
  'xr.info.charge': 'Charge: {kg} kg',
  'xr.info.delay': 'Delay: {ms} ms',
  'xr.info.length': 'Length: {value} {unit}',
  'xr.info.diameter': 'Diameter: {value} {unit}',
} satisfies Record<keyof typeof es, string>;
