# DNA Blast · Una nueva visión de la voladura de rocas

Documento base de funcionalidades **implementadas hoy** en la plataforma (rama `diseno-agente`),
para que Augusto lo pula como brochure. Tres capas: **Software · Agente · VR**.

> Nombre en el código: Cronos (antes BlastLab). Web, sin instalación; funciona en PC, tablet y en
> visores Meta Quest 3/3S/2.

---

## Capa 1 · Software de diseño y simulación de voladura

**Diseño de la malla**
- Perímetros dibujados, importados (DXF, GeoJSON, CSV) o creados por el agente; cara libre
  configurable por arista.
- Mallas cuadrada, rectangular y tresbolillo (equilátera), alineadas a la cara libre, sobre la
  topografía real; burden por modelos con fuente (Konya–Walter y otros, casos CR-01…CR-03).
- Precorte y fila buffer (amortiguación) en la pared final; zonas de mineral y desmonte con
  submalla propia.
- Grupos de taladros (producción, precorte, buffer) con plantilla de diámetro, sobreperforación,
  inclinación y carga.

**Carguío**
- Columna por decks: carga de fondo, columna, cámaras de aire, taco, iniciadores y detonador de
  fondo; catálogo de productos con ficha técnica y fuente (explosivos, detonadores, conectores,
  boosters, material de taco).
- Factor de carga (kg/m³ y kg/t), energía, SDOB, chequeo de agua vs. resistencia del explosivo.

**Amarre y tiempos**
- Nonel de superficie (en V, línea por línea, escalón) o electrónicos taladro a taladro.
- Isócronas, burden efectivo, MIC (carga máxima por retardo) con ventana configurable,
  detección de retardos coincidentes y **riesgo de tiros cortados**.

**Predicción de resultados**
- Fragmentación P80/X50 (Kuz-Ram y Swebrec regularizados) contra el objetivo por destino.
- Vibración PPV en puntos a proteger (K y β por punto, límites por estructura), onda aérea.
- Proyección (flyrock) con radio de seguridad; energía y daño (Holmberg–Persson).
- **Pila de material simulada**: desplazamiento, esponjamiento, dilución mineral/desmonte, con
  animación física del vuelo del material.

**Topografía y datos**
- Levantamientos con fecha por mina (TIN, líneas, ortofoto), reutilizados por varios proyectos;
  el banco y las bocas se apoyan en el terreno real.
- Proyectos por empresa → mina → proyecto, con **versiones inmutables**, historial y auditoría;
  roles administrador, diseñador y revisor.

**Reportes y escenarios**
- Escenarios comparables, reporte PDF con supuestos, exportación DXF, PNG y TSV.
- Español e inglés completos.

---

## Capa 2 · Agente de voladura (IA conversacional)

Un ingeniero de voladura virtual que **diseña conversando**, por texto o por voz en vivo (manos
libres), en la web y dentro del visor.

**Arquitectura en capas de conocimiento** (ver `CAPAS-CONOCIMIENTO.md`):
1. **Skill de experto** en perforación y voladura: entrevista previa obligatoria (macizo, agua,
   terreno reactivo, mineral/desmonte, P80 objetivo, qué proteger) y reglas guía con fuente.
2. **Conocimiento general**: voladura teórica, marco teórico, conceptos prácticos, transcripciones y
   recomendaciones de especialistas.
3. **Capa de la empresa** que usa el software (p. ej. la empresa de explosivos que da el servicio):
   sus procedimientos y su **catálogo de explosivos**.
4. **Capa del sitio** (la mina cliente): procedimientos de sitio, condiciones geológicas y
   parámetros.
5. **Capa del proyecto**: sus topografías, los explosivos con los que cuenta (subconjunto del
   catálogo de la empresa) y sus lecciones aprendidas.
   La capa más cercana al diseño manda; el agente cita de dónde sale cada criterio.

**Qué hace**
- Propone malla, explosivo, taco y tiempos para las condiciones del sitio, y **los aplica** al
  aceptar; precorte, buffer, zonas mineral/desmonte.
- Carga, amarra, predice y reporta: P80 vs. objetivo, PPV en la comunidad vs. límite, flyrock,
  tiros cortados, gases (NOx), esponjamiento y desplazamiento de la pila. Itera: «baja la
  vibración», «quiero más fino», «elimina el taladro B8».
- **Presets y escenarios**: «precarga la configuración anterior», «¿qué presets hay?» muestra una
  lista para elegir (tocar, señalar con el mando o decir el nombre); guarda presets por empresa o
  por sitio.
- **Edita todo**: perímetros (renombrar, mover, mover vértices), taladros (rangos «153-166»,
  grupos «precorte»), puntos a proteger.
- **Mueve la cámara** a lo que habla: «muéstrame desde la cara libre», «llévame a la comunidad».
- Al cargar una topografía o un perímetro nuevo **pregunta si se usa** para la voladura.
- **Dibujo en vivo**: cada cambio se dibuja como lo haría la perforadora (taladro por taladro, la
  carga sube, el amarre sigue la señal) mientras el agente habla.
- Tarjetas de reporte en pantalla y en el visor con los números clave.
- Honestidad: solo informa lo que hizo una herramienta; los números salen de los cálculos de la
  app, nunca de la IA. Todo se deshace.
- Registro de cada conversación (qué se dijo, qué herramienta, con qué argumentos y resultado).

---

## Capa 3 · Realidad virtual y extendida (Meta Quest)

WebXR en la misma web, sin app nativa.

- **Tres escenarios**: maqueta sobre la mesa real (realidad mixta, passthrough), dentro de la
  voladura a escala real (realidad virtual) y maqueta aislada.
- Taladros, mapas de energía y vibración, secuencia de disparo con el vuelo del material, pila,
  leyendas y ficha del taladro con su columna de carga.
- **Agente por voz dentro del visor**: diseña, muestra resultados y mueve la vista.
- Multiusuario: presentador y espectadores (también desde la web) en la misma sala, con avatares.
- **«Llévame al terreno»**: el agente te deja de pie sobre el terreno real donde pidas (la voladura,
  el taladro 12, la comunidad, frente a la cara libre, detrás, en la cresta del banco, vista general),
  con una transición suave desde la maqueta.
- Durante la secuencia de disparo se ve el vuelo del material y un contador de taladros disparados;
  si estás dentro del radio de proyección, el agente te lleva a un punto seguro.
- **Mandos como entrada principal** (y manos): gatillo para elegir, teletransporte en arco con el
  stick, giro por saltos, A para hablar, B/Y sostenido para salir; con manos, pellizco o señalar y
  sostener.
- Listas de opciones (presets, escenarios, «¿usamos esta topografía?») que se eligen con el rayo.

---

## Conceptos para la charla (XR)

- **Realidad virtual (VR)**: inmersión total en un entorno generado (la voladura a escala real).
- **Realidad aumentada (AR)**: información digital sobre el mundo real (p. ej. en el celular).
- **Realidad mixta (MR)**: lo digital se ancla y responde al espacio real (la maqueta sobre la mesa
  real del Quest).
- **Realidad extendida (XR)**: el término paraguas que agrupa VR, AR y MR.
