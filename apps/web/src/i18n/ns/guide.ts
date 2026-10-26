/**
 * Agente guía: burbujas que señalan dónde está cada cosa, recorridos por tarea, ayuda ante errores
 * y buzón de mejoras. `satisfies` exige las mismas claves en ambos idiomas.
 */
export const es = {
  'guide.launcher': 'Guía',
  'guide.launcherHint': '¿Qué quieres hacer? Te muestro dónde está todo',
  'guide.welcome.title': '¿Qué quieres hacer hoy?',
  'guide.welcome.sub': 'Elige una tarea y te llevo paso a paso, o pregúntame con tus palabras.',
  'guide.welcome.next': 'Siguiente paso sugerido',
  'guide.welcome.more': 'Otras tareas',
  'guide.welcome.ask': 'Pregúntame: «¿dónde cargo los taladros?», «muéstrame el tajeo 2»…',
  'guide.welcome.send': 'Preguntar',
  'guide.welcome.feedback': 'Algo no funciona o quiero proponer una mejora',
  'guide.welcome.dontShow': 'No mostrar al entrar',
  'guide.close': 'Cerrar la guía',
  'guide.step': 'Paso {n} de {total}',
  'guide.next': 'Siguiente',
  'guide.back': 'Atrás',
  'guide.done': 'Listo',
  'guide.doIt': 'Hazlo por mí',
  'guide.waiting': 'Te espero: hazlo y sigo solo',
  'guide.notFound': 'No encuentro «{name}» en la pantalla ahora.',
  'guide.notFoundHint': 'Puede que necesite un dato previo. Pregúntame y te digo qué falta.',
  'guide.askPlaceholder': '¿Algo no funciona? Escríbeme…',
  'guide.thinking': 'Pensando…',
  'guide.report': 'Enviar al equipo',
  'guide.finished': '¡Terminaste! {title}',
  'guide.finishedSub': '¿Qué más quieres hacer?',
  'guide.error.offer': '¿Te explico este error y cómo resolverlo?',
  'guide.error.yes': 'Sí, explícame',
  'guide.error.ask':
    '[guide] Apareció este mensaje de error en pantalla: «{text}». Explícame en palabras simples por qué pasa y guíame (show_me) para resolverlo.',
  'guide.blocked': '«{name}» está bloqueado: {why}',
  'guide.blocked.holes': 'primero tiene que haber taladros (genera la malla o diseña el frente).',
  'guide.blocked.charge': 'primero hay que cargar los taladros.',
  'guide.blocked.generic': 'falta un paso previo.',
  'guide.blocked.go': 'Llévame a lo que falta',
  'guide.stuck': 'Parece que buscas algo. ¿Te ayudo?',
  'guide.stuck.yes': 'Sí, guíame',
  'guide.stuck.no': 'No, gracias',
  'guide.focus.hole': 'Taladro {name}',
  'guide.focus.perimeter': 'Polígono {name}',
  'guide.focus.working': 'Labor {name}',
  'guide.focus.point': 'Punto {name}',
  'guide.focus.face': 'Frente de túnel',
  'guide.focus.rings': 'Abanicos',

  'guide.fb.title': 'Cuéntanos qué pasó',
  'guide.fb.sub':
    'Lo recibe el equipo de CODEa UNI con lo que tenías en pantalla. Lo revisamos antes de cambiar nada.',
  'guide.fb.kind.bug': 'Algo no funciona',
  'guide.fb.kind.idea': 'Quiero una mejora',
  'guide.fb.kind.question': 'No entiendo algo',
  'guide.fb.text': '¿Qué intentabas hacer y qué pasó?',
  'guide.fb.shot': 'Adjuntar captura (opcional)',
  'guide.fb.shotPaste': 'También puedes pegarla con Ctrl+V',
  'guide.fb.shotRemove': 'Quitar captura',
  'guide.fb.send': 'Enviar',
  'guide.fb.cancel': 'Cancelar',
  'guide.fb.sent': '¡Gracias! Lo recibimos y lo revisaremos.',
  'guide.fb.failed': 'No se pudo enviar: {error}',

  'guide.tour.firstBlast': 'Diseñar una voladura de principio a fin',
  'guide.tour.topography': 'Cargar la topografía',
  'guide.tour.charge': 'Cargar los taladros',
  'guide.tour.tieUp': 'Hacer el amarre (secuencia de salida)',
  'guide.tour.simulate': 'Simular la voladura',
  'guide.tour.results': 'Ver resultados (fragmentación, vibración…)',
  'guide.tour.vibrationPoint': 'Poner un punto a proteger (vibración)',
  'guide.tour.save': 'Guardar una versión',
  'guide.tour.report': 'Sacar el informe en PDF',
  'guide.tour.navigate3d': 'Moverme en la vista 3D',
  'guide.tour.ugWorkings': 'Importar las labores de la mina (DXF/Surpac)',
  'guide.tour.ugFace': 'Diseñar el disparo de un frente',
  'guide.tour.ugRings': 'Diseñar abanicos en un tajeo',
  'guide.tour.ugMethod': 'Diseñar por método de minado (plantillas)',
  'guide.tour.ugAnalysis': 'Revisar el análisis subterráneo',
  'guide.tour.assistant': 'Pedirle cosas al asistente',

  'guide.s.boundary':
    'Elige «Dibujar perímetro» y marca el polígono sobre el plano: un clic por vértice y doble clic para cerrarlo.',
  'guide.s.freeFace':
    'Ahora «Cara libre»: haz clic en el borde del polígono que da al talud (por donde sale la roca).',
  'guide.s.openPattern': 'Abre la ventana «Generar malla».',
  'guide.s.generate':
    'Revisa burden, espaciamiento y diámetro, y pulsa «Generar malla». Los taladros aparecen en el polígono.',
  'guide.s.openCharge': 'Abre «Carga» para poner explosivo y taco a los taladros.',
  'guide.s.chargeAll':
    'Elige el explosivo, el taco y el iniciador, y pulsa «Aplicar a todos». Te aviso si algo no cuadra.',
  'guide.s.openTiming': 'Abre «Tiempos» para definir el amarre (en qué orden sale cada taladro).',
  'guide.s.tieUp':
    'Elige el tipo de amarre y los retardos entre taladros y entre filas, y pulsa «Generar amarre».',
  'guide.s.simulate':
    'Pulsa «Simular»: verás la secuencia de salida y cómo se mueve el material, en 3D.',
  'guide.s.results':
    'En «Análisis» tienes energía, fragmentación, vibración y la pila de material. Ábrelos cuando quieras.',
  'guide.s.homeTab': 'Ve a «Inicio».',
  'guide.s.importMenu': 'Abre el menú «Importar».',
  'guide.s.importTopo':
    'Elige «Topografía» y selecciona tu archivo (DXF, nube de puntos, malla…). Te pediré el sistema de coordenadas si falta.',
  'guide.s.importWorkings':
    'Elige «Labores subterráneas» (DXF o Surpac con túneles, galerías y tajeos).',
  'guide.s.chooseWorkings':
    'Pulsa «Elegir archivo» y busca tu DXF/Surpac. Luego eliges qué capas son labores.',
  'guide.s.monitor':
    'Elige «Punto de control» y haz clic donde está lo que quieres proteger (una casa, un talud, una labor).',
  'guide.s.openVibration':
    'Abre «Vibración» para ver cuánto llega a cada punto y si pasa el límite.',
  'guide.s.saveVersion':
    'Pulsa «Guardar versión» (arriba a la derecha). Queda en la mina y lo ve todo tu equipo.',
  'guide.s.exportMenu': 'Abre el menú «Exportar».',
  'guide.s.exportPdf': 'Elige «Informe PDF».',
  'guide.s.view3d': 'Pasa a la vista 3D.',
  'guide.s.orbit':
    'Arrastra con el botón izquierdo para girar alrededor del punto que tocas, con la rueda te acercas y con el botón derecho miras y vuelas con W A S D.',
  'guide.s.fit': '«Encuadrar» te devuelve a ver todo (tecla F centra lo que elegiste).',
  'guide.s.search':
    'Con «Buscar» (Ctrl+K) escribes lo que quieres hacer y lo ejecuta, sin buscar en los menús.',
  'guide.s.openUnderground': 'Abre la ventana «Subterránea».',
  'guide.s.ugFaceTab': 'Elige «Frente de túnel».',
  'guide.s.ugRingTab': 'Elige «Abanicos (tajeo)».',
  'guide.s.ugMethodTab': 'Elige «Método de minado»: plantillas listas para cada tipo de labor.',
  'guide.s.ugLocation':
    'Elige en qué labor va: el frente toma su dirección, pendiente y sección. Si no tienes labores, deja coordenadas a mano.',
  'guide.s.ugForm':
    'Completa la sección, la barra y el explosivo: el dibujo y los números se actualizan al instante.',
  'guide.s.ugSend': 'Pulsa «Llevar al diseño 3D» para poner los taladros en la mina.',
  'guide.s.ugAnalysis':
    'En «Análisis» ves los halos de daño, el acoplamiento, la fragmentación y la cubicación del disparo.',
  'guide.s.assistant':
    'Abre el asistente. Puedes escribir o hablar: «diseña el frente de la GL-420 a la progresiva 85», «¿cuánto vibra en la comunidad?».',
} as const;

export const en = {
  'guide.launcher': 'Guide',
  'guide.launcherHint': 'What do you want to do? I will show you where everything is',
  'guide.welcome.title': 'What do you want to do today?',
  'guide.welcome.sub': 'Pick a task and I will take you step by step, or ask in your own words.',
  'guide.welcome.next': 'Suggested next step',
  'guide.welcome.more': 'Other tasks',
  'guide.welcome.ask': 'Ask me: “where do I charge the holes?”, “show me stope 2”…',
  'guide.welcome.send': 'Ask',
  'guide.welcome.feedback': 'Something does not work or I want to suggest an improvement',
  'guide.welcome.dontShow': 'Do not show on start',
  'guide.close': 'Close the guide',
  'guide.step': 'Step {n} of {total}',
  'guide.next': 'Next',
  'guide.back': 'Back',
  'guide.done': 'Done',
  'guide.doIt': 'Do it for me',
  'guide.waiting': 'Waiting for you: do it and I will continue',
  'guide.notFound': 'I cannot find “{name}” on screen right now.',
  'guide.notFoundHint': 'It may need a previous step. Ask me and I will tell you what is missing.',
  'guide.askPlaceholder': 'Something not working? Write to me…',
  'guide.thinking': 'Thinking…',
  'guide.report': 'Send to the team',
  'guide.finished': 'Done! {title}',
  'guide.finishedSub': 'What else do you want to do?',
  'guide.error.offer': 'Shall I explain this error and how to fix it?',
  'guide.error.yes': 'Yes, explain',
  'guide.error.ask':
    '[guide] This error message appeared on screen: “{text}”. Explain in simple words why it happens and guide me (show_me) to fix it.',
  'guide.blocked': '“{name}” is locked: {why}',
  'guide.blocked.holes': 'there must be holes first (generate the pattern or design the face).',
  'guide.blocked.charge': 'the holes must be charged first.',
  'guide.blocked.generic': 'a previous step is missing.',
  'guide.blocked.go': 'Take me to what is missing',
  'guide.stuck': 'Looks like you are looking for something. Can I help?',
  'guide.stuck.yes': 'Yes, guide me',
  'guide.stuck.no': 'No, thanks',
  'guide.focus.hole': 'Hole {name}',
  'guide.focus.perimeter': 'Perimeter {name}',
  'guide.focus.working': 'Working {name}',
  'guide.focus.point': 'Point {name}',
  'guide.focus.face': 'Tunnel face',
  'guide.focus.rings': 'Rings',

  'guide.fb.title': 'Tell us what happened',
  'guide.fb.sub':
    'The CODEa UNI team receives it with what you had on screen. We review it before changing anything.',
  'guide.fb.kind.bug': 'Something does not work',
  'guide.fb.kind.idea': 'I want an improvement',
  'guide.fb.kind.question': 'I do not understand something',
  'guide.fb.text': 'What were you trying to do and what happened?',
  'guide.fb.shot': 'Attach a screenshot (optional)',
  'guide.fb.shotPaste': 'You can also paste it with Ctrl+V',
  'guide.fb.shotRemove': 'Remove screenshot',
  'guide.fb.send': 'Send',
  'guide.fb.cancel': 'Cancel',
  'guide.fb.sent': 'Thank you! We received it and will review it.',
  'guide.fb.failed': 'Could not send: {error}',

  'guide.tour.firstBlast': 'Design a blast from start to finish',
  'guide.tour.topography': 'Load the topography',
  'guide.tour.charge': 'Charge the holes',
  'guide.tour.tieUp': 'Tie-up (firing sequence)',
  'guide.tour.simulate': 'Simulate the blast',
  'guide.tour.results': 'See results (fragmentation, vibration…)',
  'guide.tour.vibrationPoint': 'Add a point to protect (vibration)',
  'guide.tour.save': 'Save a version',
  'guide.tour.report': 'Get the PDF report',
  'guide.tour.navigate3d': 'Move around the 3D view',
  'guide.tour.ugWorkings': 'Import the mine workings (DXF/Surpac)',
  'guide.tour.ugFace': 'Design a tunnel face round',
  'guide.tour.ugRings': 'Design rings in a stope',
  'guide.tour.ugMethod': 'Design by mining method (templates)',
  'guide.tour.ugAnalysis': 'Review the underground analysis',
  'guide.tour.assistant': 'Ask the assistant for things',

  'guide.s.boundary':
    'Pick “Draw boundary” and mark the polygon on the map: one click per vertex, double-click to close it.',
  'guide.s.freeFace':
    'Now “Free face”: click the edge of the polygon that faces the bench face (where the rock goes).',
  'guide.s.openPattern': 'Open the “Generate pattern” window.',
  'guide.s.generate':
    'Check burden, spacing and diameter, and press “Generate pattern”. The holes appear in the polygon.',
  'guide.s.openCharge': 'Open “Charge” to put explosive and stemming in the holes.',
  'guide.s.chargeAll':
    'Pick the explosive, stemming and primer, and press “Apply to all”. I will warn you if something is off.',
  'guide.s.openTiming': 'Open “Timing” to define the tie-up (the order in which each hole fires).',
  'guide.s.tieUp':
    'Pick the tie-up type and the delays between holes and rows, and press “Generate tie-up”.',
  'guide.s.simulate':
    'Press “Simulate”: you will see the firing sequence and how the material moves, in 3D.',
  'guide.s.results':
    '“Analysis” has energy, fragmentation, vibration and the muckpile. Open them whenever you want.',
  'guide.s.homeTab': 'Go to “Home”.',
  'guide.s.importMenu': 'Open the “Import” menu.',
  'guide.s.importTopo':
    'Pick “Topography” and select your file (DXF, point cloud, mesh…). I will ask for the coordinate system if missing.',
  'guide.s.importWorkings':
    'Pick “Underground workings” (DXF or Surpac with tunnels, drives and stopes).',
  'guide.s.chooseWorkings':
    'Press “Choose file” and find your DXF/Surpac. Then you pick which layers are workings.',
  'guide.s.monitor':
    'Pick “Monitoring point” and click where the thing to protect is (a house, a slope, a working).',
  'guide.s.openVibration': 'Open “Vibration” to see how much reaches each point and the limit.',
  'guide.s.saveVersion':
    'Press “Save version” (top right). It is stored in the mine and your whole team sees it.',
  'guide.s.exportMenu': 'Open the “Export” menu.',
  'guide.s.exportPdf': 'Pick “PDF report”.',
  'guide.s.view3d': 'Switch to the 3D view.',
  'guide.s.orbit':
    'Drag with the left button to orbit the point you touch, zoom with the wheel, and with the right button look around and fly with W A S D.',
  'guide.s.fit': '“Fit” brings everything back into view (F centers what you picked).',
  'guide.s.search':
    'With “Search” (Ctrl+K) you type what you want to do and it runs it, no menu hunting.',
  'guide.s.openUnderground': 'Open the “Underground” window.',
  'guide.s.ugFaceTab': 'Pick “Tunnel face”.',
  'guide.s.ugRingTab': 'Pick “Rings (stope)”.',
  'guide.s.ugMethodTab': 'Pick “Mining method”: ready templates for each kind of working.',
  'guide.s.ugLocation':
    'Pick the working it goes in: the face takes its direction, gradient and section. Without workings, keep manual coordinates.',
  'guide.s.ugForm':
    'Fill in the section, drill rod and explosive: the drawing and numbers update instantly.',
  'guide.s.ugSend': 'Press “Bring to the 3D design” to put the holes in the mine.',
  'guide.s.ugAnalysis':
    '“Analysis” shows damage halos, coupling, fragmentation and the volume of the round.',
  'guide.s.assistant':
    'Open the assistant. Type or talk: “design the face of GL-420 at chainage 85”, “how much vibration reaches the community?”.',
} satisfies Record<keyof typeof es, string>;
