import {
  designByMethod,
  MINING_METHODS,
  type MethodDesign,
  type MiningMethod,
  type MiningMethodGroup,
  type MiningMethodId,
} from '@cronos/core';
import { useFormat, useT } from '../../i18n';
import { MethodView2D } from './MethodDrawing';

/**
 * Catálogo de plantillas por método de minado en tarjetas agrupadas (desarrollo, chimeneas y
 * tajeo). La miniatura es el propio diseño por defecto de la plantilla (su primera vista), así que
 * muestra el patrón real: frente con cuele, abanico, filas paralelas, cráteres…
 */

const GROUPS: readonly MiningMethodGroup[] = ['development', 'raise', 'stope'];

const thumbs = new Map<MiningMethodId, MethodDesign | null>();

function thumbDesign(id: MiningMethodId): MethodDesign | null {
  if (!thumbs.has(id)) {
    try {
      thumbs.set(id, designByMethod(id));
    } catch {
      thumbs.set(id, null);
    }
  }
  return thumbs.get(id) ?? null;
}

function Card({ m, onPick }: { m: MiningMethod; onPick: (id: MiningMethodId) => void }) {
  const t = useT();
  const fmt = useFormat();
  const design = thumbDesign(m.id);
  const view = design?.views[0];
  const unit = m.powderFactor.unit === 'kg/t' ? 'kg/t' : 'kg/m³';
  return (
    <button
      type="button"
      className="ugm-card"
      onClick={() => {
        onPick(m.id);
      }}
    >
      <div className="ugm-thumb" aria-hidden="true">
        {design && view && <MethodView2D design={design} view={view} thumb />}
      </div>
      <div className="ugm-card-body">
        <span className="ugm-code">{m.code}</span>
        <strong>{t(`ugm.m.${m.id}.name`)}</strong>
        <span className="ugm-use">{t(`ugm.m.${m.id}.use`)}</span>
        <span className="ugm-pf">
          {t('ugm.pfShort')} {fmt(m.powderFactor.min, 2)}–{fmt(m.powderFactor.max, 2)} {unit}
        </span>
      </div>
    </button>
  );
}

export function MethodPicker({ onPick }: { onPick: (id: MiningMethodId) => void }) {
  const t = useT();
  return (
    <div className="ugm-picker">
      <p className="hint">{t('ugm.intro')}</p>
      {GROUPS.map((g) => (
        <section key={g} className="ugm-group">
          <h3>{t(`ugm.group.${g}`)}</h3>
          <div className="ugm-cards">
            {MINING_METHODS.filter((m) => m.group === g).map((m) => (
              <Card key={m.id} m={m} onPick={onPick} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
