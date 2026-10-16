import { Engine, type XrMode } from '@cronos/engine';
import { RectangleGoggles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../components/IconButton';
import { liveVoice } from '../ai/live';
import { useT } from '../i18n';
import { serverMode } from '../server/api';
import { getEngine } from '../session';
import { useUiStore } from '../stores/uiStore';

// ponytail: escala del framebuffer por modelo de visor; medir en el Quest 2 y ajustar (D-19).
const framebufferScale = () => (navigator.userAgent.includes('Quest 2') ? 0.8 : 1);

/**
 * Un solo botón «Entrar en VR» en la pestaña Vista; los escenarios (maqueta sobre la mesa, dentro
 * de la voladura, maqueta aislada) se eligen dentro del visor. La sesión es VR inmersiva (mundo
 * virtual, sin ver la habitación); AR solo en un visor sin VR. La sala del proyecto la mantiene
 * `bindRoom` (también desde la web).
 */
/** Si el navegador admite VR/AR, si hay una sesión abierta y cómo entrar (con el gesto del clic). */
function useXrEntry() {
  const t = useT();
  const [mode, setMode] = useState<XrMode | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([Engine.isXrSupported('ar'), Engine.isXrSupported('vr')]).then(([ar, vr]) => {
      // Por defecto VR inmersivo (mundo virtual, sin ver la habitación); AR solo si no hay VR.
      if (alive) setMode(vr ? 'vr' : ar ? 'ar' : null);
    });
    const off = getEngine()?.on('xrSession', (m) => {
      setActive(m !== null);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const enter = () => {
    const engine = getEngine();
    if (!engine || !mode) return;
    // Sin await antes de enterXr: el navegador exige el gesto del usuario para abrir la sesión.
    // El audio de la voz en vivo también: se prepara aquí (dentro del visor el pellizco no cuenta).
    if (serverMode) liveVoice.prepare().catch(() => undefined);
    engine.enterXr(mode, { framebufferScale: framebufferScale() }).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      useUiStore.getState().notify(t('xr.error', { message }), 'error');
    });
  };

  return { mode, active, enter };
}

export function XrButtons() {
  const t = useT();
  const { mode, active, enter } = useXrEntry();
  if (!mode) return null;

  return (
    <div
      className="toolbar-group"
      data-group={t('xr.group')}
      role="group"
      aria-label={t('xr.group')}
    >
      <IconButton
        showLabel
        icon={RectangleGoggles}
        label={t('xr.enterVr')}
        hint={t('xr.hint')}
        active={active}
        onClick={enter}
      />
    </div>
  );
}

/**
 * Botón flotante «Entrar en VR» sobre el mapa, siempre a la vista en un visor (Quest): no hace
 * falta buscarlo en la pestaña Vista. En un navegador sin WebXR no aparece.
 */
export function XrFab() {
  const t = useT();
  const { mode, active, enter } = useXrEntry();
  if (!mode || active) return null;
  return (
    <>
      <a
        className="xr-manual"
        href={`${import.meta.env.BASE_URL}manual-vr.html`}
        target="_blank"
        rel="noreferrer"
      >
        {t('xr.manual')}
      </a>
      <button type="button" className="xr-fab" onClick={enter} title={t('xr.hint')}>
        <RectangleGoggles size={22} aria-hidden />
        <span>{t('xr.enterVr')}</span>
      </button>
    </>
  );
}
