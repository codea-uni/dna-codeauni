import { Engine, type XrMode } from '@cronos/engine';
import type { RoomRole } from '@cronos/api';
import { Presentation, RectangleGoggles, Table2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../components/IconButton';
import { useT } from '../i18n';
import { useProjectSession } from '../server/projectSession';
import { serverMode } from '../server/api';
import { getEngine } from '../session';
import { useUiStore } from '../stores/uiStore';
import { joinRoom } from './room';

// ponytail: escala del framebuffer por modelo de visor; medir en el Quest 2 y ajustar (D-19).
const framebufferScale = () => (navigator.userAgent.includes('Quest 2') ? 0.8 : 1);

/**
 * Botones «Entrar en VR» y «Maqueta en AR» de la pestaña Vista: solo aparecen si el navegador
 * (p. ej. el del Meta Quest) puede abrir la sesión. Se entra directo: los mapas y la pila que
 * terminan de calcularse después se ven aparecer dentro del visor.
 */
export function XrButtons() {
  const t = useT();
  const [supported, setSupported] = useState<Record<XrMode, boolean>>({ vr: false, ar: false });
  const [active, setActive] = useState<XrMode | null>(null);
  const project = useProjectSession((s) => s.current);

  useEffect(() => {
    let alive = true;
    void Promise.all([Engine.isXrSupported('vr'), Engine.isXrSupported('ar')]).then(([vr, ar]) => {
      if (alive) setSupported({ vr, ar });
    });
    const off = getEngine()?.on('xrSession', setActive);
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  if (!supported.vr && !supported.ar) return null;

  /** Con `role`, además entra a la sala de la versión abierta (multiusuario remoto). */
  const enter = (mode: XrMode, role?: RoomRole) => {
    const engine = getEngine();
    if (!engine) return;
    // Sin await antes de enterXr: el navegador exige el gesto del usuario para abrir la sesión.
    engine
      .enterXr(mode, { framebufferScale: framebufferScale() })
      .then(() => {
        if (!role || !project) return;
        const leave = joinRoom(engine, project.projectId, project.base.number, role);
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
  const room = serverMode && project !== null && supported.vr;

  return (
    <div
      className="toolbar-group"
      data-group={t('xr.group')}
      role="group"
      aria-label={t('xr.group')}
    >
      {supported.vr && (
        <IconButton
          showLabel
          icon={RectangleGoggles}
          label={t('xr.enterVr')}
          hint={t('xr.hint')}
          active={active === 'vr'}
          onClick={() => {
            enter('vr');
          }}
        />
      )}
      {room && (
        <IconButton
          showLabel
          icon={Presentation}
          label={t('xr.present')}
          hint={t('xr.presentHint')}
          onClick={() => {
            enter('vr', 'presenter');
          }}
        />
      )}
      {room && (
        <IconButton
          showLabel
          icon={Users}
          label={t('xr.join')}
          hint={t('xr.joinHint')}
          onClick={() => {
            enter('vr', 'viewer');
          }}
        />
      )}
      {supported.ar && (
        <IconButton
          showLabel
          icon={Table2}
          label={t('xr.enterAr')}
          hint={t('xr.hintAr')}
          active={active === 'ar'}
          onClick={() => {
            enter('ar');
          }}
        />
      )}
    </div>
  );
}
