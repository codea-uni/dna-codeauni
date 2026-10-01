import { ROLES, permissions, type AuditEvent, type Mine, type Role } from '@cronos/api';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useFormatDate, useT, type MessageKey } from '../i18n';
import { api, useAuth, useWorkspace } from '../server/api';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { ErrorLine, PageShell } from './PageShell';
import { roleHintKey, roleKey } from './roles';

const AUDIT_KEYS: Record<string, MessageKey> = {
  'organization.create': 'audit.organization.create',
  'organization.rename': 'audit.organization.rename',
  'organization.disable': 'audit.organization.disable',
  'organization.enable': 'audit.organization.enable',
  'member.add': 'audit.member.add',
  'member.role_change': 'audit.member.role_change',
  'member.remove': 'audit.member.remove',
  'user.disable': 'audit.user.disable',
  'user.enable': 'audit.user.enable',
  'mine.create': 'audit.mine.create',
  'mine.update': 'audit.mine.update',
  'mine.access_change': 'audit.mine.access_change',
  'project.create': 'audit.project.create',
  'version.create': 'audit.version.create',
  'version.restore': 'audit.version.restore',
};

const TABS = [
  ['people', 'admin.members'],
  ['mines', 'admin.mines'],
  ['audit', 'admin.audit'],
] as const satisfies readonly (readonly [string, MessageKey])[];
type Tab = (typeof TABS)[number][0];

/** Administración de la empresa: personas y roles, minas y su acceso, y auditoría. */
export function AdminPage() {
  const t = useT();
  // El rol sale de la sesión (llega antes que el espacio de trabajo al recargar la página).
  const organization = useAuth((s) => s.organization);
  const role = organization?.role ?? null;
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = TABS.find(([id]) => id === requested)?.[0] ?? 'people';
  if (!role || !permissions.manageMembers(role)) return <Navigate to="/" replace />;

  return (
    <PageShell>
      <header className="page-head">
        <h1>{t('admin.title', { org: organization?.name ?? '' })}</h1>
        <p className="lede">{t('admin.lede')}</p>
      </header>
      <div className="admin-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setParams(id === 'people' ? {} : { tab: id }, { replace: true });
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <ErrorLine />
      {tab === 'people' && <People />}
      {tab === 'mines' && <Mines />}
      {tab === 'audit' && <Audit />}
    </PageShell>
  );
}

function People() {
  const t = useT();
  const fmtDate = useFormatDate();
  const me = useAuth((s) => s.user);
  const orgId = useWorkspace((s) => s.organization?.id);
  const members = useWorkspace((s) => s.members);
  const load = useWorkspace((s) => s.loadMembers);
  const updateRole = useWorkspace((s) => s.updateMemberRole);
  const remove = useWorkspace((s) => s.removeMember);
  useEffect(() => {
    if (orgId) void load();
  }, [orgId, load]);

  return (
    <section className="section">
      <p className="muted">{t('admin.membersHint')}</p>
      {members && (
        <table className="page-table">
          <thead>
            <tr>
              <th>{t('workspace.name')}</th>
              <th>{t('admin.email')}</th>
              <th>{t('admin.role')}</th>
              <th>{t('admin.since')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>
                  {m.name} {m.userId === me?.id && <span className="muted">{t('admin.you')}</span>}
                </td>
                <td>{m.email}</td>
                <td>
                  <select
                    aria-label={t('admin.roleOf', { name: m.name })}
                    value={m.role}
                    onChange={(e) => {
                      void updateRole(m.userId, e.target.value as Role);
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r} title={t(roleHintKey(r))}>
                        {t(roleKey(r))}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{fmtDate(m.createdAt)}</td>
                <td className="actions">
                  {m.userId !== me?.id && (
                    <button
                      className="danger"
                      onClick={() => {
                        if (window.confirm(t('admin.removeConfirm', { name: m.name })))
                          void remove(m.userId);
                      }}
                    >
                      {t('admin.remove')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <AddMember />
    </section>
  );
}

function AddMember() {
  const t = useT();
  const add = useWorkspace((s) => s.addMember);
  const busy = useWorkspace((s) => s.busy);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('designer');
  const [password, setPassword] = useState('');

  return (
    <form
      className="form-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void add({
          email: email.trim(),
          name: name.trim(),
          role,
          ...(password ? { password } : {}),
        }).then((ok) => {
          if (ok) {
            setEmail('');
            setName('');
            setPassword('');
          }
        });
      }}
    >
      <h2>{t('admin.addMember')}</h2>
      <div className="form-grid">
        <label>
          {t('workspace.name')}
          <input
            required
            name="member-name"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <label>
          {t('admin.email')}
          <input
            type="email"
            required
            name="member-email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </label>
        <label>
          {t('admin.role')}
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role);
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(roleKey(r))}
              </option>
            ))}
          </select>
          <small>{t(roleHintKey(role))}</small>
        </label>
        <label>
          {t('admin.tempPassword')}
          <input
            type="text"
            name="member-password"
            autoComplete="new-password"
            spellCheck={false}
            minLength={8}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
          <small>{t('admin.tempPasswordHint')}</small>
        </label>
      </div>
      <div>
        <button className="primary" type="submit" disabled={busy}>
          {t('admin.addMemberAction')}
        </button>
      </div>
    </form>
  );
}

function Mines() {
  const t = useT();
  const mines = useWorkspace((s) => s.mines);
  const createMine = useWorkspace((s) => s.createMine);
  const busy = useWorkspace((s) => s.busy);
  const [name, setName] = useState('');
  const [epsg, setEpsg] = useState('');
  const [editing, setEditing] = useState<Mine | null>(null);

  return (
    <section className="section">
      <p className="muted">{t('admin.minesHint')}</p>
      {mines && mines.length > 0 && (
        <table className="page-table">
          <thead>
            <tr>
              <th>{t('workspace.name')}</th>
              <th>EPSG</th>
              <th>{t('admin.access')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mines.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.epsg ?? '—'}</td>
                <td>
                  {m.restricted
                    ? t('workspace.usersCount', { n: m.accessUserIds.length })
                    : t('workspace.everyone')}
                </td>
                <td className="actions">
                  <button
                    onClick={() => {
                      setEditing(m);
                    }}
                  >
                    {t('admin.editAccess')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="form-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const code = Number(epsg);
          void createMine({
            name: name.trim(),
            ...(epsg && Number.isInteger(code) && code > 0 ? { epsg: code } : {}),
          }).then((mine) => {
            if (mine) {
              setName('');
              setEpsg('');
            }
          });
        }}
      >
        <h2>{t('admin.newMine')}</h2>
        <div className="form-grid">
          <label>
            {t('workspace.name')}
            <input
              required
              name="mine-name"
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </label>
          <label>
            EPSG
            <input
              type="number"
              inputMode="numeric"
              name="mine-epsg"
              min={1}
              step={1}
              value={epsg}
              onChange={(e) => {
                setEpsg(e.target.value);
              }}
            />
            <small>{t('admin.epsgHint')}</small>
          </label>
        </div>
        <div>
          <button className="primary" type="submit" disabled={busy}>
            {t('admin.createMine')}
          </button>
        </div>
      </form>
      {editing && (
        <AccessDialog
          mine={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function AccessDialog({ mine, onClose }: { mine: Mine; onClose: () => void }) {
  const t = useT();
  const orgId = useWorkspace((s) => s.organization?.id);
  const members = useWorkspace((s) => s.members);
  const loadMembers = useWorkspace((s) => s.loadMembers);
  const setAccess = useWorkspace((s) => s.setMineAccess);
  const busy = useWorkspace((s) => s.busy);
  const [selected, setSelected] = useState(() => new Set(mine.accessUserIds));
  useEffect(() => {
    if (orgId && !members) void loadMembers();
  }, [orgId, members, loadMembers]);
  // Los administradores ven todas las minas: no hace falta listarlos.
  const candidates = (members ?? []).filter((m) => m.role !== 'admin');

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal dialog-narrow"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{t('admin.accessTitle', { mine: mine.name })}</h2>
          <button className="icon" onClick={onClose} aria-label={t('settings.close')}>
            <X size={16} />
          </button>
        </header>
        <div className="dialog-body">
          <p className="muted">{t('admin.accessHint')}</p>
          <div className="access-list">
            {candidates.map((m) => (
              <label key={m.userId}>
                <input
                  type="checkbox"
                  checked={selected.has(m.userId)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(m.userId);
                    else next.delete(m.userId);
                    setSelected(next);
                  }}
                />
                {m.name} <span className="muted">({t(roleKey(m.role))})</span>
              </label>
            ))}
          </div>
        </div>
        <footer>
          <button onClick={onClose}>{t('workspace.cancel')}</button>
          <button
            className="primary-inline"
            disabled={busy}
            onClick={() => {
              void setAccess(mine.id, [...selected]).then((ok) => {
                if (ok) onClose();
              });
            }}
          >
            {t('admin.saveAccess')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Audit() {
  const t = useT();
  const fmtDate = useFormatDate();
  const orgId = useWorkspace((s) => s.organization?.id);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    api.audit(orgId).then(
      (e) => {
        if (alive) setEvents(e);
      },
      (err: unknown) => {
        if (alive) setError(workspaceErrorKey(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [orgId]);

  const detail = (e: AuditEvent): string => {
    const pick = (k: string) => {
      const v = e.data[k];
      return typeof v === 'string' ? v : null;
    };
    const to = pick('to');
    return [
      pick('name') ?? pick('project'),
      pick('email'),
      to && ROLES.includes(to as Role) ? t(roleKey(to as Role)) : null,
      typeof e.data.number === 'number' ? `v${e.data.number}` : null,
    ]
      .filter(Boolean)
      .join(', ');
  };

  return (
    <section className="section">
      <p className="muted">{t('admin.auditHint')}</p>
      {error && <p className="form-error">{t(error)}</p>}
      {events?.length === 0 && <p className="empty">{t('admin.auditEmpty')}</p>}
      {events && events.length > 0 && (
        <table className="page-table">
          <thead>
            <tr>
              <th>{t('admin.when')}</th>
              <th>{t('admin.who')}</th>
              <th>{t('admin.what')}</th>
              <th>{t('admin.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const key = AUDIT_KEYS[e.action];
              return (
                <tr key={e.id}>
                  <td>{fmtDate(e.at)}</td>
                  <td>{e.actorName ?? '—'}</td>
                  <td>{key ? t(key) : e.action}</td>
                  <td className="muted">{detail(e)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
