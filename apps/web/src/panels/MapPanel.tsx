import { useUiStore } from '../stores/uiStore';

const ITEMS = [
  ['grid', 'Grilla'],
  ['rulers', 'Reglas (coordenadas)'],
  ['scaleBar', 'Barra de escala'],
  ['compass', 'Brújula'],
] as const;

/** Ajustes generales del mapa. */
export function MapPanel() {
  const decorations = useUiStore((s) => s.decorations);
  const setDecorations = useUiStore((s) => s.setDecorations);
  const radiusScale = useUiStore((s) => s.radiusScale);
  const setRadiusScale = useUiStore((s) => s.setRadiusScale);
  return (
    <section className="panel">
      <h2>Mapa</h2>
      <div className="checks">
        {ITEMS.map(([key, label]) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={decorations[key]}
              onChange={(e) => {
                setDecorations({ [key]: e.target.checked });
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <label className="field">
        <span className="field-label">Radio de taladros en 3D</span>
        <span className="field-input">
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={radiusScale}
            onChange={(e) => {
              setRadiusScale(Number(e.target.value));
            }}
          />
          <span className="field-unit">×{radiusScale}</span>
        </span>
      </label>
      <p className="hint">
        <kbd>R</kbd> mide distancia y azimut entre dos puntos (se ajusta a taladros y malla).
      </p>
    </section>
  );
}
