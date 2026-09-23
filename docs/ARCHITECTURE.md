# Arquitectura de BlastLab

## Flujo de datos

```mermaid
flowchart LR
  subgraph Main["Hilo principal"]
    direction TB
    UI["apps/web<br/>React + Zustand<br/>(paneles, tablas, gráficos)"]
    DOC["core: DocumentStore<br/>(modelo + comandos + undo/redo)"]
    SEL["core: SelectionStore"]
    ENG["packages/engine<br/>Three.js: capas instanciadas,<br/>cámaras, picking, herramientas"]
  end
  subgraph Workers["Web Workers"]
    POOL["packages/workers<br/>pool + Comlink"]
    CALC["core: cálculos<br/>(carguío, tiempos, energía,<br/>fragmentación, vibración, IO)"]
  end
  STORE[("IndexedDB / OPFS<br/>JSON versionado")]

  UI -- "dispatch(comando)" --> DOC
  UI -- "setTool / setView / capas" --> ENG
  ENG -- "comandos de edición<br/>(mover, agregar, borrar)" --> DOC
  ENG -- "pick / selección" --> SEL
  DOC -- "ChangeSet (incremental)" --> ENG
  DOC -- "docVersion" --> UI
  SEL --> ENG
  SEL --> UI
  UI -- "job(packed typed arrays, docVersion)" --> POOL
  POOL --> CALC
  CALC -- "resultados (transferibles)" --> POOL
  POOL -- "latest-wins" --> UI
  UI -- "capas de resultados<br/>(contornos, tiempos)" --> ENG
  DOC <-- "serializar / migrar (en worker)" --> STORE
```

## Paquetes

### `packages/core`

El corazón del sistema. Contiene:

- el modelo de dominio y sus tipos, con unidades SI y esquema versionado
- el `DocumentStore`, basado en comandos, ChangeSets, transacciones y undo/redo
- la geometría, los generadores de patrón y todos los cálculos de ingeniería
- el IO (JSON con migraciones, CSV, DXF)
- el empaquetado en typed arrays para el engine y los workers

No tiene dependencias del DOM ni de UI, así que corre en Node (tests), en workers y en el hilo principal. Todo cálculo es una función pura: `(modelo empaquetado, parámetros) → resultado`.

### `packages/engine`

Renderiza el diseño con Three.js sobre WebGL. Tiene una sola escena y dos cámaras: ortográfica para la planta y perspectiva para el 3D. Las entidades masivas usan InstancedMesh: símbolos y cilindros de taladros, y decks como segmentos instanciados con `instanceColor`.

Detalles de funcionamiento:

- **Loop:** usa un rAF propio con render a demanda.
- **Precisión:** trabaja en coordenadas relativas al origen local.
- **Picking y selección:** se resuelven con un índice espacial 2D (flatbush).
- **Herramientas de edición:** convierten eventos de puntero en comandos de core, con snapping y agrupadas en transacciones para undo.
- **Suscripción:** se suscribe al DocumentStore y actualiza solo las instancias afectadas.

Expone una API imperativa (`createEngine(canvas, deps)`, `setView`, `setTool`, `setLayer`, `focus`, `dispose`) y eventos (`hover`, `pointerWorld`, `fps`).

### `packages/workers`

Expone los cálculos de core en Web Workers mediante Comlink. Detalles:

- **Pool:** dimensionado según `hardwareConcurrency`.
- **Cancelación:** los jobs se etiquetan con `docVersion` y se descarta lo obsoleto (_latest-wins_).
- **Transferencia:** los datos entran y salen como typed arrays transferibles, sin copias de grafos de objetos.
- **Tareas largas:** serialización, autosave y generación de PDF también corren aquí.

### `apps/web`

Aplicación React + Vite:

- `<Viewport>` monta el canvas y crea el engine una sola vez; React nunca vuelve a renderizar el diseño.
- Zustand guarda el estado de UI, `docVersion` y la selección visible.
- Los paneles leen del DocumentStore con selectores memoizados.
- Los gráficos usan ECharts con carga diferida.
- La persistencia usa IndexedDB para el índice y el JSON de proyectos, y OPFS para los binarios grandes.

## Decisiones clave

| Decisión                                                  | Motivo                                                                                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulación 100 % en cliente                               | Latencia cero y funcionamiento offline; el backend futuro se limita a auth, persistencia y lotes                                                            |
| Document store en core, no en Zustand                     | Evita que React se re-renderice en ediciones masivas; undo/redo testeable en Node                                                                           |
| ChangeSets incrementales                                  | Actualizar 1 taladro no reconstruye 20.000 instancias                                                                                                       |
| Origen local en render                                    | float32 en la GPU no tiene precisión con coordenadas UTM                                                                                                    |
| Picking con flatbush                                      | O(log n) frente a un raycast lineal sobre instancias                                                                                                        |
| TS primero, WASM después                                  | Solo se migra un kernel cuando una medición lo justifique                                                                                                   |
| Arrastre con preview en el engine                         | Mientras se arrastra, solo se desplazan instancias en la GPU; el documento recibe un único comando al soltar (un paso de undo, sin re-render de React)      |
| Operaciones con inversa exacta                            | `DocumentStore` guarda ops primitivas (`holes/insert`, `holes/remove`, `holes/replace`, `patterns/*`, `blast/patch`) y sus inversas, no copias del proyecto |
| Índice espacial en el hilo principal                      | El picking es interactivo y síncrono; reconstruir flatbush con 20.000 puntos cuesta ~1–2 ms y solo ocurre tras cambios                                      |
| Generación de mallas, parseo y serialización en el worker | Son O(n) sobre taladros; el hilo principal solo aplica el resultado                                                                                         |
| Símbolos y etiquetas en espacio de pantalla               | Quads instanciados con tamaño constante en píxeles; las etiquetas usan un atlas de glifos y se ocultan por LOD según la separación entre taladros           |
| Recentrado automático del origen de render                | Si la geometría queda a más de 5 km del origen, el engine recentra y reconstruye (precisión float32 con coordenadas UTM)                                    |
| DXF R12 propio para escribir                              | Conserva Z en todas las entidades (bocas, trazas, textos, perímetros, 3DFACE); dxf-parser para leer                                                         |
| Informe PDF vectorial en el worker                        | pdf-lib no depende del DOM: plano, curvas y tablas se dibujan como vectores sin bloquear la UI                                                              |
| 3D sobre la misma escena                                  | Las capas de planta van en un grupo que se oculta; la escena 3D reutiliza documento, origen de render y loop a demanda                                      |
