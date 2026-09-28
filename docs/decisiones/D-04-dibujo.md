# D-04 Cómo se dibuja

**Estado:** aceptada (2026-09-28) · Guía `01 §7.3`, spike S1

**Decisión.**

- WebGL con Three.js, una escena con cámara ortográfica (planta) y perspectiva (3D).
- Taladros como InstancedMesh.
- Render a demanda, con loop rAF propio.
- Coordenadas relativas a `CoordinateSystem.origin` para la precisión de float32.
- Canvas2D queda prohibido para la vista principal.

**Consecuencias.**

- S1 exige ≥ 30 fps con 5.000 taladros; la meta del proyecto es más alta, 60 fps en pan y zoom.
- Se verifica con `packages/engine/src/scene3d/Scene3D.perf.test.ts` y con el fixture de 5.000 taladros en cada cambio de engine o workers.
