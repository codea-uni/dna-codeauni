---
name: cronos-ux-interfaz
description: Úsala cuando diseñes, cambies, revises o califiques cualquier cosa visible de Cronos (apps/web) — pantalla, panel, ventana flotante, diálogo, cinta (ribbon), barra de estado, gráfico, aviso o texto — y al aplicar el diseño visual nuevo (colores, tipografía, espaciado, iconos), al decidir dónde va un control o cuántos clics cuesta una tarea, o al tratar accesibilidad (teclado, foco, contraste, lector de pantalla). Keywords - UX, UI, interfaz, layout, panel, ribbon, tokens, tema, accesibilidad, WCAG, atajos, velocidad.
---

# Cronos · UX/UI

## Principio

Cronos es una herramienta de trabajo diario para ingenieros de perforación y voladura en una PC de oficina. Una pantalla está bien si cumple, en este orden:

1. **Resultado correcto y explicable:** se ven el modelo, los parámetros y el estado de la regla (R0–R4).
2. **Pocos pasos:** se cuentan los clics y las teclas hasta el resultado.
3. **El plano siempre a la vista:** el diseño es el lienzo; los paneles lo acompañan, no lo tapan.
4. **Todo funciona con teclado** y se lee con lector de pantalla.

La estética viene después y nunca a costa de estos cuatro puntos. Si hay números que se escriben, carga también **cronos-entrada-numerica**. Para comprobar el resultado en el navegador, usa **cronos-verificar-ui**.

## Usuarios y contexto (`docs/theory/01` §1.4)

| Rol | Hace | Implicación para la UI |
|---|---|---|
| Diseñador (ingeniero P&V) | Diseña, simula, compara, informa | Es experto: densidad de información alta, atajos, edición por lotes |
| Revisor | Ve y comenta, **no edita** | Controles de edición ocultos o deshabilitados; el servidor decide los permisos |
| Administrador | Usuarios, roles, catálogos | Pantallas de gestión simples |

- **Equipo y entorno:** Chrome o Edge en una PC de oficina de gama media. La tableta de campo está fuera del alcance. La realidad virtual (Quest) sirve para presentar al cliente (D-19).
- **Herramientas que conocen:** vienen de JKSimBlast e I-Blast. Esperan sus *funciones*, pero sufren sus curvas de aprendizaje. **Nunca se copian su interfaz, sus textos ni sus constantes** (01 §1.5).

## Flujo canónico: 12 pasos (01 §4, `docs/REPORTS.md` I6)

1. Proyecto
2. Importar
3. Cara libre
4. Malla y grupos
5. Carguío
6. Amarres y retardos
7. Simular e isócronas
8. MIC y PPV
9. Guardar escenario
10. Duplicar y variar
11. Comparar
12. Informe

**Ningún cambio puede alargar este camino.** Antes de cambiar una pantalla, ubica a qué paso pertenece y cuenta los clics antes y después.

## Reglas de diseño de pantalla

1. **No tapar el plano.**
   - Los paneles de trabajo se abren anclados al borde izquierdo del visor, a toda su altura y con 460 px de ancho (`uiStore.floatPanel`).
   - Solo las tablas anchas (documentación, librería) se centran.
   - Un panel nuevo sigue esa misma regla.
2. **Un paso, un clic.** Si una pestaña de la cinta tiene un solo panel, al hacer clic en la pestaña se abre ese panel. El Asistente IA ya lo hace; Carguío está pendiente.
3. **Herramientas transversales siempre a mano.**
   - `MapControls`, sobre el plano, ofrece seleccionar, lazo, desplazar, zoom, encuadrar y planta/3D en cualquier pestaña.
   - Pendiente: el forzado (snap) solo está en la pestaña Vista.
4. **Lo que el usuario escribió sobrevive.**
   - Los formularios de panel usan `usePanelState`, no `useState`.
   - Malla, carguío y tiempos ya lo cumplen.
5. **El resultado junto a su causa.** Al cambiar un parámetro, la cifra que afecta (factor de carga, burden de referencia) se ve en el mismo panel y se actualiza en vivo.
6. **React no dibuja el diseño** (CLAUDE.md, regla 1).
   - Ningún panel recibe la lista de taladros para pintarla.
   - Cualquier cálculo O(n) sobre taladros va a `packages/workers`.
   - Hoy `ResultsPanel.tsx:24-41` lo incumple.
7. **Usa el blast activo** (`useActiveBlast`), nunca `blasts[0]`.
   - Hoy se usa `blasts[0]` en `actions.ts:217` y `:764`, y en `PropertiesPanel.tsx:231`.

## Avisos, errores y confirmaciones

| Situación | Tratamiento | Fuente |
|---|---|---|
| Regla con estado inferior a R3 | Aviso configurable, **nunca bloquea** | 01 §9, CLAUDE.md |
| Las cargas no suman el largo del taladro, o no hay detonador | Error | R3 / P-04 |
| Sin taco | Aviso rojo y confirmación | P-04 |
| Sin cara libre | Aviso y aceptación explícita | P-03 |
| Burden fuera de ±10 % de la referencia | Marca | H-305 |

**Un aviso nuevo es una regla de dominio.** Antes de programarla, regístrala en `docs/RULES.md` con su fuente humana y su estado R0–R4 (CLAUDE.md, regla de dominio 1). Si no hay fuente, el umbral es un parámetro editable y la duda se anota en `docs/QUESTIONS.md` §2.

**Forma de un aviso.** Lleva icono, texto y color, nunca solo color. Dice qué pasa, por qué y cómo se corrige, y nombra el taladro o grupo afectado. Debe ser persistente:
- en la lista «Revisión del diseño», con un clic que lleva al elemento;
- no solo en la barra de estado, que hoy desaparece a los 4–8 s y no tiene `aria-live` (`StatusBar.tsx:28-39`).

**Confirmaciones.**
- Si la acción se puede deshacer, no se pide confirmación: deshacer es la red de seguridad.
- Solo se confirma lo irreversible: descartar cambios sin guardar o borrar un proyecto.
- Se usa un diálogo propio, no `window.confirm`; hoy hay 15 llamadas a `window.confirm`.

## Textos y terminología

- **Todo texto visible pasa por `t()`/`useT()`**, con la clave en `i18n/ns/*.ts` en español y en inglés. Esto incluye `aria-label`, `title` y `placeholder`.
  - Hoy hay literales en `PatternPanel.tsx:140` («Burden»), `BurdenReference.tsx:87-89` y `FragmentationPanel.tsx:109`.
- **Las cifras pasan por `useFormat()`:** coma decimal en español. Ver cronos-entrada-numerica.
- **Términos del glosario** (`R1` §2) en la UI. Los nombres deben ser honestos:
  - «Profundidad escalada de enterramiento (SDOB)» no es lo mismo que «distancia escalada de vibración».
  - El factor de carga (kg/m³), el factor de potencia (kg/t) y el factor de energía (MJ/t) son tres cosas distintas y siempre llevan su unidad.
- **La interfaz habla al ingeniero, no al desarrollador:**
  - Sin rutas internas: `docs/theory/02 §1` aparece hoy en `i18n/es.ts:133`. Hay que citar la fuente humana, por ejemplo «Konya y Walter (1990)».
  - Sin códigos de requisito sueltos.
- **Explicabilidad:** junto a cada resultado de un modelo van el nombre del modelo, los parámetros usados y su estado R0–R4. Los valores estimados se marcan como tales («sin CR»).

## Sistema visual (aprobado el 2026-11-18, a partir de la referencia del usuario)

**Identidad:** roca volcánica de base, crisocola (turquesa) de acento, ámbar para tiempo y detonación, azurita para información. La referencia se adapta, no se copia: no lleva foto aérea de fondo ni un panel de agente fijo en el editor.

**Tokens** (`:root` en `apps/web/src/styles.css`, la única fuente; nunca se escribe un hex en TSX, CSS de componente ni ECharts):

| Grupo | Tokens | Uso |
|---|---|---|
| Superficies | `--bg` `#0b1218` · `--panel` `#111b22` · `--panel-2` · `--panel-3` | Fondo → panel → elevado → hover |
| Bordes | `--border` (divisor) · `--border-input` (control, 3,4:1) · `--border-strong` | Un campo siempre usa `--border-input` |
| Texto | `--text` (15:1) · `--muted` (8:1) · `--faint` (solo decorativo) | `--faint` nunca para texto que se lee |
| Acento | `--accent` `#4fd6e6` · `--accent-2` (hover) · `--accent-ink` (texto sobre acento) · `--accent-soft` (selección) | Acción principal, pestaña activa, foco |
| Semántica | `--amber` (tiempo, aviso) · `--danger` · `--info` · `--success` | Siempre con icono o texto, nunca solo color |
| Tipografía | `--font` Barlow · `--font-display` Barlow Semi Condensed · `--font-mono` · `--fs-xs` 11 … `--fs-xl` 20 | Monoespaciada solo para coordenadas, EPSG y fechas |
| Forma | `--r-sm` 4 · `--r-md` 6 · `--r-lg` 10 · `--shadow-1` · `--shadow-2` | Tarjetas con `--r-lg` |

**Reglas:**

- **Contraste medido.** Para cambiar o agregar un color, mide el contraste primero: 4,5:1 para texto y 3:1 para bordes de controles. El cálculo está en la skill **cronos-verificar-ui**.
- **Gráficos:** importa `chart as palette` desde `charts/theme.ts`. Sus papeles son `primary`, `secondary`, `highlight` y `reference`.
- **Colores de datos.** Los materiales de carga (`DeckEditor`), las bandas SDOB y la leyenda 3D se comparten con el motor. No se cambian solo en la UI, porque el plano y el panel deben coincidir.
- **Tipografía:**
  - Ningún texto baja de 11 px.
  - Las cifras van con `tabular-nums`.
  - Los títulos y las pestañas usan `--font-display`.
- **Iconos:** lucide-react, 16 px en controles y 14 px en línea. Nada de glifos Unicode en lugar de un icono.
- **Escalas:** espaciado en múltiplos de 4 px.

**Componentes que se reutilizan (no los dupliques):**

| Necesito | Uso |
|---|---|
| Diálogo modal | `components/Modal` (foco, Tab atrapado, Esc, devolución del foco) |
| Ventana flotante con teclado | `FloatingWindow` (ya usa `useDialogFocus`, sin modal) |
| Formulario de panel que sobrevive a cerrar | `usePanelState(clave, inicial)` (`stores/panelState.ts`); la clave lleva `project.id` si apunta a la librería |
| Número | `NumberField`, `NumberCell` o `NumberInput` (ver cronos-entrada-numerica) |
| Marca | `BrandMark` |
| Controles del plano | `MapControls` y `CrsChip` (no repitas zoom ni herramientas de navegación en otro sitio) |
| Página del modo servidor | `PageShell` con `crumbs`; `.card`, `.card-head`, `.seg-tabs` con `.count`, `.data-table` |

## Accesibilidad: mínimo por pantalla (WCAG 2.2 AA)

- **Nombre accesible en cada control.**
  - Una celda de tabla se nombra así: «Burden, taladro 12», con la prop `label` de `NumberCell`.
  - Pendiente: varias `NumberCell` de `LibraryPanel` todavía no lo pasan.
- **Diálogos y ventanas:** foco inicial dentro, foco atrapado, Esc cierra y el foco vuelve al botón que los abrió.
  - Usa `Modal` o `useDialogFocus`. Ya lo cumplen los 10 diálogos y todas las ventanas flotantes.
  - Esc en un campo con borrador primero revierte el campo; el segundo Esc cierra.
- **Pestañas** (`role=tablist`): se recorren con las flechas y llevan `aria-controls`. La cinta lo cumple; la barra lateral derecha no.
- **Visor (canvas):** lleva `aria-label`, `tabindex` y un anillo de foco visible. Todo lo que se hace en el plano tiene una alternativa por tabla o teclado.
- **Contraste:** 4,5:1 para texto y 3:1 para bordes de controles y foco.
- **Objetivos táctiles:** 24 px como mínimo. Hoy los checkbox miden 13 px.
- **Mensajes de estado** con `aria-live="polite"`.
- **Movimiento:** todas las animaciones respetan `prefers-reduced-motion`.
- **Zoom:** la interfaz se puede usar al 200 %.

## Velocidad

- **Atajos:** se agregan en `hooks/useShortcuts.ts`, en `dialogs/ShortcutsDialog.tsx` y en i18n.
  - Teclas ocupadas: `V L A B C T I M R H 3 F + − ? Supr Esc`, más Ctrl+Z, Ctrl+Y, Ctrl+A y Ctrl+S.
  - Cada atajo nuevo aparece en el tooltip de su botón.
- **Valores por defecto:** los de `01 §17`. Además se recuerda el último valor usado en cada proyecto.
- **Edición por lotes:** se aplica a la selección, a un grupo o a todo. Si la selección tiene valores mixtos, se muestra «múltiple».
- **Rendimiento:** 60 fps al desplazar y hacer zoom con 5.000 taladros. Los paneles calculan en un worker, con *debounce* y descartando los cálculos viejos (*latest-wins*).

## Cómo hacer un cambio de UI

1. Ubica el paso del flujo (1–12) y el rol del usuario. Cuenta los clics actuales.
2. **Reutiliza componentes:**
   - `NumberField` y `CellInput` para números;
   - `MenuButton`, `IconButton` y `Floatable`;
   - un único `Select` compartido. Hoy hay dos duplicados, en `ChargePanel.tsx:24` y `TimingPanel.tsx:14`: unifícalos al tocarlos.
3. Usa tokens, `t()`, `useFormat()` y `useUnits()`. No metas estilos en línea salvo valores dinámicos.
4. Verifica con **cronos-verificar-ui** (capturas, axe y teclado) y además con `pnpm typecheck`, `pnpm lint` y `pnpm test`.
5. Informa: clics antes y después, capturas, y las violaciones de axe antes y después.

## Errores comunes (hallados en la auditoría)

| Error | Corrección |
|---|---|
| Ventana centrada sobre el plano | Acoplar o colocar fuera del área de taladros |
| `<input type="number">` suelto | `NumberField` (ver cronos-entrada-numerica) |
| Aviso solo en la barra de estado | Lista «Revisión del diseño» con `aria-live` |
| `window.confirm` en una acción que se puede deshacer | Quitarlo; para lo irreversible, un diálogo propio |
| Hex en TSX o en ECharts | Token de `:root` |
| Texto literal en JSX | Clave i18n en español y en inglés |
| Unidad fija («m») o `toFixed` para mostrar | `useUnits()` + `useFormat()` |
| Formulario en `useState` que se pierde al cerrar | Store por proyecto |

## Realidad virtual (D-19)

- **Sesión:** solo lectura, salvo la voz del asistente; todo cambio se puede deshacer.
- **Menú:** se abre con la mirada a la muñeca, dentro de 35° de la mirada, y se cierra pasados 55°.
- **Comodidad:** zona muerta de 0,15, giros de 30° y la cabeza siempre a 1 m o más sobre el terreno (S-30 a S-34).
- **Rendimiento:** 72 fps en Quest 2.
