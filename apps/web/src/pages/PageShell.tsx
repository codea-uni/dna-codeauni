import { permissions } from '@cronos/api';
import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { UserMenu } from '../auth/UserMenu';
import { useT } from '../i18n';
import { useAuth, useWorkspace } from '../server/api';
import { activeRole } from '../stores/workspaceStore';

/**
 * Marco de las páginas fuera del editor: marca, empresa del usuario (fija, D-15), navegación y
 * cuenta. `children` va en una columna de contenido centrada.
 */
export function PageShell({ children }: { children: ReactNode }) {
  const t = useT();
  const organization = useWorkspace((s) => s.organization);
  const role = useWorkspace(activeRole);
  const isSuperAdmin = useAuth((s) => s.user?.isSuperAdmin ?? false);
  const clearError = useWorkspace((s) => s.clearError);
  const { pathname } = useLocation();
  // Un error de otra página no se arrastra al navegar.
  useEffect(() => {
    clearError();
  }, [pathname, clearError]);

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="wordmark" translate="no">
          Cronos
        </Link>
        <nav aria-label={t('workspace.navigation')}>
          {organization && (
            <NavLink to="/" end>
              {t('workspace.minesOf', { org: organization.name })}
            </NavLink>
          )}
          {role && permissions.manageMembers(role) && (
            <NavLink to="/admin">{t('workspace.admin')}</NavLink>
          )}
          {isSuperAdmin && <NavLink to="/platform">{t('platform.title')}</NavLink>}
        </nav>
        <div className="toolbar-account">
          <UserMenu />
        </div>
      </header>
      <main className="page-body">
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

/** Mensaje de error de la API, traducido. */
export function ErrorLine() {
  const t = useT();
  const error = useWorkspace((s) => s.error);
  if (!error) return null;
  return (
    <p className="form-error" role="alert">
      {t(error)}
    </p>
  );
}
