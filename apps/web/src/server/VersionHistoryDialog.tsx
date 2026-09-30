import { permissions, type ProjectVersion } from '@cronos/api';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFormatDate, useT, type MessageKey } from '../i18n';
import { useUiStore } from '../stores/uiStore';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { api } from './api';
import { hasUnpublished, useProjectSession } from './projectSession';
import { summaryParts } from './summaryText';

/** Historial del proyecto: todas sus versiones, para consultarlas o restaurar una (NF-08). */
export function VersionHistoryDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const fmtDate = useFormatDate();
  const navigate = useNavigate();
  const current = useProjectSession((s) => s.current);
  const reload = useProjectSession((s) => s.reload);
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const projectId = current?.projectId;

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    api.versions(projectId).then(
      (v) => {
        if (alive) setVersions(v);
      },
      (err: unknown) => {
        if (alive) setError(workspaceErrorKey(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (!current) return null;
  const latest = versions?.[0];
  const canRestore = permissions.editDesign(current.role);

  const restore = async (v: ProjectVersion) => {
    if (!latest) return;
    if (!window.confirm(t('history.restoreConfirm', { next: latest.number + 1, n: v.number })))
      return;
    if (hasUnpublished() && !window.confirm(t('history.unpublishedConfirm'))) return;
    setBusy(true);
    try {
      const created = await api.restoreVersion(current.projectId, v.number, {
        parentVersionId: latest.id,
        message: t('history.restoreMessage', { n: v.number }),
      });
      useUiStore.getState().notify(t('history.restored', { n: created.number, from: v.number }));
      onClose();
      if (current.viewingOld) void navigate(`/projects/${current.projectId}`);
      else void reload();
    } catch (err) {
      setError(workspaceErrorKey(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{t('history.title')}</h2>
          <button className="icon" onClick={onClose} aria-label={t('settings.close')}>
            <X size={16} />
          </button>
        </header>
        <p className="muted">{t('history.titleHint')}</p>
        {error && (
          <p className="auth-error" role="alert">
            {t(error)}
          </p>
        )}
        {!versions && !error && <p className="muted">{t('workspace.loading')}</p>}
        {versions && (
          <table className="grid-table page-table">
            <thead>
              <tr>
                <th>{t('history.version')}</th>
                <th>{t('history.date')}</th>
                <th>{t('history.author')}</th>
                <th>{t('history.changes')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => {
                const isOpen = v.number === current.base.number;
                return (
                  <tr key={v.id} className={isOpen ? 'current' : undefined}>
                    <td>
                      <span className="badge">v{v.number}</span>{' '}
                      {v.number === latest?.number && (
                        <span className="muted">{t('history.current')}</span>
                      )}
                    </td>
                    <td>{fmtDate(v.createdAt)}</td>
                    <td>{v.authorName}</td>
                    <td>
                      <div>{v.message || (v.number === 1 ? t('history.initial') : '')}</div>
                      <div className="muted">
                        {v.summary ? summaryParts(v.summary, t).join(' · ') : t('history.initial')}
                      </div>
                    </td>
                    <td className="actions">
                      <button
                        disabled={isOpen}
                        onClick={() => {
                          onClose();
                          void navigate(
                            v.number === latest?.number
                              ? `/projects/${current.projectId}`
                              : `/projects/${current.projectId}/versions/${v.number}`,
                          );
                        }}
                      >
                        {t('history.view')}
                      </button>
                      {canRestore && v.number !== latest?.number && (
                        <button disabled={busy} onClick={() => void restore(v)}>
                          {t('history.restore')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
