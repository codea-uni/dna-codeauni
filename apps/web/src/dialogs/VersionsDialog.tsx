import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as actions from '../actions';
import { useT } from '../i18n';
import { listVersions } from '../persistence/autosave';
import type { VersionInfo } from '../persistence/history';

/** Historial del autoguardado (H-102): restaurar cualquiera de las últimas versiones. */
export function VersionsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    listVersions().then(setVersions, () => {
      setError(true);
    });
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('versions.title')}
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header>
          <h2>{t('versions.title')}</h2>
          <button className="icon" onClick={onClose} aria-label={t('settings.close')}>
            <X size={16} />
          </button>
        </header>
        <p className="hint">{t('versions.hint')}</p>
        {error && <p className="muted">{t('versions.unavailable')}</p>}
        {versions?.length === 0 && <p className="muted">{t('versions.empty')}</p>}
        {versions && versions.length > 0 && (
          <table className="kv">
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>{new Date(v.savedAt).toLocaleString()}</td>
                  <td>{v.name}</td>
                  <td>{t('versions.holes', { n: v.holes })}</td>
                  <td>
                    <button
                      onClick={() => {
                        void actions.restoreVersion(v.id, true).then(onClose);
                      }}
                    >
                      {t('versions.restore')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
