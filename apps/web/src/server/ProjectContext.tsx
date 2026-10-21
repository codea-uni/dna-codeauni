import { permissions } from '@cronos/api';
import { Building2, Check, CloudUpload, Eye, History } from 'lucide-react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { IconButton } from '../components/IconButton';
import { useProject } from '../hooks/useDocument';
import { t as translate, useT } from '../i18n';
import { mineToolPath } from '../product/product';
import { useUiStore } from '../stores/uiStore';
import { hasUnpublished, useProjectSession, useUnpublished } from './projectSession';

/** Confirmación «Guardado como vN» junto a la versión, unos segundos después de guardar. */
export const useSavedFlash = create<{ n: number | null }>(() => ({ n: null }));
let flashTimer: ReturnType<typeof setTimeout> | undefined;
export function flashSaved(n: number): void {
  clearTimeout(flashTimer);
  useSavedFlash.setState({ n });
  flashTimer = setTimeout(() => {
    useSavedFlash.setState({ n: null });
  }, 6000);
}

/** Diálogos del modo servidor dentro del editor. */
export const useServerDialogs = create<{
  open: 'publish' | 'history' | null;
  show: (d: 'publish' | 'history' | null) => void;
}>((set) => ({
  open: null,
  show: (open) => {
    set({ open });
  },
}));

/**
 * Ctrl+S en la mina: abre «Guardar versión» (o avisa que no hay nada que guardar). Devuelve false
 * fuera del modo servidor, donde Ctrl+S descarga la copia del proyecto.
 */
export function saveVersionShortcut(): boolean {
  const current = useProjectSession.getState().current;
  if (!current) return false;
  const notify = useUiStore.getState().notify;
  if (!permissions.editDesign(current.role) || current.viewingOld)
    notify(translate('projects.readOnlyHint'), 'error');
  else if (!hasUnpublished()) notify(translate('save.nothing', { n: current.base.number }));
  else useServerDialogs.getState().show('publish');
  return true;
}

/** Mina, proyecto y versión en la barra del editor, con avisos de solo lectura y sin publicar. */
export function ProjectContext() {
  const t = useT();
  const current = useProjectSession((s) => s.current);
  const project = useProject();
  const unpublished = useUnpublished();
  const show = useServerDialogs((s) => s.show);
  const saved = useSavedFlash((s) => s.n);
  if (!current) return null;
  const canPublish = permissions.editDesign(current.role) && !current.viewingOld;
  return (
    <div className="toolbar-context">
      <span className="crumbs" title={`${current.mine.name} / ${project.name}`}>
        {/* Si falta espacio se recorta primero la mina y después el proyecto. */}
        <span className="crumb-mine">{current.mine.name} /</span>
        <strong>{project.name}</strong>
      </span>
      <span className="version-tag">v{current.base.number}</span>
      {current.viewingOld ? (
        <span className="badge">
          <Eye size={12} aria-hidden /> {t('history.viewingOld', { n: current.base.number })}
        </span>
      ) : current.role === 'reviewer' ? (
        <span className="badge" title={t('projects.readOnlyHint')}>
          <Eye size={12} aria-hidden /> {t('projects.readOnly')}
        </span>
      ) : (
        !unpublished &&
        saved !== null && (
          <span className="badge saved" role="status">
            <Check size={12} aria-hidden /> {t('save.savedAs', { n: saved })}
          </span>
        )
      )}
      {!current.viewingOld && current.role !== 'reviewer' && unpublished && (
        <>
          <span className="badge unpublished" title={t('history.unpublishedHint')}>
            {t('history.unpublished')}
          </span>
          {canPublish && (
            // «Guardar versión» con texto junto al aviso: es el guardado real en la mina.
            <button
              className="save-version"
              title={t('save.versionHint')}
              onClick={() => {
                show('publish');
              }}
            >
              <CloudUpload size={14} aria-hidden /> {t('save.version')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Historial del proyecto (guardar versión está junto al aviso de cambios sin publicar). */
export function ProjectActions() {
  const t = useT();
  const current = useProjectSession((s) => s.current);
  const show = useServerDialogs((s) => s.show);
  if (!current) return null;
  return (
    <IconButton
      icon={History}
      label={t('history.title')}
      onClick={() => {
        show('history');
      }}
    />
  );
}

/** Confirma salir del editor si hay cambios sin publicar (quedan como borrador local). */
export function confirmLeave(): boolean {
  return !hasUnpublished() || window.confirm(translate('history.unpublishedConfirm'));
}

/** Vuelve del editor a la mina del proyecto (o a las minas si no hay proyecto abierto). */
export function BackToMine() {
  const t = useT();
  const navigate = useNavigate();
  const mineId = useProjectSession((s) => s.current?.mine.id);
  // A la mina en la herramienta en uso (Open Pit o Underground).
  const tool = useProjectSession((s) => s.current?.tool);
  return (
    <IconButton
      icon={Building2}
      label={mineId ? t('projects.backToMine') : t('workspace.backToMines')}
      onClick={() => {
        if (confirmLeave())
          void navigate(mineId ? (tool ? mineToolPath(mineId, tool) : `/mines/${mineId}`) : '/');
      }}
    />
  );
}
