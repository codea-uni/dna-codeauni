import { permissions } from '@cronos/api';
import { Lock } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { useFormat, useFormatDate, useT } from '../i18n';
import { useAuth, useWorkspace } from '../server/api';
import { activeRole } from '../stores/workspaceStore';
import { ErrorLine, PageShell } from './PageShell';

/** Inicio: las minas de la empresa del usuario, con sus proyectos y su última actividad. */
export function HomePage() {
  const t = useT();
  const fmt = useFormat();
  const fmtDate = useFormatDate();
  const organization = useWorkspace((s) => s.organization);
  const mines = useWorkspace((s) => s.mines);
  const role = useWorkspace(activeRole);
  const isSuperAdmin = useAuth((s) => s.user?.isSuperAdmin ?? false);
  // El superadministrador sin empresa trabaja en la consola de la plataforma.
  if (!organization && isSuperAdmin) return <Navigate to="/platform" replace />;
  const canManage = role !== null && permissions.manageMines(role);

  return (
    <PageShell>
      <header className="page-head">
        <h1>{organization?.name ?? t('workspace.mines')}</h1>
        {mines && mines.length > 0 && <p className="lede">{t('workspace.minesLede')}</p>}
      </header>
      <ErrorLine />
      {!organization && (
        <p className="empty">
          <strong>{t('workspace.noOrganizationTitle')}</strong>
          {t('workspace.noOrganization')}
        </p>
      )}
      {organization && mines === null && <p className="muted">{t('workspace.loading')}</p>}
      {mines?.length === 0 && (
        <div className="empty">
          <strong>{t('workspace.noMines')}</strong>
          {canManage ? (
            <Link to="/admin?tab=mines">{t('workspace.noMinesAdmin')}</Link>
          ) : (
            t('workspace.noMinesMember')
          )}
        </div>
      )}
      {mines && mines.length > 0 && (
        <ul className="rows">
          {mines.map((m) => (
            <li key={m.id}>
              <Link className="row-link" to={`/mines/${m.id}`}>
                <span className="row-title">
                  <strong>{m.name}</strong>
                  <span className="row-meta">
                    {m.epsg ? t('workspace.epsg', { code: m.epsg }) : t('workspace.noEpsg')}
                  </span>
                </span>
                <span className="row-figure">
                  {fmt(m.projectCount)}
                  <small>
                    {t(
                      m.projectCount === 1
                        ? 'workspace.projectsLabelOne'
                        : 'workspace.projectsLabel',
                    )}
                  </small>
                </span>
                <span className="row-meta hide-narrow">
                  {m.lastActivityAt
                    ? t('workspace.lastVersion', { date: fmtDate(m.lastActivityAt) })
                    : t('workspace.noVersionsYet')}
                </span>
                <span className="row-meta">
                  {m.restricted && (
                    <span className="badge" title={t('workspace.restrictedHint')}>
                      <Lock size={12} aria-hidden /> {t('workspace.restricted')}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
