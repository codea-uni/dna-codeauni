import { permissions } from '@cronos/api';
import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { UserMenu } from '../auth/UserMenu';
import { useT } from '../i18n';
import { useAuth, useWorkspace } from '../server/api';
import { activeRole } from '../stores/workspaceStore';

/** Marco de las páginas fuera del editor: marca, empresa activa, navegación y cuenta. */
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
      <header className="page-bar">
        <strong className="brand">Cronos</strong>
        {organization && <span className="page-org">{organization.name}</span>}
        <nav className="page-nav">
          <NavLink to="/" end>
            {t('workspace.mines')}
          </NavLink>
          {role && permissions.manageMembers(role) && (
            <NavLink to="/admin">{t('workspace.admin')}</NavLink>
          )}
          {isSuperAdmin && <NavLink to="/platform">{t('platform.title')}</NavLink>}
        </nav>
        <div className="toolbar-account">
          <UserMenu />
        </div>
      </header>
      <main className="page-body">{children}</main>
    </div>
  );
}

/** Mensaje de error de la API, traducido. */
export function ErrorLine() {
  const t = useT();
  const error = useWorkspace((s) => s.error);
  if (!error) return null;
  return (
    <p className="auth-error" role="alert">
      {t(error)}
    </p>
  );
}
