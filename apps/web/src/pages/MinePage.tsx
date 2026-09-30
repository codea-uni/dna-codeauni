import type { MineDetail } from '@cronos/api';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useT, type MessageKey } from '../i18n';
import { api } from '../server/api';
import { workspaceErrorKey } from '../stores/workspaceStore';
import { PageShell } from './PageShell';
import { roleKey } from './roles';

/** Una mina: datos, rol de quien la mira y entrada al editor. */
export function MinePage() {
  const t = useT();
  const navigate = useNavigate();
  const { mineId = '' } = useParams();
  // El resultado guarda su mina: al cambiar de mina, lo anterior deja de mostrarse sin reiniciar
  // el estado dentro del efecto.
  const [loaded, setLoaded] = useState<{
    mineId: string;
    detail?: MineDetail;
    error?: MessageKey;
  } | null>(null);
  const current = loaded?.mineId === mineId ? loaded : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    let alive = true;
    api.mine(mineId).then(
      (d) => {
        if (alive) setLoaded({ mineId, detail: d });
      },
      (err: unknown) => {
        if (alive) setLoaded({ mineId, error: workspaceErrorKey(err) });
      },
    );
    return () => {
      alive = false;
    };
  }, [mineId]);

  return (
    <PageShell>
      <Link to="/" className="back-link">
        <ArrowLeft size={14} aria-hidden /> {t('workspace.backToMines')}
      </Link>
      {error && (
        <p className="auth-error" role="alert">
          {t(error)}
        </p>
      )}
      {!detail && !error && <p className="muted">{t('workspace.loading')}</p>}
      {detail && (
        <>
          <h1>{detail.mine.name}</h1>
          <p className="muted">
            {detail.mine.epsg
              ? t('workspace.epsg', { code: detail.mine.epsg })
              : t('workspace.noEpsg')}{' '}
            · {t('workspace.yourRole', { role: t(roleKey(detail.role)) })}
          </p>
          <button
            className="primary"
            onClick={() => {
              void navigate('/editor');
            }}
          >
            {t('workspace.openEditor')}
          </button>
        </>
      )}
    </PageShell>
  );
}
