import { permissions } from '@cronos/api';
import { Building2, CloudUpload, Eye, History } from 'lucide-react';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { IconButton } from '../components/IconButton';
import { useProject } from '../hooks/useDocument';
import { t as translate, useT } from '../i18n';
import { hasUnpublished, useProjectSession, useUnpublished } from './projectSession';

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

/** Mina, proyecto y versión en la barra del editor, con avisos de solo lectura y sin publicar. */
export function ProjectContext() {
  const t = useT();
  const current = useProjectSession((s) => s.current);
  const project = useProject();
  const unpublished = useUnpublished();
  if (!current) return null;
  return (
    <div className="toolbar-context">
      <span className="muted">
        {t('projects.context', {
          mine: current.mine.name,
          project: project.name,
          n: current.base.number,
        })}
      </span>
      {current.viewingOld ? (
        <span className="badge">
          <Eye size={12} aria-hidden /> {t('history.viewingOld', { n: current.base.number })}
        </span>
      ) : current.role === 'reviewer' ? (
        <span className="badge" title={t('projects.readOnlyHint')}>
          <Eye size={12} aria-hidden /> {t('projects.readOnly')}
        </span>
      ) : (
        unpublished && <span className="badge unpublished">{t('history.unpublished')}</span>
      )}
    </div>
  );
}

/** Historial del proyecto y «Guardar versión» (solo quien puede editar y sobre la última). */
export function ProjectActions() {
  const t = useT();
  const current = useProjectSession((s) => s.current);
  const unpublished = useUnpublished();
  const show = useServerDialogs((s) => s.show);
  if (!current) return null;
  const canPublish = permissions.editDesign(current.role) && !current.viewingOld;
  return (
    <>
      <IconButton
        icon={History}
        label={t('history.title')}
        onClick={() => {
          show('history');
        }}
      />
      {canPublish && (
        <IconButton
          icon={CloudUpload}
          label={t('history.publish')}
          active={unpublished}
          disabled={!unpublished}
          onClick={() => {
            show('publish');
          }}
        />
      )}
    </>
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
  return (
    <IconButton
      icon={Building2}
      label={mineId ? t('projects.backToMine') : t('workspace.backToMines')}
      onClick={() => {
        if (confirmLeave()) void navigate(mineId ? `/mines/${mineId}` : '/');
      }}
    />
  );
}
