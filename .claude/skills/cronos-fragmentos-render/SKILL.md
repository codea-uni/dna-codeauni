---
name: cronos-fragmentos-render
description: Úsala cuando dibujes o animes fragmentos de roca volada en el engine de Cronos (packages/engine, BlocksLayer, modo física con Rapier, VR/Quest) — biblioteca de rocas poliédricas, InstancedMesh/BatchedMesh, escala L:I:S y giro por instancia, vuelo calculado en el shader, trayectorias con rebote de la pila subterránea, finos como grava, LOD y presupuesto de instancias. Keywords - render fragmentos, rocas, InstancedMesh, BatchedMesh, shader, onBeforeCompile, BlocksLayer, vuelo, giro, grava, LOD, Quest, rendimiento.
---

# Cronos · Render de fragmentos

La física (tamaños, forma, velocidad) está en `cronos-fragmentos-fisica`. Esta skill cubre cómo
mostrarlos a 60 fps (72/90 en el Quest) sin cambiar los indicadores.

## Punto de partida en el repo

- `packages/engine/src/layers/BlocksLayer.ts`: una `InstancedMesh` de `BoxGeometry`, posición
  calculada en CPU cada cuadro (tiro parabólico o `path` UG de 14 puntos + asentamiento `SETTLE`),
  **sin rotación** en modo cinemático, `GAP = 0,94`, `aTilt` para la cara superior in situ.
- Modo física: cuadros de Rapier (`workers/src/physics/physicsApi.ts`) con posición y cuaternión.
- Respeta ese contrato: `set(data, origin)`, `update(t | null)` (null = pila final), `setColors`,
  `onMeshChange`, origen de render relativo (el engine recentra).

## Arquitectura

1. **Biblioteca de formas** (una vez, semilla fija, en el engine): 16 poliedros convexos (12–24) en la
   caja unitaria, por **cortes planos sucesivos** de un cubo: 3–6 cortes con normal aleatoria que
   quitan 5–25 % del volumen cada uno, objetivo 6–9 caras (Domokos 2020). Normales planas
   (`toNonIndexed()` + `computeVertexNormals()`), 8–30 triángulos. Normaliza cada forma a su caja
   L = I = S = 1 y guarda su k de llenado para que la escala dé volumen k_v·x³ exacto.
2. **Dibujo:** una `InstancedMesh` por forma (≤ 16 draw calls) — compatible con el patrón actual — o
   `BatchedMesh` si hace falta culling por instancia. Matriz T·R·S(L, I, S); color por instancia con
   el mismo `colors` (tamaño, dominio, taladro). `frustumCulled = false` o recalcula la esfera.
3. **Animación en GPU** (`onBeforeCompile`, igual que `tiltedTopMaterial`): atributos por instancia
   `aP0`, `aV0`, `aOmega` (eje·rad/s), `aT` (salida, impacto), `aDest`, `aQ0`. Uniform `uTime`.
   - τ = clamp(t − t0, 0, t_imp − t0); p = p0 + v0·τ − ½·g·τ²·ẑ; rotación de Rodrigues |ω|·τ.
   - tras el impacto: smoothstep hacia `aDest` en `SETTLE` y el giro se frena (rodar ≈ 1 vuelta).
   - normal: aplica la misma rotación a `objectNormal`.
   - `update(t)` solo escribe `uTime`: cero trabajo por instancia en CPU.
   - Antes de salir (t < t0) el fragmento está **dentro de su bloque padre**: dibuja el bloque in situ
     (como hoy) y oculta sus fragmentos; en t0 se reemplaza por ellos. No hace falta teselar el
     macizo: el solape de pocos ms no se ve.
4. **Subterráneo (rebotes):** el bloque padre trae `path` (pathPoints × [dx, dy, dz, t]). Súbelo como
   `DataTexture` RGBA32F (fila = bloque) y muestréala en el shader con el índice del padre; el
   fragmento suma su desfase rígido (posición relativa en el padre, que se abre con la dispersión de
   velocidad) y su giro. Fragmentos > p80 o proyecciones con trayectoria propia: otra fila.
5. **Finos:** el volumen bajo el corte va al heightmap de la pila (superficie con material de grava,
   escala de textura ligada al x50 del fino) y en vuelo a `Points`/sprites o instancias mínimas (≈ 15 %
   del presupuesto), más polvo en el arranque. La superficie de grava aparece con la pila (crece con
   el volumen depositado), no de golpe.
6. **LOD y presupuesto:** 50 000 instancias en escritorio, 15 000 en Quest/móvil (el corte de tamaño
   se ajusta al presupuesto en el core). Lejos: formas de menos caras o `Points`. Pila en reposo:
   solo fragmentos > 2·x_corte como instancias sobre la grava. Sombras solo en los grandes.
7. **Física nivel 2 (Rapier):** colisionadores `convexHull` de las mismas formas (8–16 vértices),
   solo para los > p80 o hasta ≈ 3 000 cuerpos; el resto cinemático. Restitución 0,25, fricción 0,6.
8. **Transferencia:** `Float32Array`/`Uint8Array` planos como transferables desde el worker.

## Errores típicos

- Escalar la caja con el tamaño de criba sin el factor de llenado → la pila dibujada tiene otro volumen.
- Rotación uniforme por ángulos de Euler aleatorios → sesgo; usa cuaterniones de Shoemake.
- Reconstruir `InstancedMesh` al cambiar el tiempo o el color: solo cambia uniforms/atributos.
- Olvidar el origen relativo del render (el engine recentra): todo en coordenadas relativas.
- Poner `needsUpdate` en todos los atributos cada cuadro: solo `uTime` cambia.
- Romper el modo `null` (pila final) o el modo física: ambos deben seguir funcionando.

## Verificación

- Tests de unidad del engine (como `Engine.camera.test.ts`): volumen de la biblioteca, matrices,
  posición en τ = 0, en el impacto y tras `SETTLE` comparadas con la fórmula en CPU.
- Visual con `cronos-verificar-ui`: capturas a 1440 y 390 px del proyecto subterráneo y del ejemplo
  «Pila de material» en 4 instantes (antes, salida del cuele, vuelo, pila final) **y míralas**.
- Medir fps con `renderer.info` y `performance.now()` en la animación; registrar instancias y
  triángulos. En Quest, probarlo el usuario (el VPS no tiene GPU).
