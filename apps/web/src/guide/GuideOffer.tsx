import { Compass, X } from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '../i18n';
import { askGuide } from './ask';
import { startTour } from './tours';
import { useGuideStore } from './store';
import { dismissOffer, useOfferStore } from './watch';

/**
 * Oferta corta de la guía junto a la barra de estado: «¿Te explico este error?», «Esto está
 * bloqueado porque…», «Parece que buscas algo». Nunca tapa nada y se va sola.
 */
export function GuideOffer() {
  const t = useT();
  const offer = useOfferStore((s) => s.offer);

  useEffect(() => {
    if (!offer) return;
    const id = setTimeout(dismissOffer, offer.kind === 'error' ? 12_000 : 9_000);
    return () => {
      clearTimeout(id);
    };
  }, [offer]);

  if (!offer) return null;
  let text: string;
  let action: { label: string; run: () => void } | null = null;
  if (offer.kind === 'error') {
    text = t('guide.error.offer');
    action = {
      label: t('guide.error.yes'),
      run: () => {
        useGuideStore.getState().setWelcome(true);
        void askGuide(t('guide.error.ask', { text: offer.text }));
      },
    };
  } else if (offer.kind === 'blocked') {
    text = t('guide.blocked', { name: offer.name, why: offer.why });
    const tour = offer.tour;
    if (tour)
      action = {
        label: t('guide.blocked.go'),
        run: () => {
          startTour(tour);
        },
      };
  } else {
    text = t('guide.stuck');
    action = {
      label: t('guide.stuck.yes'),
      run: () => {
        useGuideStore.getState().setWelcome(true);
      },
    };
  }
  return (
    <div className="guide-offer" role="status" data-guide-ui>
      <Compass size={16} aria-hidden style={{ color: 'var(--amber)', flex: 'none' }} />
      <p>{text}</p>
      {action && (
        <button
          type="button"
          className="primary"
          onClick={() => {
            dismissOffer();
            action.run();
          }}
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        className="guide-x"
        onClick={dismissOffer}
        aria-label={offer.kind === 'stuck' ? t('guide.stuck.no') : t('guide.close')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
