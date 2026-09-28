# D-10 Unidades internas y nombres de indicadores

**Estado:** aceptada (2026-09-28) · `02 §0`, `01 §17` #11

**Contexto.** `02 §0` pide SI interno, pero expresa los tiempos en ms, el PPV en mm/s y nombra los indicadores `loading_factor_kg_m3`, `powder_factor_kg_t` y `energy_factor_MJ_t`. El código usa SI estricto: s, m/s, kg/kg, J/kg.

**Decisión.**

- **SI estricto internamente:** m, kg, s, rad, Pa, J/kg, kg/m³, m/s.
- Los casos de referencia en ms o mm/s se convierten explícitamente en el test (por ejemplo, K = 1140 mm/s → 1,14 m/s).
- La conversión a unidades de visualización ocurre solo en presentación.
- Nombres en código, en camelCase y sin sufijo de unidad (la unidad va en el tipo alias y en el JSDoc):
  - `loadingFactor` [kg/m³];
  - `powderFactor` [kg/kg, se muestra en kg/t];
  - `energyFactor` [J/kg, se muestra en MJ/t].
- Los nombres de `02 §0` se usan en exportaciones (CSV, reporte) y en la UI.
- Tiempos «exactos al milisegundo» (CR-05): tolerancia de 1e-9 s en los tests.

**Consecuencias.** En G4, `powderFactorVolume` pasa a `loadingFactor` y `powderFactorMass` a `powderFactor` (`packages/core/src/charging/chargeAnalysis.ts`).
