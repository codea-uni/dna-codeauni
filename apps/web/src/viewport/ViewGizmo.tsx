import { useT, type MessageKey } from '../i18n';
import { getEngine } from '../session';
import { useUiStore } from '../stores/uiStore';

/** Ángulos de cada vista: desde dónde se mira (rumbo, 0 = Norte) y elevación [°]. */
const VIEWS: { id: string; label: MessageKey; text: string; yaw: number | null; pitch: number }[] =
  [
    { id: 'n', label: 'quick.view.north', text: 'N', yaw: 0, pitch: 20 },
    { id: 'w', label: 'quick.view.west', text: 'O', yaw: 270, pitch: 20 },
    { id: 'top', label: 'quick.view.top', text: '⊤', yaw: null, pitch: 89 },
    { id: 'e', label: 'quick.view.east', text: 'E', yaw: 90, pitch: 20 },
    { id: 's', label: 'quick.view.south', text: 'S', yaw: 180, pitch: 20 },
    { id: 'iso', label: 'quick.view.iso', text: '3D', yaw: 150, pitch: 35 },
  ];

/**
 * Cubo de vistas (como el gizmo de Unity), solo en 3D: un clic mira el mismo punto desde el Norte,
 * Sur, Este, Oeste, desde arriba o en perspectiva.
 */
export function ViewGizmo() {
  const t = useT();
  const viewMode = useUiStore((s) => s.viewMode);
  if (viewMode !== '3d') return null;
  return (
    <div className="view-gizmo" role="group" aria-label={t('quick.view.title')}>
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          data-view={v.id}
          title={t(v.label)}
          aria-label={t(v.label)}
          onClick={() => {
            const engine = getEngine();
            if (!engine) return;
            engine.viewFrom(v.yaw ?? engine.cameraYawDeg, v.pitch);
          }}
        >
          {v.id === 'w' ? t('quick.view.westShort') : v.text}
        </button>
      ))}
    </div>
  );
}
