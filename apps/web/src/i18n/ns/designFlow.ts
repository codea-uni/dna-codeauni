/**
 * Flujo de diseño en banco: banco y piso al generar la malla, avisos dentro de la app (cara libre,
 * reemplazos, ejemplos), carguío (taladros cortos, conservar detonadores) y borrador sin publicar.
 * `satisfies` exige las mismas claves en ambos idiomas.
 */
export const es = {
  'design.cancel': 'Cancelar',
  'design.selectThem': 'Seleccionarlos',
  'design.replace.title': 'Reemplazar la malla',
  'design.replace.ok': 'Reemplazar',
  'design.noFace.title': 'Falta la cara libre',
  'design.noFace.text':
    'El perímetro no tiene marcada la cara libre (el talud hacia donde sale el material). Sin ella el burden no se mide desde el talud y la voladura queda confinada: más vibración y peor fragmentación.\nPara marcarla: botón «Cara libre (talud)» de la cinta Diseño (tecla C) y clic en el borde del perímetro que da al talud. Después vuelve a generar la malla.',
  'design.noFace.mark': 'Marcar la cara libre',
  'design.noFace.generate': 'Generar igual',
  'design.noFace.howTo':
    'Haz clic en el borde del perímetro que da al talud; luego vuelve a «Generar malla».',
  'design.bench.title': 'Banco: altura y piso',
  'design.bench.suggested':
    'Sugerido: {floor} {unit} (terreno medio del perímetro {ground} {unit} − banco {height} {unit}).',
  'design.bench.useSuggested': 'Usar',
  'design.bench.hintTerrain':
    'Cada taladro va desde su boca, en el terreno, hasta la cota de piso más la sobreperforación. Donde el terreno baja hacia el piso los taladros salen cortos; donde queda bajo el piso no se crean.',
  'design.bench.hintFlat':
    'Sin topografía la boca queda en la cota de piso + la altura de banco, y el largo es la altura de banco más la sobreperforación.',
  'design.bench.applyTitle': 'Taladros existentes',
  'design.bench.applyText':
    'Hay {n} taladros con el largo calculado con el banco anterior. ¿Aplicar el cambio a esos taladros? Se recalculan sus bocas y largos (hasta el piso + la sobreperforación). Si eliges «Solo el valor», el cambio vale para las mallas nuevas.',
  'design.bench.onlyValue': 'Solo el valor',
  'design.bench.applyHoles': 'Aplicar a los {n} taladros',
  'design.bench.applied': 'Banco actualizado: {n} taladros con largo recalculado.',
  'design.belowFloor':
    '{n} puntos de la malla quedaron con la boca en la cota de piso ({floor}) o bajo ella y no se crearon.',
  'design.allBelowFloor':
    'No se creó ningún taladro: el terreno del perímetro está en la cota de piso ({floor}) o bajo ella. Revisa la cota de piso (Generar malla → Banco).',
  'design.shortHoles':
    '{n} taladros quedaron cortos (boca a menos de media altura de banco sobre el piso): el terreno baja hacia el piso. Revisa la cota de piso o bórralos.',
  'design.boundaryCreated':
    '{name} creado (área {area} m²). Siguiente: marca la cara libre (C) o genera la malla.',
  'design.example.title': 'Abrir el ejemplo «{name}»',
  'design.example.text':
    '¿Abrir el ejemplo como proyecto nuevo de la mina (recomendado) o reemplazar el diseño de «{current}»? Si lo reemplazas, el diseño actual se pierde al publicar.',
  'design.example.new': 'Proyecto nuevo',
  'design.example.replace': 'Reemplazar este',
  'design.example.open': 'Abrir el ejemplo',
  'design.example.message': 'Ejemplo «{name}»',
  'design.example.created': 'Ejemplo «{name}» abierto como proyecto nuevo.',
  'charge.applyOne': 'Aplicar solo al seleccionado',
  'charge.applyAllN': 'Aplicar a todos ({n})',
  'charge.keepDetonators':
    'Conservar el detonador y el retardo de cada taladro ({n} con detonador)',
  'charge.keepDetonatorsTitle':
    'Cambia solo explosivo, taco y prima: el detonador y su retardo siguen como están. Desmárcalo para poner el detonador de la regla.',
  'charge.detonatorLossTitle': 'Cambiar detonadores',
  'charge.detonatorReplace':
    'Esto reemplaza el detonador de {n} taladros por el de la regla: se pierden sus retardos programados.',
  'charge.detonatorRemove':
    'La regla no tiene detonador: esto quita los detonadores de {n} taladros (y sus tiempos de salida).',
  'charge.detonatorLossOk': 'Aplicar igual',
  'charge.tooShort': '{n} taladros más cortos que el taco de {stemming} {unit} quedaron sin carga',
  'charge.drillingCostHint':
    'Metros perforados × costo por metro: entra en el costo total de la voladura (Resultados).',
  'history.draftTitle': 'Cambios sin publicar',
};

export const en = {
  'design.cancel': 'Cancel',
  'design.selectThem': 'Select them',
  'design.replace.title': 'Replace the pattern',
  'design.replace.ok': 'Replace',
  'design.noFace.title': 'Free face missing',
  'design.noFace.text':
    'The boundary has no free face marked (the slope the rock moves towards). Without it the burden is not measured from the face and the blast is confined: more vibration and poorer fragmentation.\nTo mark it: «Free face (slope)» button on the Design ribbon (key C), then click the boundary edge on the slope. Then generate the pattern again.',
  'design.noFace.mark': 'Mark the free face',
  'design.noFace.generate': 'Generate anyway',
  'design.noFace.howTo': 'Click the boundary edge on the slope; then «Generate pattern» again.',
  'design.bench.title': 'Bench: height and floor',
  'design.bench.suggested':
    'Suggested: {floor} {unit} (median ground in the boundary {ground} {unit} − bench {height} {unit}).',
  'design.bench.useSuggested': 'Use',
  'design.bench.hintTerrain':
    'Each hole goes from its collar, on the ground, down to the floor elevation plus subdrill. Where the ground drops towards the floor the holes are short; where it is below the floor they are not created.',
  'design.bench.hintFlat':
    'Without topography the collar is at floor elevation + bench height, and the length is the bench height plus subdrill.',
  'design.bench.applyTitle': 'Existing holes',
  'design.bench.applyText':
    '{n} holes have their length computed with the previous bench. Apply the change to them? Their collars and lengths are recomputed (down to the floor + subdrill). With «Value only» the change applies to new patterns.',
  'design.bench.onlyValue': 'Value only',
  'design.bench.applyHoles': 'Apply to the {n} holes',
  'design.bench.applied': 'Bench updated: {n} holes with recomputed length.',
  'design.belowFloor':
    '{n} pattern points had the collar at or below the floor elevation ({floor}) and were not created.',
  'design.allBelowFloor':
    'No hole was created: the ground in the boundary is at or below the floor elevation ({floor}). Check the floor elevation (Generate pattern → Bench).',
  'design.shortHoles':
    '{n} holes are short (collar less than half a bench above the floor): the ground drops towards the floor. Check the floor elevation or delete them.',
  'design.boundaryCreated':
    '{name} created (area {area} m²). Next: mark the free face (C) or generate the pattern.',
  'design.example.title': 'Open the example «{name}»',
  'design.example.text':
    'Open the example as a new project of the mine (recommended) or replace the design of «{current}»? If you replace it, the current design is lost when publishing.',
  'design.example.new': 'New project',
  'design.example.replace': 'Replace this one',
  'design.example.open': 'Open the example',
  'design.example.message': 'Example «{name}»',
  'design.example.created': 'Example «{name}» opened as a new project.',
  'charge.applyOne': 'Apply to the selected hole only',
  'charge.applyAllN': 'Apply to all ({n})',
  'charge.keepDetonators': 'Keep each hole’s detonator and delay ({n} with detonator)',
  'charge.keepDetonatorsTitle':
    'Changes only explosive, stemming and booster: the detonator and its delay stay as they are. Uncheck to set the rule’s detonator.',
  'charge.detonatorLossTitle': 'Change detonators',
  'charge.detonatorReplace':
    'This replaces the detonator of {n} holes with the rule’s: their programmed delays are lost.',
  'charge.detonatorRemove':
    'The rule has no detonator: this removes the detonators of {n} holes (and their firing times).',
  'charge.detonatorLossOk': 'Apply anyway',
  'charge.tooShort': '{n} holes shorter than the {stemming} {unit} stemming were left uncharged',
  'charge.drillingCostHint':
    'Drilled metres × cost per metre: part of the total blast cost (Results).',
  'history.draftTitle': 'Unpublished changes',
} satisfies Record<keyof typeof es, string>;
