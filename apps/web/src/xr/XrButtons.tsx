import { Engine, type XrMode } from '@cronos/engine';
import { RectangleGoggles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../components/IconButton';
import { useT } from '../i18n';
import { serverMode } from '../server/api';
import { useProjectSession } from '../server/projectSession';
import { getEngine } from '../session';
import { useUiStore } from '../stores/uiStore';
import { joinRoom } from './room';

// ponytail: escala del framebuffer por modelo de visor; medir en el Quest 2 y ajustar (D-19).
const framebufferScale = () => (navigator.userAgent.includes('Quest 2') ? 0.8 : 1);

/**
 * Un solo botón «Entrar en VR» en la pestaña Vista; los escenarios (maqueta sobre la mesa, dentro
 * de la voladura, maqueta aislada) se eligen dentro del visor. La sesión es AR si el visor la
 * admite (passthrough para ver la mesa real); si no, VR. Con un proyecto del servidor abierto se
 * entra a su sala: quien esté en el mismo proyecto se ve como avatar.
 */
export function XrButtons() {
  const t = useT();
  const [mode, setMode] = useState<XrMode | null>(null);
  const [active, setActive] = useState(false);
  const project = useProjectSession((s) => s.current);

  useEffect(() => {
    let alive = true;
    void Promise.all([Engine.isXrSupported('ar'), Engine.isXrSupported('vr')]).then(([ar, vr]) => {
      if (alive) setMode(ar ? 'ar' : vr ? 'vr' : null);
    });
    const off = getEngine()?.on('xrSession', (m) => {
      setActive(m !== null);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  if (!mode) return null;

  const enter = () => {
    const engine = getEngine();
    if (!engine) return;
    // Sin await antes de enterXr: el navegador exige el gesto del usuario para abrir la sesión.
    engine
      .enterXr(mode, { framebufferScale: framebufferScale() })
      .then(() => {
        if (!serverMode || !project) return;
        const leave = joinRoom(engine, project.projectId);
        const off = engine.on('xrSession', (m) => {
          if (m) return;
          leave();
          off();
        });
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        useUiStore.getState().notify(t('xr.error', { message }), 'error');
      });
  };

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
