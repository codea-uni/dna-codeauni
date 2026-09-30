import { permissions } from '@cronos/api';
import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { UserMenu } from '../auth/UserMenu';
import { useT } from '../i18n';
import { useWorkspace } from '../server/api';
import { activeRole } from '../stores/workspaceStore';

/** Marco de las páginas fuera del editor: marca, empresa activa, navegación y cuenta. */
export function PageShell({ children }: { children: ReactNode }) {
  const t = useT();
  const organizations = useWorkspace((s) => s.organizations);
  const activeOrgId = useWorkspace((s) => s.activeOrgId);
  const setActive = useWorkspace((s) => s.setActiveOrganization);
  const role = useWorkspace(activeRole);
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
        {organizations && organizations.length > 0 && (
          <label className="page-org">
            <span className="muted">{t('workspace.organization')}</span>
            <select
              value={activeOrgId ?? ''}
              onChange={(e) => {
                void setActive(e.target.value);
              }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav className="page-nav">
          <NavLink to="/" end>
            {t('workspace.mines')}
          </NavLink>
          {role && permissions.manageMembers(role) && (
            <NavLink to="/admin">{t('workspace.admin')}</NavLink>
          )}
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
