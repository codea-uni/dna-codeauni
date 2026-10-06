/**
 * Realidad virtual y aumentada (D-19): botones de la pestaña Vista, menú de la muñeca y ficha del
 * taladro dentro del visor. `satisfies` exige las mismas claves en ambos idiomas.
 */
export const es = {
  'xr.enterVr': 'Entrar en VR',
  'xr.hint':
    'Entra con un visor (Meta Quest): maqueta sobre tu mesa, dentro de la voladura o maqueta aislada. Solo lectura.',
  'xr.error': 'No se pudo abrir el visor: {message}',
  'xr.group': 'Realidad virtual',
  'xr.room.presenting': 'Presentando · {n} conectados',
  'xr.room.following': 'Sigues a {name}',
  'xr.room.noPresenter': 'Esperando al presentador',

  'xr.menu.energy': 'Energía',
  'xr.menu.vibration': 'Vibración',
  'xr.menu.labels': 'Etiquetas',
  'xr.menu.play': 'Reproducir disparo',
  'xr.menu.pause': 'Pausar',
  'xr.menu.reset': 'Reiniciar',
  'xr.menu.table': 'Maqueta sobre la mesa',
  'xr.menu.walk': 'Dentro de la voladura',
  'xr.menu.model': 'Maqueta aislada',
  'xr.menu.place': 'Acomodar en la mesa',
  'xr.menu.present': 'Presentar a los demás',
  'xr.menu.stopPresenting': 'Dejar de presentar',
  'xr.menu.pile': 'Desplazamiento de material',
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
  'xr.hint':
    'Enter with a headset (Meta Quest): tabletop model on your table, inside the blast or isolated model. Read-only.',
  'xr.error': 'Could not open the headset: {message}',
  'xr.group': 'Virtual reality',
  'xr.room.presenting': 'Presenting · {n} connected',
  'xr.room.following': 'Following {name}',
  'xr.room.noPresenter': 'Waiting for the presenter',

  'xr.menu.energy': 'Energy',
  'xr.menu.vibration': 'Vibration',
  'xr.menu.labels': 'Labels',
  'xr.menu.play': 'Play blast',
  'xr.menu.pause': 'Pause',
  'xr.menu.reset': 'Reset',
  'xr.menu.table': 'Model on the table',
  'xr.menu.walk': 'Inside the blast',
  'xr.menu.model': 'Isolated model',
  'xr.menu.place': 'Place on the table',
  'xr.menu.present': 'Present to others',
  'xr.menu.stopPresenting': 'Stop presenting',
  'xr.menu.pile': 'Blast movement',
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
