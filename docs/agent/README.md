# Agente de voladura por voz (rama `diseno-agente`)

Agente que diseña la voladura conversando: pregunta las condiciones del sitio, propone y aplica la
malla, el precorte, el buffer, la carga y el amarre dentro del perímetro, y predice P80, PPV,
proyección, tiros cortados y gases. Funciona por texto, por voz en vivo en la web y en el visor
(solo manos).

## Piezas

| Pieza                                                                                         | Archivo                                                                                       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Token efímero de Gemini Live (la clave no sale del servidor; 40 sesiones/h por usuario)       | `apps/server/src/routes/ai.ts` (`POST /api/ai/live-token`)                                    |
| Cliente de voz en vivo (WebSocket directo a Google, VAD en el navegador, manos libres)        | `apps/web/src/ai/live.ts`                                                                     |
| Botón «Conversar en vivo» en el panel IA                                                      | `apps/web/src/ai/LiveBar.tsx`                                                                 |
| Voz en vivo en el visor (panel, saludo, A pausa/interrumpe)                                   | `apps/web/src/xr/liveVoice.ts`                                                                |
| Instrucciones y entrevista                                                                    | `apps/web/src/ai/prompts.ts` + `apps/web/src/ai/skill/voladura.md` (copia de `PROMPT-VOZ.md`) |
| Reglas guía con fuente                                                                        | `apps/web/src/ai/skill/rules.ts` (de `CONOCIMIENTO-VOLADURA.md` y `reglas-agente.json`)       |
| Herramientas de criterio                                                                      | `apps/web/src/ai/blastTools.ts`                                                               |
| Condiciones del sitio                                                                         | `apps/web/src/ai/site.ts`                                                                     |
| Tiros cortados y recorte de zonas (núcleo, con tests)                                         | `packages/core/src/timing/cutoff.ts`, `packages/core/src/geometry/clip.ts`                    |
| Solo manos en VR (pellizco corto elige, una mano arrastra, dos manos giran/escalan/arrastran) | `packages/engine/src/xr/XrSession.ts`                                                         |

| Capas de conocimiento (general, empresa, sitio, proyecto) y catálogo de explosivos | `apps/server/src/routes/knowledge.ts`, `apps/web/src/ai/knowledge*.ts`, página `/knowledge` (ver `CAPAS-CONOCIMIENTO.md`) |
| Presets (empresa o sitio), escenarios, cámara, edición de perímetros y puntos, opciones | `apps/web/src/ai/sceneTools.ts`, `steps.ts`; tarjetas con opciones (`cards.ts`) |
| Aviso al cargar topografía o perímetro y opción elegida en una tarjeta | `apps/web/src/ai/designWatch.ts` |

| Espacio de trabajo por voz: listar minas/proyectos/topografías/perímetros, abrir o crear proyecto, traer topografía de la mina, usar o copiar perímetros, publicar versión | `apps/web/src/ai/workspaceTools.ts` (`workspace`, `open_project`, `use_topography`, `use_perimeter`, `save_version`) |
| Misma cuenta en varios dispositivos: el proyecto que abre uno lo abren los demás (y comparten la sala en vivo) | `apps/server/src/routes/rooms.ts` (`/api/me/ws`), `apps/web/src/server/deviceSync.ts` |

Funcionalidades para el brochure: `DNA-BLAST-FUNCIONALIDADES.md`.

Herramientas nuevas: `search_knowledge`, `company_explosives`, `enable_explosive`,
`save_project_note`, `presets`, `scenarios`, `set_camera`, `edit_perimeter`,
`edit_protected_point`, `show_choices`, `set_site_conditions`, `add_protected_point`, `recommend_design`,
`predict_results`, `evaluate_explosive`, `design_presplit`, `design_buffer`, `split_zone`,
`track_blocks`, `show_results`, `vr_view`, `add_working_point`, `vibration_report`,
`calibrate_vibration_law` (vibración entre superficie y subterránea, `apps/web/src/ai/vibrationTools.ts`), `track_blocks`, `show_results`, `vr_view`, `list_mining_methods` y `design_by_method` (plantillas
subterráneas por método de minado UG-01 a UG-19: `packages/core/src/underground/methods.ts`,
pestaña «Método de minado» del panel Subterránea, reglas UG-R en `docs/RULES.md` §8).

| Levantamientos de la mina: mover/girar (vector, centroide a un punto, «bajo la topografía»), tipo de cada labor (tajeo, galería…), nube → superficie TIN y DXF | `packages/core/src/topography/surveyTransform.ts`, `cloudSurface.ts`, `packages/core/src/underground/workingKinds.ts`, `apps/web/src/topography/surveyEdit.ts`, `apps/web/src/panels/SurveyTools.tsx`, herramientas `move_survey`, `set_working_kind`, `cloud_to_surface`, `export_survey_dxf` (`apps/web/src/ai/surveyTools.ts`) |

## Pendiente (supuestos a confirmar con el ingeniero)

- Vecindad (2·B) y margen (0 ms) del chequeo de tiros cortados: R0, sin fuente numérica.
- Escala de malla por material (×0,9 mineral, ×1,1 desmonte): guía a calibrar.
- Distancia precorte–buffer y P80 objetivo por tipo de chancadora: sin fuente (ver §14 de
  `CONOCIMIENTO-VOLADURA.md`).
- Las condiciones de la entrevista que no tienen lugar en el modelo (clase de macizo, material,
  P80 objetivo) se guardan por proyecto en el navegador; pasarlas al esquema con migración.

## Despliegue de prueba

`docker compose -p dna-agente -f docker-compose.agente.yml --env-file .env.agente up -d --build`
(contenedores `dna-agente*`, base propia, `https://voladura.codeauni.com`). Producción
(`docker-compose.yml`) no cambia.

## Pintado en vivo, cámara y registro

- **Pintado en vivo** (`packages/engine/src/build/`): lo que cambia una herramienta del asistente
  (`runTool` envuelve con `engine.beginBuild()`/`endBuild()`) se dibuja en orden de perforadora
  (fila por fila, en zigzag): cada taladro se perfora de la boca al fondo, la carga sube desde el
  fondo y el amarre se dibuja en el orden en que llega la señal (Dijkstra sobre los retardos). Los
  borrados dejan un anillo rojo. Solo es presentación: el documento tiene el cambio completo desde
  el primer cuadro. Aviso «Dibujando el diseño…» con «Cámara siguiendo» y «Saltar».
- **Cámara con seguimiento** (escritorio): encuadra el lote y se desliza hacia el cabezal con
  suavizado exponencial (k = 1 − e^(−λ·dt), como FleetView); tocar el mapa la suelta. En el visor
  no se mueve el mundo durante el dibujo.
- **Visor más suave**: la maqueta persigue su ubicación con suavizado (rápido al tomarla, lento en
  cambios de vista o zoom); las manos se filtran (~30 ms); con una mano solo se traslada (el giro de
  la muñeca temblaba) y con dos se estira, gira y corre. El giro por pasos, el teletransporte y el
  paso maqueta ↔ escala real siguen siendo cortes (suavizarlos marea).
- **Registro de conversaciones**: `POST /api/ai/log` guarda en `AI_LOG_DIR` (JSONL por día) lo que
  dijo cada uno y cada herramienta con argumentos y resultado. En la copia de prueba:
  `deploy/ai-logs/` (fuera de git).
