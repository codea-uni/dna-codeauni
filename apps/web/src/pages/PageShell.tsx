import { permissions } from '@cronos/api';
import type { ProjectKind } from '@cronos/core';
import { ProductMark } from '../product/CrossView';
import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { UserMenu } from '../auth/UserMenu';
import { BrandMark } from '../components/BrandMark';
import { useT } from '../i18n';
import { useAuth, useWorkspace } from '../server/api';
import { activeRole } from '../stores/workspaceStore';

export interface Crumb {
  label: string;
  /** Sin `to`, es la página actual. */
  to?: string;
}

/**
 * Marco de las páginas fuera del editor: marca, ruta (dónde estoy), navegación y cuenta.
 * `children` va en una columna de contenido centrada (o a todo el ancho con `wide`).
 */
export function PageShell({
  children,
  crumbs,
  tool,
  wide = false,
}: {
  children: ReactNode;
  crumbs?: Crumb[];
  tool?: ProjectKind;
  /** Usa todo el ancho de la pantalla (páginas con varias columnas, como la mina). */
  wide?: boolean;
}) {
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
        {/* Una sola marca: «Cronos» y, dentro de una mina, la herramienta con su acento. */}
        <Link to="/" className="wordmark" translate="no" aria-label="Cronos">
          <BrandMark size={24} />
          {tool && <ProductMark tool={tool} short />}
        </Link>
        {crumbs && crumbs.length > 0 && (
          <nav className="crumbs-nav" aria-label={t('workspace.breadcrumb')}>
            <ol>
              {crumbs.map((c) => (
                <li key={c.label}>
                  {c.to ? (
                    <Link to={c.to}>{c.label}</Link>
                  ) : (
                    <strong aria-current="page">{c.label}</strong>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <nav className="sections-nav" aria-label={t('workspace.navigation')}>
          {organization && (
            <NavLink to="/" end>
              {t('workspace.minesOf', { org: organization.name })}
            </NavLink>
          )}
          {role && permissions.manageMembers(role) && (
            <NavLink to="/admin">{t('workspace.admin')}</NavLink>
          )}
          {(organization !== null || isSuperAdmin) && (
            <NavLink to="/knowledge">{t('kb.nav')}</NavLink>
          )}
          {isSuperAdmin && <NavLink to="/platform">{t('platform.title')}</NavLink>}
        </nav>
        <div className="toolbar-account">
          <UserMenu />
        </div>
      </header>
      <main className="page-body">
        <div className={wide ? 'page-content page-content-wide' : 'page-content'}>{children}</div>
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
