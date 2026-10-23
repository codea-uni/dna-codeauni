import { Crosshair, SlidersHorizontal, X } from 'lucide-react';
import { useProject, useSelectionIds } from '../hooks/useDocument';
import { useFormat, useT } from '../i18n';
import { getEngine, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { frameSelectionOrAll } from './quickActions';

/**
 * Ficha del objeto elegido con un clic en la vista 3D (como el Inspector de Unity, en chico): qué
 * es, sus datos clave y acciones (centrar, ver propiedades).
 */
export function PickCard() {
  const t = useT();
  const fmt = useFormat();
  const picked = useUiStore((s) => s.picked3d);
  const viewMode = useUiStore((s) => s.viewMode);
  const setPicked = useUiStore((s) => s.setPicked3d);
  const setRightTab = useUiStore((s) => s.setRightTab);
  const selection = useSelectionIds();
  const project = useProject();
  if (!picked || viewMode !== '3d') return null;
  // Los taladros siguen a la selección (se pueden soltar con Esc o desde la planta).
  if (picked.kind === 'holes' && selection.size === 0) return null;

  let title: string;
  let detail: string | null = null;
  let props = false;
  if (picked.kind === 'holes') {
    const holes = project.blasts.flatMap((b) => b.holes).filter((h) => selection.has(h.id));
    const one = holes.length === 1 ? holes[0] : undefined;
    title = one
      ? t('quick.card.holesOne', { label: one.label })
      : t('quick.card.holes', { n: selection.size });
    if (one)
      detail = t('quick.card.holeData', {
        length: fmt(one.length, 1),
        diameter: fmt(one.diameter * 1000, 0),
        incl: fmt((one.inclination * 180) / Math.PI, 0),
      });
    props = true;
  } else if (picked.kind === 'boundary') {
    title = `${t('quick.card.boundary')} · ${picked.name}`;
  } else if (picked.kind === 'working') {
    title = picked.name ? `${t('quick.card.working')} · ${picked.name}` : t('quick.card.working');
  } else if (picked.kind === 'monitor') {
    title = `${t('quick.card.monitor')} · ${picked.name}`;
  } else {
    title = t(picked.target === 'model' ? 'quick.card.model' : 'quick.card.terrain');
  }
  const p = picked.point;

  return (
    <div className="pick-card" role="status">
      <div className="pick-card-head">
        <strong>{title}</strong>
        <button
          type="button"
          className="pick-card-close"
          title={t('quick.card.close')}
          aria-label={t('quick.card.close')}
          onClick={() => {
            if (picked.kind === 'holes') session.selection.clear();
            setPicked(null);
          }}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      {detail && <p>{detail}</p>}
      <p className="muted">
        {t('quick.card.coords', { x: fmt(p.x, 1), y: fmt(p.y, 1), z: fmt(p.z, 1) })}
      </p>
      <div className="pick-card-actions">
        <button
          type="button"
          onClick={() => {
            if (picked.kind === 'holes') frameSelectionOrAll();
            else getEngine()?.focus3d(p, 40);
          }}
        >
          <Crosshair size={14} aria-hidden /> {t('quick.card.focus')}
        </button>
        {props && (
          <button
            type="button"
            onClick={() => {
              setRightTab('selection');
            }}
          >
            <SlidersHorizontal size={14} aria-hidden /> {t('quick.card.properties')}
          </button>
        )}
      </div>
    </div>
  );
}
