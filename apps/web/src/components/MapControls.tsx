import type { ToolName } from '@cronos/engine';
import {
  Box,
  Hand,
  Lasso,
  Map as MapIcon,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as actions from '../actions';
import { useProject } from '../hooks/useDocument';
import { useT, type MessageKey } from '../i18n';
import { useUiStore } from '../stores/uiStore';

const ZOOM_STEP = 1.25;

const NAV_TOOLS: { name: ToolName; label: MessageKey; key: string; icon: LucideIcon }[] = [
  { name: 'select', label: 'tools.select', key: 'V', icon: MousePointer2 },
  { name: 'lasso', label: 'tools.lasso', key: 'L', icon: Lasso },
  { name: 'pan', label: 'tools.pan', key: 'H', icon: Hand },
];

/**
 * Controles flotantes del plano: selección y desplazamiento, zoom, encuadre y planta/3D. Están
 * siempre a mano, sin importar la pestaña de la cinta (cronos-ux-interfaz, regla 3), y cada uno
 * muestra su tecla. React solo emite comandos al motor: no dibuja nada del diseño.
 */
export function MapControls() {
  const t = useT();
  const tool = useUiStore((s) => s.tool);
  const viewMode = useUiStore((s) => s.viewMode);
  const { setTool, setViewMode } = useUiStore.getState();
  const tip = (label: string, key: string) => `${label} (${key})`;

  return (
    <div
      className="map-controls"
      role="toolbar"
      aria-label={t('map.controls')}
      aria-orientation="vertical"
    >
      {NAV_TOOLS.map(({ name, label, key, icon: Icon }) => (
        <button
          key={name}
          className="map-btn"
          aria-pressed={viewMode === 'plan' && tool === name}
          aria-label={t(label)}
          title={tip(t(label), key)}
          onClick={() => {
            // Las herramientas editan en planta (igual que sus atajos).
            setViewMode('plan');
            setTool(name);
          }}
        >
          <Icon size={16} aria-hidden />
        </button>
      ))}
      <span className="map-sep" aria-hidden />
      <button
        className="map-btn"
        aria-label={t('map.zoomIn')}
        title={tip(t('map.zoomIn'), '+')}
        onClick={() => {
          actions.zoomBy(1 / ZOOM_STEP);
        }}
      >
        <Plus size={16} aria-hidden />
      </button>
      <button
        className="map-btn"
        aria-label={t('map.zoomOut')}
        title={tip(t('map.zoomOut'), '−')}
        onClick={() => {
          actions.zoomBy(ZOOM_STEP);
        }}
      >
        <Minus size={16} aria-hidden />
      </button>
      <button
        className="map-btn"
        aria-label={t('tools.zoomFit')}
        title={tip(t('tools.zoomFit'), 'F')}
        onClick={() => {
          actions.zoomToFit();
        }}
      >
        <Maximize size={16} aria-hidden />
      </button>
      <span className="map-sep" aria-hidden />
      <button
        className="map-btn"
        aria-label={t(viewMode === '3d' ? 'map.toPlan' : 'map.to3d')}
        title={tip(t(viewMode === '3d' ? 'map.toPlan' : 'map.to3d'), '3')}
        onClick={() => {
          setViewMode(viewMode === '3d' ? 'plan' : '3d');
        }}
      >
        {viewMode === '3d' ? <MapIcon size={16} aria-hidden /> : <Box size={16} aria-hidden />}
      </button>
    </div>
  );
}

/** Ficha del sistema de coordenadas del proyecto, abajo a la derecha del plano. */
export function CrsChip() {
  const t = useT();
  const crs = useProject().coordinateSystem;
  // Sin CRS no se puede importar (H-101): la ficha lo avisa en ámbar.
  if (!crs.epsg)
    return (
      <div className="crs-chip missing" title={t('map.crs')}>
        {t('map.noCrs')}
      </div>
    );
  return (
    <div className="crs-chip" title={t('map.crs')}>
      <span className="mono">EPSG:{String(crs.epsg)}</span>
      {crs.name && ` · ${crs.name}`}
    </div>
  );
}
