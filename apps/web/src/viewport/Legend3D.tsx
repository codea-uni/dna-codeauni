import { explosiveColorHex, hexCss, MATERIAL_COLORS } from '@blastlab/engine';
import { useProject } from '../hooks/useDocument';
import { useUiStore } from '../stores/uiStore';

const OTHER: [keyof typeof MATERIAL_COLORS, string][] = [
  ['stemming', 'Taco'],
  ['air', 'Aire'],
  ['water', 'Agua'],
  ['plug', 'Tapón'],
  ['empty', 'Sin cargar'],
];

/** Leyenda de materiales y control de exageración del radio en la vista 3D. */
export function Legend3D() {
  const mode = useUiStore((s) => s.viewMode);
  const radiusScale = useUiStore((s) => s.radiusScale);
  const setRadiusScale = useUiStore((s) => s.setRadiusScale);
  const explosives = useProject().library.explosives;
  if (mode !== '3d') return null;
  return (
    <div className="overlay-3d">
      <ul>
        {explosives.map((e, i) => (
          <li key={e.id}>
            <i style={{ background: hexCss(explosiveColorHex(i)) }} />
            {e.name}
          </li>
        ))}
        {OTHER.map(([k, label]) => (
          <li key={k}>
            <i style={{ background: hexCss(MATERIAL_COLORS[k]) }} />
            {label}
          </li>
        ))}
      </ul>
      <label title="Exageración del radio de los taladros">
        Radio ×{radiusScale}
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
      </label>
      <p>
        <kbd>arrastre</kbd> orbitar · <kbd>Shift</kbd> desplazar · <kbd>rueda</kbd> acercar ·{' '}
        <kbd>3</kbd> planta
      </p>
    </div>
  );
}
