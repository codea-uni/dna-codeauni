import { permissions } from '@cronos/api';
import { Lock, Mountain } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { useT } from '../i18n';
import { useAuth, useWorkspace } from '../server/api';
import { activeRole } from '../stores/workspaceStore';
import { ErrorLine, PageShell } from './PageShell';

/** Inicio: las minas de la empresa activa. */
export function HomePage() {
  const t = useT();
  const organization = useWorkspace((s) => s.organization);
  const isSuperAdmin = useAuth((s) => s.user?.isSuperAdmin ?? false);
  const mines = useWorkspace((s) => s.mines);
  const role = useWorkspace(activeRole);
  // El superadministrador sin empresa trabaja en la consola de la plataforma.
  if (!organization && isSuperAdmin) return <Navigate to="/platform" replace />;

  return (
    <PageShell>
      <h1>{t('workspace.mines')}</h1>
      <ErrorLine />
      {!organization && <p>{t('workspace.noOrganization')}</p>}
      {organization && mines === null && <p className="muted">{t('workspace.loading')}</p>}
      {mines?.length === 0 && (
        <p>
          {t('workspace.noMines')}{' '}
          {role && permissions.manageMines(role) && (
            <Link to="/admin">{t('workspace.noMinesAdmin')}</Link>
          )}
        </p>
      )}
      {mines && mines.length > 0 && (
        <ul className="mine-grid">
          {mines.map((m) => (
            <li key={m.id}>
              <Link className="mine-card" to={`/mines/${m.id}`}>
                <Mountain size={20} aria-hidden />
                <strong>{m.name}</strong>
                <span className="muted">
                  {m.epsg ? t('workspace.epsg', { code: m.epsg }) : t('workspace.noEpsg')}
                </span>
                {m.restricted && (
                  <span className="badge" title={t('workspace.restricted')}>
                    <Lock size={12} aria-hidden /> {t('workspace.restricted')}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
