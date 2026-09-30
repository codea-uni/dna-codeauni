import { Building2, Eye } from 'lucide-react';
import { useNavigate } from 'react-router';
import { IconButton } from '../components/IconButton';
import { useProject } from '../hooks/useDocument';
import { useT } from '../i18n';
import { useProjectSession } from './projectSession';

/** Mina, proyecto y versión base en la barra del editor; «Solo lectura» para el revisor. */
export function ProjectContext() {
  const t = useT();
  const current = useProjectSession((s) => s.current);
  const project = useProject();
  if (!current) return null;
  const readOnly = current.role === 'reviewer';
  return (
    <div className="toolbar-context">
      <span className="muted">
        {t('projects.context', {
          mine: current.mine.name,
          project: project.name,
          n: current.base.number,
        })}
      </span>
      {readOnly && (
        <span className="badge" title={t('projects.readOnlyHint')}>
          <Eye size={12} aria-hidden /> {t('projects.readOnly')}
        </span>
      )}
    </div>
  );
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
        void navigate(mineId ? `/mines/${mineId}` : '/');
      }}
    />
  );
}
