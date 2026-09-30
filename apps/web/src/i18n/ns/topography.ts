/**
 * Topografía (D-16): capas, curvas de nivel e importación de levantamientos. `satisfies` exige
 * las mismas claves en ambos idiomas.
 */
export const es = {
  'topo.section': 'Topografía',
  'topo.layer.shade': 'Relieve sombreado',
  'topo.layer.contours': 'Curvas de nivel',
  'topo.layer.lines': 'Cresta, pie y líneas de referencia',
  'topo.contourInterval': 'Intervalo de curvas',
  'topo.shadeOpacity': 'Opacidad del relieve',
  'topo.cursorZ': 'Cota del terreno bajo el cursor',
};

export const en = {
  'topo.section': 'Topography',
  'topo.layer.shade': 'Shaded relief',
  'topo.layer.contours': 'Contour lines',
  'topo.layer.lines': 'Crest, toe and reference lines',
  'topo.contourInterval': 'Contour interval',
  'topo.shadeOpacity': 'Relief opacity',
  'topo.cursorZ': 'Ground elevation under the cursor',
} satisfies Record<keyof typeof es, string>;
