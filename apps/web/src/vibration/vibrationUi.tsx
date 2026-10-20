import {
  rockDamageClass,
  type MonitoringPointKind,
  type ReceiverResult,
  type SeismographRecord,
} from '@cronos/core';
import { t as translate, useFormat, useT, type MessageKey } from '../i18n';

const KIND_KEYS: Record<MonitoringPointKind, MessageKey> = {
  'surface-structure': 'mv.kind.surface-structure',
  community: 'mv.kind.community',
  slope: 'mv.kind.slope',
  'underground-working': 'mv.kind.underground-working',
  other: 'mv.kind.other',
};

/** Texto del tipo de punto (sin tipo = «Superficie»). */
export function kindLabelKey(kind: MonitoringPointKind | undefined): MessageKey {
  return kind ? KIND_KEYS[kind] : 'mv.kind.none';
}

export function contextKey(context: SeismographRecord['context']): MessageKey {
  return context === 'underground' ? 'mv.context.underground' : 'mv.context.surface';
}

/** Semáforo: verde ≤ 80 % del límite, ámbar hasta el límite, rojo si lo excede; gris sin límite. */
export function semaphoreOf(rec: ReceiverResult | undefined): 'ok' | 'near' | 'over' | 'none' {
  if (!rec?.limit) return 'none';
  if (rec.ppv > rec.limit.ppvMax) return 'over';
  return rec.ppv > 0.8 * rec.limit.ppvMax ? 'near' : 'ok';
}

const COLORS = { ok: '#3fb950', near: '#d29922', over: '#f85149', none: '#6e7681' } as const;
const SEM_KEYS = {
  ok: 'mv.sem.ok',
  near: 'mv.sem.near',
  over: 'mv.sem.over',
  none: 'mv.sem.none',
} as const satisfies Record<string, MessageKey>;
const DAMAGE_KEYS = {
  none: 'mv.damage.none',
  'minor-slabbing': 'mv.damage.minor',
  'strong-cracking': 'mv.damage.strong',
  breakup: 'mv.damage.breakup',
} as const satisfies Record<string, MessageKey>;

/** Punto de color con el estado; en labores y taludes, el daño esperable en roca en el título. */
export function Semaphore({ rec }: { rec: ReceiverResult | undefined }) {
  const t = useT();
  const s = semaphoreOf(rec);
  const rock = rec && (rec.kind === 'slope' || rec.kind === 'underground-working');
  const title = [t(SEM_KEYS[s]), rock ? t(DAMAGE_KEYS[rockDamageClass(rec.ppv)]) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: COLORS[s],
      }}
    />
  );
}

/**
 * Avisos de cruce: voladura subterránea que excede el límite en un punto de superficie (talud,
 * comunidad, estructura) o voladura superficial que excede en una labor.
 */
export function crossingWarnings(
  receivers: readonly ReceiverResult[],
  underground: boolean,
  fmt: (v: number, d?: number) => string,
): string[] {
  const out: string[] = [];
  for (const r of receivers) {
    if (!r.exceeds || !r.limit) continue;
    const args = {
      name: r.name,
      kind: translate(kindLabelKey(r.kind)).toLowerCase(),
      ppv: fmt(r.ppv * 1000, 1),
      limit: fmt(r.limit.ppvMax * 1000, 0),
      kg: fmt(r.admissibleCharge ?? 0, 1),
    };
    if (r.crossing)
      out.push(translate(underground ? 'mv.warn.ugToSurface' : 'mv.warn.surfaceToUg', args));
    else out.push(translate('mv.warn.exceeds', args));
  }
  return out;
}

/** Lista de avisos (usa el formato del idioma). */
export function CrossingWarnings({
  receivers,
  underground,
}: {
  receivers: readonly ReceiverResult[];
  underground: boolean;
}) {
  const fmt = useFormat();
  const list = crossingWarnings(receivers, underground, fmt);
  if (list.length === 0) return null;
  return (
    <>
      {list.map((w) => (
        <p key={w} className="warn">
          {w}
        </p>
      ))}
    </>
  );
}
