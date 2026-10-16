import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { CAPTION_MS, LIVE_IDLE_MS, useLiveFeed } from './liveDesign';

/**
 * Quien mira desde la web mientras otra persona diseña en vivo (por ejemplo, hablando en el visor):
 * un distintivo «En vivo» con su nombre y subtítulos de la conversación con el agente.
 */
export function LiveFeedView() {
  const t = useT();
  const from = useLiveFeed((s) => s.from);
  const captions = useLiveFeed((s) => s.captions);
  const follow = useLiveFeed((s) => s.follow);
  const lastAt = useLiveFeed((s) => s.lastAt);
  const [now, setNow] = useState(0);

  // Reloj para apagar subtítulos viejos y el distintivo sin actividad.
  useEffect(() => {
    if (!from) return;
    const update = () => {
      setNow(performance.now());
    };
    const first = setTimeout(update, 0);
    const id = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [from, lastAt, captions]);

  if (!from || now - lastAt > LIVE_IDLE_MS) return null;
  const shown = captions.filter((c) => now - c.at < CAPTION_MS);
  return (
    <>
      <div className="live-badge" role="status">
        <span className="live-badge-dot" />
        <strong>{t('xr.liveFeed.badge')}</strong>
        <span>{from}</span>
        <button
          type="button"
          className={follow ? 'on' : ''}
          onClick={() => {
            useLiveFeed.setState({ follow: !follow });
          }}
        >
          {t(follow ? 'xr.liveFeed.following' : 'xr.liveFeed.follow')}
        </button>
      </div>
      {shown.length > 0 && (
        <div className="live-captions" aria-live="polite">
          {shown.map((c) => (
            <p key={c.at} className={c.role}>
              <b>{c.role === 'user' ? c.from : t('xr.liveFeed.agent')}</b>
              {c.text}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
