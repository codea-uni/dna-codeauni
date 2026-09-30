import { permissions } from '@cronos/api';
import { Lock, Mountain } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { useWorkspace } from '../server/api';
import { activeRole } from '../stores/workspaceStore';
import { ErrorLine, PageShell } from './PageShell';

/** Inicio: las minas de la empresa activa. */
export function HomePage() {
  const t = useT();
  const organizations = useWorkspace((s) => s.organizations);
  const mines = useWorkspace((s) => s.mines);
  const role = useWorkspace(activeRole);

  return (
    <PageShell>
      <h1>{t('workspace.mines')}</h1>
      <ErrorLine />
      {organizations === null && <p className="muted">{t('workspace.loading')}</p>}
      {organizations?.length === 0 && <p>{t('workspace.noOrganization')}</p>}
      {organizations && organizations.length > 0 && mines === null && (
        <p className="muted">{t('workspace.loading')}</p>
      )}
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
      {role && permissions.manageMembers(role) && <NewOrganization />}
    </PageShell>
  );
}

function NewOrganization() {
  const t = useT();
  const create = useWorkspace((s) => s.createOrganization);
  const busy = useWorkspace((s) => s.busy);
  const [name, setName] = useState('');
  return (
    <section className="page-section">
      <h2>{t('workspace.newOrganization')}</h2>
      <p className="muted">{t('workspace.newOrganizationHint')}</p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create(name.trim()).then((ok) => {
            if (ok) setName('');
          });
        }}
      >
        <input
          aria-label={t('workspace.name')}
          placeholder={t('workspace.name')}
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <button className="primary" type="submit" disabled={busy}>
          {t('workspace.create')}
        </button>
      </form>
    </section>
  );
}
