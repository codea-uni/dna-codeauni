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

  'xr.menu.energy': 'Energía',
  'xr.menu.vibration': 'Vibración',
  'xr.menu.labels': 'Etiquetas',
  'xr.menu.play': 'Reproducir',
  'xr.menu.pause': 'Pausar',
  'xr.menu.reset': 'Reiniciar',
  'xr.menu.table': 'En la mesa',
  'xr.menu.walk': 'Adentro',
  'xr.menu.model': 'Aislada',
  'xr.menu.place': 'Acomodar',
  'xr.menu.present': 'Presentar',
  'xr.menu.stopPresenting': 'Dejar de presentar',
  'xr.menu.pile': 'Material',
  'xr.menu.zoomIn': '+',
  'xr.menu.zoomOut': '−',
  'xr.menu.scale': '1:{n}',
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

  'xr.menu.energy': 'Energy',
  'xr.menu.vibration': 'Vibration',
  'xr.menu.labels': 'Labels',
  'xr.menu.play': 'Play',
  'xr.menu.pause': 'Pause',
  'xr.menu.reset': 'Reset',
  'xr.menu.table': 'On table',
  'xr.menu.walk': 'Inside',
  'xr.menu.model': 'Isolated',
  'xr.menu.place': 'Place',
  'xr.menu.present': 'Present',
  'xr.menu.stopPresenting': 'Stop presenting',
  'xr.menu.pile': 'Movement',
  'xr.menu.zoomIn': '+',
  'xr.menu.zoomOut': '−',
  'xr.menu.scale': '1:{n}',
  'xr.menu.exit': 'Exit',

  'xr.info.title': 'Hole {label}',
  'xr.info.charge': 'Charge: {kg} kg',
  'xr.info.delay': 'Delay: {ms} ms',
  'xr.info.length': 'Length: {value} {unit}',
  'xr.info.diameter': 'Diameter: {value} {unit}',
} satisfies Record<keyof typeof es, string>;
