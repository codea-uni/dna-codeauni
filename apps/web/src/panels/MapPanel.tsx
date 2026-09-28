import { useT } from '../i18n';
import { useUiStore } from '../stores/uiStore';

const ITEMS = [
  ['grid', 'map.grid'],
  ['rulers', 'map.rulers'],
  ['scaleBar', 'map.scaleBar'],
  ['compass', 'map.compass'],
] as const;

/** Ajustes generales del mapa. */
export function MapPanel() {
  const t = useT();
  const decorations = useUiStore((s) => s.decorations);
  const setDecorations = useUiStore((s) => s.setDecorations);
  const radiusScale = useUiStore((s) => s.radiusScale);
  const setRadiusScale = useUiStore((s) => s.setRadiusScale);
  return (
    <section className="panel">
      <h2>{t('map.title')}</h2>
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
            {t(label)}
          </label>
        ))}
      </div>
      <label className="field">
        <span className="field-label">{t('map.holeRadius3d')}</span>
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
        <kbd>R</kbd> {t('map.measureHint')}
      </p>
    </section>
  );
}
