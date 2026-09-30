import type { PlatformOrganization, PlatformUser } from '@cronos/api';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useFormat, useFormatDate, useT, type MessageKey } from '../i18n';
import { api, useAuth } from '../server/api';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { PageShell } from './PageShell';
import { roleKey } from './roles';

/**
 * Consola de la plataforma (superadministrador, D-14): todas las empresas con sus números, alta
 * de empresas con su primer administrador y desactivación de empresas o cuentas.
 */
export function PlatformPage() {
  const t = useT();
  const isSuperAdmin = useAuth((s) => s.user?.isSuperAdmin ?? false);
  const [orgs, setOrgs] = useState<PlatformOrganization[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let alive = true;
    api.platformOrganizations().then(
      (list) => {
        if (alive) setOrgs(list);
      },
      (err: unknown) => {
        if (alive) setError(workspaceErrorKey(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [isSuperAdmin]);
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const replace = (org: PlatformOrganization) => {
    setOrgs((list) => list?.map((o) => (o.id === org.id ? org : o)) ?? [org]);
  };
  const toggle = async (org: PlatformOrganization) => {
    const key = org.disabled ? 'platform.enableConfirm' : 'platform.disableConfirm';
    if (!window.confirm(t(key, { name: org.name }))) return;
    try {
      replace(await api.updatePlatformOrganization(org.id, { disabled: !org.disabled }));
    } catch (err) {
      setError(workspaceErrorKey(err));
    }
  };
  const active = orgs?.filter((o) => !o.disabled).length ?? 0;
  const disabled = (orgs?.length ?? 0) - active;

  return (
    <PageShell>
      <header className="page-head">
        <h1>{t('platform.title')}</h1>
        <p className="lede">{t('platform.intro')}</p>
      </header>
      {error && (
        <p className="auth-error" role="alert">
          {t(error)}
        </p>
      )}

      <section className="section">
        <div className="section-head">
          <h2>{t('platform.companies')}</h2>
          {orgs && orgs.length > 0 && (
            <span className="muted">
              {t('platform.activeCount', { n: active })}
              {disabled > 0 && <> · {t('platform.disabledCount', { n: disabled })}</>}
            </span>
          )}
        </div>
        {!orgs && !error && <p className="muted">{t('workspace.loading')}</p>}
        {orgs?.length === 0 && (
          <p className="empty">
            <strong>{t('platform.emptyTitle')}</strong>
            {t('platform.empty')}
          </p>
        )}
        <ul className="company-list">
          {orgs?.map((o) => (
            <CompanyRow
              key={o.id}
              org={o}
              expanded={open === o.id}
              onToggleUsers={() => {
                setOpen(open === o.id ? null : o.id);
              }}
              onToggleDisabled={() => void toggle(o)}
              onUpdated={replace}
              onError={setError}
            />
          ))}
        </ul>
      </section>

      <NewCompany
        onCreated={(org) => {
          setOrgs((list) => [...(list ?? []), org].sort((a, b) => a.name.localeCompare(b.name)));
        }}
      />
    </PageShell>
  );
}

function CompanyRow({
  org,
  expanded,
  onToggleUsers,
  onToggleDisabled,
  onUpdated,
  onError,
}: {
  org: PlatformOrganization;
  expanded: boolean;
  onToggleUsers: () => void;
  onToggleDisabled: () => void;
  onUpdated: (org: PlatformOrganization) => void;
  onError: (e: MessageKey) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const fmtDate = useFormatDate();
  const stats: [MessageKey, number][] = [
    ['platform.people', org.members],
    ['platform.mines', org.mines],
    ['platform.projects', org.projects],
    ['platform.versions', org.versions],
  ];
  return (
    <li className={`company${org.disabled ? ' is-disabled' : ''}`}>
      <div className="company-main">
        <div className="company-id">
          <h3>{org.name}</h3>
          <span className={`status ${org.disabled ? 'off' : 'on'}`}>
            {t(org.disabled ? 'platform.status.disabled' : 'platform.status.active')}
          </span>
          {org.admins.length > 0 ? (
            <p className="muted">{org.admins.map((a) => `${a.name} <${a.email}>`).join(', ')}</p>
          ) : (
            <p className="warn-text">{t('platform.noAdmin')}</p>
          )}
        </div>
        <dl className="company-stats">
          {stats.map(([label, n]) => (
            <div key={label}>
              <dt>{t(label)}</dt>
              <dd>{fmt(n)}</dd>
            </div>
          ))}
          <div>
            <dt>{t('platform.lastActivity')}</dt>
            <dd className="date">
              {org.lastActivityAt ? fmtDate(org.lastActivityAt) : t('platform.never')}
            </dd>
          </div>
        </dl>
        <div className="company-actions">
          <button onClick={onToggleUsers} aria-expanded={expanded}>
            {t(expanded ? 'platform.hideUsers' : 'platform.showUsers')}
          </button>
          <button className={org.disabled ? 'primary-inline' : 'danger'} onClick={onToggleDisabled}>
            {t(org.disabled ? 'platform.enable' : 'platform.disable')}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="company-detail">
          <CompanyUsers key={org.admins.length} orgId={org.id} onError={onError} />
          <AddAdmin orgId={org.id} onAdded={onUpdated} onError={onError} />
        </div>
      )}
    </li>
  );
}

function CompanyUsers({ orgId, onError }: { orgId: string; onError: (e: MessageKey) => void }) {
  const t = useT();
  const fmtDate = useFormatDate();
  const me = useAuth((s) => s.user?.id);
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.platformUsers(orgId).then(
      (u) => {
        if (alive) setUsers(u);
      },
      (err: unknown) => {
        onError(workspaceErrorKey(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [orgId, onError]);

  const toggle = async (u: PlatformUser) => {
    if (!u.disabled && !window.confirm(t('platform.userDisableConfirm', { name: u.name }))) return;
    try {
      const updated = await api.setUserDisabled(u.userId, !u.disabled);
      setUsers((list) => list?.map((x) => (x.userId === u.userId ? updated : x)) ?? null);
    } catch (err) {
      onError(workspaceErrorKey(err));
    }
  };

  if (!users) return <p className="muted company-users">{t('workspace.loading')}</p>;
  if (users.length === 0) return <p className="muted">{t('platform.noPeople')}</p>;
  return (
    <table className="page-table company-users">
      <thead>
        <tr>
          <th>{t('workspace.name')}</th>
          <th>{t('admin.email')}</th>
          <th>{t('admin.role')}</th>
          <th>{t('platform.lastSeen')}</th>
          <th>{t('platform.account')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.userId} className={u.disabled ? 'is-disabled' : undefined}>
            <td>{u.name}</td>
            <td>{u.email}</td>
            <td>{t(roleKey(u.role))}</td>
            <td>{u.lastSeenAt ? fmtDate(u.lastSeenAt) : '—'}</td>
            <td>{t(u.disabled ? 'platform.accountDisabled' : 'platform.accountActive')}</td>
            <td className="actions">
              {u.userId !== me && (
                <button
                  className={u.disabled ? undefined : 'danger'}
                  onClick={() => void toggle(u)}
                >
                  {t(u.disabled ? 'platform.enable' : 'platform.disable')}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NewCompany({ onCreated }: { onCreated: (org: PlatformOrganization) => void }) {
  const t = useT();
  const [form, setForm] = useState({ name: '', adminName: '', adminEmail: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm({ ...form, [key]: e.target.value });
    },
  });

  return (
    <section className="section">
      <form
        className="form-panel"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setDone(null);
          api
            .createPlatformOrganization({
              name: form.name.trim(),
              admin: {
                name: form.adminName.trim(),
                email: form.adminEmail.trim(),
                ...(form.password ? { password: form.password } : {}),
              },
            })
            .then(
              (org) => {
                onCreated(org);
                setDone(org.name);
                setForm({ name: '', adminName: '', adminEmail: '', password: '' });
              },
              (err: unknown) => {
                setError(workspaceErrorKey(err));
              },
            )
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        <h2>{t('platform.newCompany')}</h2>
        <p>{t('platform.newCompanyHint')}</p>
        <div className="form-grid">
          <label>
            {t('platform.companyName')}
            <input
              required
              maxLength={120}
              name="company-name"
              autoComplete="off"
              {...field('name')}
            />
          </label>
          <label>
            {t('platform.adminName')}
            <input required maxLength={120} autoComplete="off" {...field('adminName')} />
          </label>
          <label>
            {t('platform.adminEmail')}
            <input
              required
              type="email"
              autoComplete="off"
              spellCheck={false}
              {...field('adminEmail')}
            />
          </label>
          <label>
            {t('platform.adminPassword')}
            <input
              minLength={10}
              autoComplete="new-password"
              spellCheck={false}
              {...field('password')}
            />
            <small>{t('admin.tempPasswordHint')}</small>
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        {done && (
          <p className="ok" role="status">
            {t('platform.created', { name: done })}
          </p>
        )}
        <div>
          <button className="primary" type="submit" disabled={busy}>
            {t('platform.create')}
          </button>
        </div>
      </form>
    </section>
  );
}

function AddAdmin({
  orgId,
  onAdded,
  onError,
}: {
  orgId: string;
  onAdded: (org: PlatformOrganization) => void;
  onError: (e: MessageKey) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm({ ...form, [key]: e.target.value });
    },
  });
  return (
    <form
      className="section"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        api
          .addPlatformAdmin(orgId, {
            name: form.name.trim(),
            email: form.email.trim(),
            ...(form.password ? { password: form.password } : {}),
          })
          .then(
            (org) => {
              onAdded(org);
              setForm({ name: '', email: '', password: '' });
            },
            (err: unknown) => {
              onError(workspaceErrorKey(err));
            },
          )
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <h3>{t('platform.addAdmin')}</h3>
      <p className="muted">{t('platform.addAdminHint')}</p>
      <div className="form-grid">
        <label>
          {t('workspace.name')}
          <input required name="admin-name" autoComplete="off" {...field('name')} />
        </label>
        <label>
          {t('admin.email')}
          <input
            required
            type="email"
            name="admin-email"
            autoComplete="off"
            spellCheck={false}
            {...field('email')}
          />
        </label>
        <label>
          {t('admin.tempPassword')}
          <input
            minLength={10}
            name="admin-password"
            autoComplete="new-password"
            {...field('password')}
          />
        </label>
        <div>
          <button className="primary" type="submit" disabled={busy}>
            {t('platform.assign')}
          </button>
        </div>
      </div>
    </form>
  );
}
