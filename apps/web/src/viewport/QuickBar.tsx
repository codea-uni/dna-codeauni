import {
  Box,
  CircleHelp,
  Layers,
  Map as MapIcon,
  Maximize2,
  Pause,
  Play,
  Search,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import {
  QUICK_LAYERS,
  frameSelectionOrAll,
  pauseSimulation,
  quickLayerOn,
  setQuickLayer,
  simulateBlast,
  stopSimulation,
} from './quickActions';

/**
 * Barra de acciones rápidas sobre el visor (como la de la vista de escena de Unity): planta/3D,
 * simular, capas, encuadrar, ayuda de navegación y el buscador de acciones.
 */
export function QuickBar() {
  const t = useT();
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const playing = useAnalysisStore((s) => s.sequencePlaying);
  const seqTime = useAnalysisStore((s) => s.sequenceTime);
  const [open, setOpen] = useState<'layers' | 'help' | null>(null);

  return (
    <div className="quick-bar" role="toolbar" aria-label={t('quick.bar')}>
      <div className="quick-seg" role="group">
        <button
          type="button"
          className={viewMode === 'plan' ? 'on' : ''}
          aria-pressed={viewMode === 'plan'}
          title={t('quick.planHint')}
          onClick={() => {
            setViewMode('plan');
          }}
        >
          <MapIcon size={15} aria-hidden /> <span className="quick-label">{t('quick.plan')}</span>
        </button>
        <button
          type="button"
          className={viewMode === '3d' ? 'on' : ''}
          aria-pressed={viewMode === '3d'}
          title={t('quick.3dHint')}
          onClick={() => {
            setViewMode('3d');
          }}
        >
          <Box size={15} aria-hidden /> <span className="quick-label">{t('quick.3d')}</span>
        </button>
      </div>

      <div className="quick-seg" role="group">
        {playing ? (
          <button
            type="button"
            className="quick-play on"
            title={t('quick.pause')}
            onClick={pauseSimulation}
          >
            <Pause size={15} aria-hidden /> <span className="quick-label">{t('quick.pause')}</span>
          </button>
        ) : (
          <button
            type="button"
            className="quick-play"
            title={t('quick.simulateHint')}
            onClick={simulateBlast}
          >
            <Play size={15} aria-hidden />{' '}
            <span className="quick-label">{t('quick.simulate')}</span>
          </button>
        )}
        {seqTime !== null && (
          <button
            type="button"
            title={t('quick.stop')}
            aria-label={t('quick.stop')}
            onClick={stopSimulation}
          >
            <Square size={13} aria-hidden />
          </button>
        )}
      </div>

      <Popover
        open={open === 'layers'}
        onToggle={(v) => {
          setOpen(v ? 'layers' : null);
        }}
        label={t('quick.layers')}
        title={t('quick.layersHint')}
        icon={<Layers size={15} aria-hidden />}
      >
        <LayerList />
      </Popover>

      <button type="button" title={t('quick.fitHint')} onClick={frameSelectionOrAll}>
        <Maximize2 size={15} aria-hidden /> <span className="quick-label">{t('quick.fit')}</span>
      </button>

      <button
        type="button"
        className="quick-search"
        title={t('quick.searchHint')}
        onClick={() => {
          setPaletteOpen(true);
        }}
      >
        <Search size={15} aria-hidden /> <span className="quick-label">{t('quick.search')}</span>{' '}
        <kbd>Ctrl K</kbd>
      </button>

      {viewMode === '3d' && (
        <Popover
          open={open === 'help'}
          onToggle={(v) => {
            setOpen(v ? 'help' : null);
          }}
          title={t('quick.help')}
          icon={<CircleHelp size={15} aria-hidden />}
        >
          <ul className="quick-help">
            {(
              [
                'quick.help.orbit',
                'quick.help.look',
                'quick.help.fly',
                'quick.help.pan',
                'quick.help.zoom',
                'quick.help.select',
                'quick.help.focus',
              ] as const
            ).map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </Popover>
      )}
    </div>
  );
}

/** Botón que abre un panel flotante; se cierra con un clic afuera o Esc. */
function Popover({
  open,
  onToggle,
  label,
  title,
  icon,
  children,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
  label?: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onToggle(false);
    };
    // Esc cierra el panel y no llega a los atajos (no suelta la selección).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onToggle(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [open, onToggle]);
  return (
    <div className="quick-pop" ref={ref}>
      <button
        type="button"
        className={open ? 'on' : ''}
        aria-expanded={open}
        title={title}
        aria-label={label ? undefined : title}
        onClick={() => {
          onToggle(!open);
        }}
      >
        {icon}
        {label && <span className="quick-label">{label}</span>}
      </button>
      {open && <div className="quick-pop-panel">{children}</div>}
    </div>
  );
}

function LayerList() {
  const t = useT();
  const s = useAnalysisStore();
  return (
    <>
      {(['design', 'site'] as const).map((group) => (
        <fieldset key={group} className="quick-layers">
          <legend>{t(group === 'design' ? 'quick.groupDesign' : 'quick.groupSite')}</legend>
          {QUICK_LAYERS.filter((q) => q.group === group).map((q) => (
            <label key={q.id} className="check">
              <input
                type="checkbox"
                checked={quickLayerOn(q, s)}
                onChange={(e) => {
                  setQuickLayer(q, e.target.checked);
                }}
              />
              {t(q.label)}
            </label>
          ))}
        </fieldset>
      ))}
    </>
  );
}
