import { ROLES, permissions, type AuditEvent, type Mine, type Role } from '@cronos/api';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useFormatDate, useT, type MessageKey } from '../i18n';
import { api, useAuth, useWorkspace } from '../server/api';
import { activeRole, workspaceErrorKey } from '../stores/workspaceStore';
import { ErrorLine, PageShell } from './PageShell';
import { roleHintKey, roleKey } from './roles';

const AUDIT_KEYS: Record<string, MessageKey> = {
  'organization.create': 'audit.organization.create',
  'member.add': 'audit.member.add',
  'member.role_change': 'audit.member.role_change',
  'member.remove': 'audit.member.remove',
  'mine.create': 'audit.mine.create',
  'mine.update': 'audit.mine.update',
  'mine.access_change': 'audit.mine.access_change',
};

/** Administración de la empresa activa: usuarios y roles, minas y su acceso, auditoría. */
export function AdminPage() {
  const role = useWorkspace(activeRole);
  const organizations = useWorkspace((s) => s.organizations);
  if (organizations && (!role || !permissions.manageMembers(role)))
    return <Navigate to="/" replace />;
  return (
    <PageShell>
      <ErrorLine />
      <Members />
      <Mines />
      <Audit />
    </PageShell>
  );
}

function Members() {
  const t = useT();
  const fmtDate = useFormatDate();
  const me = useAuth((s) => s.user);
  const orgId = useWorkspace((s) => s.activeOrgId);
  const members = useWorkspace((s) => s.members);
  const load = useWorkspace((s) => s.loadMembers);
  const updateRole = useWorkspace((s) => s.updateMemberRole);
  const remove = useWorkspace((s) => s.removeMember);
  useEffect(() => {
    if (orgId) void load();
  }, [orgId, load]);

  return (
    <section className="page-section">
      <h2>{t('admin.members')}</h2>
      <p className="muted">{t('admin.membersHint')}</p>
      {members && (
        <table className="grid-table page-table">
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
                    aria-label={t('admin.role')}
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
                <td>
                  <button
                    className="danger"
                    onClick={() => {
                      if (window.confirm(t('admin.removeConfirm', { name: m.name })))
                        void remove(m.userId);
                    }}
                  >
                    {t('admin.remove')}
                  </button>
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
      className="inline-form wrap"
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
      <strong>{t('admin.addMember')}</strong>
      <input
        type="email"
        required
        placeholder={t('admin.email')}
        aria-label={t('admin.email')}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
        }}
      />
      <input
        required
        placeholder={t('workspace.name')}
        aria-label={t('workspace.name')}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <select
        aria-label={t('admin.role')}
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
      <input
        type="text"
        autoComplete="off"
        minLength={10}
        placeholder={t('admin.tempPassword')}
        aria-label={t('admin.tempPassword')}
        title={t('admin.tempPasswordHint')}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
      <button className="primary" type="submit" disabled={busy}>
        {t('workspace.create')}
      </button>
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
    <section className="page-section">
      <h2>{t('admin.mines')}</h2>
      <p className="muted">{t('admin.minesHint')}</p>
      {mines && mines.length > 0 && (
        <table className="grid-table page-table">
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
                <td>
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
        className="inline-form"
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
        <strong>{t('admin.newMine')}</strong>
        <input
          required
          placeholder={t('workspace.name')}
          aria-label={t('workspace.name')}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <input
          type="number"
          min={1}
          step={1}
          placeholder="EPSG"
          aria-label="EPSG"
          value={epsg}
          onChange={(e) => {
            setEpsg(e.target.value);
          }}
        />
        <button className="primary" type="submit" disabled={busy}>
          {t('workspace.create')}
        </button>
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
  const members = useWorkspace((s) => s.members) ?? [];
  const setAccess = useWorkspace((s) => s.setMineAccess);
  const busy = useWorkspace((s) => s.busy);
  const [selected, setSelected] = useState(() => new Set(mine.accessUserIds));
  // Los administradores ven todas las minas: no hace falta listarlos.
  const candidates = members.filter((m) => m.role !== 'admin');

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal auth-modal"
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
        <p className="muted">{t('admin.accessHint')}</p>
        <div className="access-list">
          {candidates.map((m) => (
            <label key={m.userId} className="check">
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
              {m.name} <span className="muted">· {t(roleKey(m.role))}</span>
            </label>
          ))}
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
            {t('workspace.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Audit() {
  const t = useT();
  const fmtDate = useFormatDate();
  const orgId = useWorkspace((s) => s.activeOrgId);
  // Se recarga cuando cambian miembros o minas, para mostrar los eventos recién creados.
  const members = useWorkspace((s) => s.members);
  const mines = useWorkspace((s) => s.mines);
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
  }, [orgId, members, mines]);

  const describe = (e: AuditEvent): string => {
    const name = typeof e.data.name === 'string' ? e.data.name : null;
    const email = typeof e.data.email === 'string' ? e.data.email : null;
    const to = typeof e.data.to === 'string' ? e.data.to : null;
    const detail = [name, email, to && ROLES.includes(to as Role) ? t(roleKey(to as Role)) : null]
      .filter(Boolean)
      .join(' · ');
    const key = AUDIT_KEYS[e.action];
    const label = key ? t(key) : e.action;
    return detail ? `${label}: ${detail}` : label;
  };

  return (
    <section className="page-section">
      <h2>{t('admin.audit')}</h2>
      <p className="muted">{t('admin.auditHint')}</p>
      {error && <p className="auth-error">{t(error)}</p>}
      {events?.length === 0 && <p className="muted">{t('admin.auditEmpty')}</p>}
      {events && events.length > 0 && (
        <table className="grid-table page-table">
          <thead>
            <tr>
              <th>{t('admin.when')}</th>
              <th>{t('admin.who')}</th>
              <th>{t('admin.what')}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{fmtDate(e.at)}</td>
                <td>{e.actorName ?? '—'}</td>
                <td>{describe(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
