import { ApiError } from '@cronos/api';
import type { DiffSummary } from '@cronos/core';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import * as actions from '../actions';
import { useT } from '../i18n';
import { APP_VERSION, getCompute, session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { api } from './api';
import { useProjectSession } from './projectSession';
import { summaryParts } from './summaryText';
import { uploadMissingAssets } from './topographyAssets';

type Phase = 'diff' | 'ready' | 'publishing' | 'conflict';

/**
 * Guardar versión (D-14): muestra qué cambió desde la versión base (calculado en el worker), pide
 * un mensaje y publica. Si otra persona publicó antes (409), ofrece no perder los cambios.
 */
export function PublishDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const current = useProjectSession((s) => s.current);
  const baseProject = useProjectSession((s) => s.baseProject);
  const published = useProjectSession((s) => s.published);
  const reload = useProjectSession((s) => s.reload);
  const [phase, setPhase] = useState<Phase>('diff');
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baseProject) return;
    let alive = true;
    void getCompute()
      .api.diffProjects(baseProject, session.document.project)
      .then((d) => {
        if (!alive) return;
        setSummary(d.summary);
        setPhase('ready');
      });
    return () => {
      alive = false;
    };
  }, [baseProject]);

  if (!current) return null;
  const project = session.document.project;

  const publish = async () => {
    setPhase('publishing');
    setError(null);
    try {
      await uploadMissingAssets(current.mine.id, project);
      const text = await getCompute().api.serializeProject(project, { appVersion: APP_VERSION });
      const version = await api.publishVersionFromText(
        current.projectId,
        current.base.id,
        message.trim(),
        text,
      );
      published(version, project);
      useUiStore.getState().notify(t('history.published', { n: version.number }));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'version_conflict') {
        setPhase('conflict');
        return;
      }
      setError(t(workspaceErrorKey(err)));
      setPhase('ready');
    }
  };

  const saveAsNew = async () => {
    setError(null);
    try {
      const copy = { ...project, name: t('history.copyName', { name: project.name }) };
      await uploadMissingAssets(current.mine.id, copy);
      const text = await getCompute().api.serializeProject(copy, { appVersion: APP_VERSION });
      const created = await api.createProjectFromText(
        current.mine.id,
        text,
        t('history.copyMessage', { name: project.name, n: current.base.number }),
      );
      onClose();
      void navigate(`/projects/${created.id}`);
    } catch (err) {
      setError(t(workspaceErrorKey(err)));
    }
  };

  const parts = summary ? summaryParts(summary, t) : [];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal dialog-narrow"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{phase === 'conflict' ? t('history.conflictTitle') : t('history.publishTitle')}</h2>
          <button className="icon" onClick={onClose} aria-label={t('settings.close')}>
            <X size={16} />
          </button>
        </header>

        {phase === 'conflict' ? (
          <div className="dialog-body">
            <p>{t('history.conflict')}</p>
            <div className="stack">
              <button className="primary-inline" onClick={() => void saveAsNew()}>
                {t('history.saveAsNew')}
              </button>
              <button onClick={() => void actions.saveProject()}>
                {t('history.downloadMine')}
              </button>
              <button
                className="danger"
                onClick={() => {
                  onClose();
                  void reload();
                }}
              >
                {t('history.discardAndReload')}
              </button>
            </div>
          </div>
        ) : (
          <form
            className="auth-form dialog-body"
            onSubmit={(e) => {
              e.preventDefault();
              void publish();
            }}
          >
            <p className="muted">{t('history.publishHint')}</p>
            <div>
              <strong>{t('history.changesSince', { n: current.base.number })}</strong>
              {phase === 'diff' ? (
                <p className="muted">{t('history.computing')}</p>
              ) : (
                <ul className="change-list">
                  {parts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
            <label>
              <span>{t('history.message')}</span>
              <textarea
                name="version-message"
                required
                maxLength={500}
                rows={3}
                placeholder={t('history.messagePlaceholder')}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                }}
              />
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary"
              type="submit"
              disabled={phase !== 'ready' || message.trim() === ''}
            >
              {phase === 'publishing' ? t('history.publishing') : t('history.publish')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
