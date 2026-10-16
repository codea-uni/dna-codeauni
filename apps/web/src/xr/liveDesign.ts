import type { RoomClientMessage, RoomFeed, RoomServerMessage } from '@cronos/api';
import { parseProjectFile, serializeProject, type Op } from '@cronos/core';
import type { Engine } from '@cronos/engine';
import { create } from 'zustand';
import { useAiStore } from '../ai/agent';
import { pushCard, useCardStore, type AgentCard } from '../ai/cards';
import { useProjectSession } from '../server/projectSession';
import { APP_VERSION, session } from '../session';

/**
 * Diseño en vivo por la sala del proyecto: quien diseña (por ejemplo, hablando en el visor) y quien
 * mira (otra persona en la web) ven lo mismo, con el mismo pintado en vivo, las tarjetas de reporte
 * y los subtítulos de la conversación.
 *
 * Cada cambio local viaja como sus operaciones (`ops`, numeradas con `seq`); quien las recibe las
 * aplica si le toca justo esa (si no, espera). Medio segundo después viaja también la foto del
 * proyecto (`design`): corrige cualquier desfase y la sala la guarda para quien entra tarde.
 */

const SNAPSHOT_DELAY_MS = 600;
/** Sin noticias de quien diseña durante este tiempo, se apaga el «En vivo» [ms]. */
export const LIVE_IDLE_MS = 45_000;
/** Subtítulos que se muestran (los últimos) y cuánto duran [ms]. */
const MAX_CAPTIONS = 2;
export const CAPTION_MS = 9000;

export interface Caption {
  role: 'user' | 'assistant';
  text: string;
  at: number;
  from: string;
}

interface LiveFeedState {
  /** Quién está diseñando en vivo (nombre) y cuándo llegó lo último. */
  from: string | null;
  lastAt: number;
  captions: Caption[];
  /** Seguir la secuencia de quien presenta también desde la web. */
  follow: boolean;
}

export const useLiveFeed = create<LiveFeedState>(() => ({
  from: null,
  lastAt: 0,
  captions: [],
  follow: true,
}));

/** ¿Hay alguien diseñando en vivo ahora? */
export function liveActive(): boolean {
  const s = useLiveFeed.getState();
  return s.from !== null && performance.now() - s.lastAt < LIVE_IDLE_MS;
}

async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gunzipBase64(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export interface LiveDesign {
  onMessage: (m: RoomServerMessage, name: (id: string) => string) => void;
  dispose: () => void;
}

export function createLiveDesign(engine: Engine, send: (m: RoomClientMessage) => void): LiveDesign {
  const doc = session.document;
  let seq = 0;
  /** Aplicando algo que llegó de la sala: no se reenvía. */
  let remote = false;
  let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Cambios propios que no se transmitieron (mientras otra persona diseña en vivo, quien mira no
   * transmite: sus cambios automáticos, como apoyar taladros nuevos en el terreno, llevan datos
   * viejos y pisarían los de quien diseña). La próxima foto los corrige.
   */
  let localDrift = false;
  /** Tarjetas que llegaron de la sala (no se reenvían). */
  const remoteCards = new WeakSet<AgentCard>();
  /** Versión publicada que llegó de la sala (no se reenvía). */
  let remotePublished: string | null = null;

  const sendSnapshot = () => {
    const at = seq;
    void gzipBase64(serializeProject(doc.project, { appVersion: APP_VERSION }))
      .then((snapshot) => {
        send({ type: 'design', seq: at, snapshot });
      })
      .catch(() => undefined);
  };

  const feed = (item: RoomFeed) => {
    send({ type: 'feed', item });
  };

  const offs = [
    doc.onApplied((ops, label) => {
      if (remote) return;
      if (liveActive()) {
        localDrift = true;
        return;
      }
      seq++;
      send({ type: 'ops', seq, ops: [...ops], label: label.slice(0, 200) });
      clearTimeout(snapshotTimer);
      snapshotTimer = setTimeout(sendSnapshot, SNAPSHOT_DELAY_MS);
    }),
    useCardStore.subscribe((s, prev) => {
      const top = s.cards[0];
      if (!top || top === prev.cards[0] || remoteCards.has(top)) return;
      feed({ kind: 'card', card: { ...top } as unknown as Record<string, unknown> });
    }),
    // Publicar aquí (a mano o por el asistente): los demás pasan a esa versión como base.
    useProjectSession.subscribe((s, prev) => {
      const base = s.current?.base;
      if (!base || base.id === prev.current?.base.id) return;
      if (s.current?.projectId !== prev.current?.projectId) return;
      if (base.id === remotePublished) return;
      feed({ kind: 'published', version: { ...base } as unknown as Record<string, unknown> });
    }),
    useAiStore.subscribe((s, prev) => {
      if (s.entries.length <= prev.entries.length) return;
      for (const e of s.entries.slice(prev.entries.length))
        if (e.kind === 'user' || e.kind === 'assistant')
          feed({
            kind: 'caption',
            role: e.kind,
            text: e.text.replace(/^🎙\s*/u, '').slice(0, 2000),
          });
    }),
  ];

  const touch = (from: string) => {
    useLiveFeed.setState({ from, lastAt: performance.now() });
  };

  const onMessage = (m: RoomServerMessage, name: (id: string) => string) => {
    switch (m.type) {
      case 'ops': {
        touch(name(m.from));
        // Desfasado (o con cambios propios): la foto que viene detrás lo corrige.
        if (m.seq !== seq + 1 || localDrift) {
          seq = Math.max(seq, m.seq);
          localDrift = true;
          return;
        }
        remote = true;
        // Se pinta en vivo igual que en la pantalla de quien diseña.
        engine.beginBuild();
        try {
          if (doc.dispatch(m.ops as Op[], m.label)) seq = m.seq;
        } catch {
          // no aplica sobre este proyecto: la foto lo corrige
        } finally {
          engine.endBuild();
          remote = false;
        }
        break;
      }
      case 'design': {
        // Una foto anterior a lo que ya tenemos (p. ej. la que guarda la sala y llega al
        // reconectar) no se carga: borraría lo hecho mientras tanto. Se reenvía la propia.
        if (m.seq < seq) {
          clearTimeout(snapshotTimer);
          snapshotTimer = setTimeout(sendSnapshot, SNAPSHOT_DELAY_MS);
          return;
        }
        touch(name(m.from));
        // Ya estamos en ese estado (salvo que algo propio lo haya movido).
        if (m.seq === seq && seq > 0 && !localDrift) return;
        const at = m.seq;
        void gunzipBase64(m.snapshot)
          .then((text) => {
            const parsed = parseProjectFile(text);
            if (!parsed.ok) return;
            remote = true;
            try {
              doc.load(parsed.file.project);
              seq = at;
              localDrift = false;
            } finally {
              remote = false;
            }
          })
          .catch(() => undefined);
        break;
      }
      case 'feed': {
        // Las tarjetas y subtítulos no cuentan como «diseñando» (solo los cambios del diseño).
        const item = m.item;
        if (item.kind === 'published') {
          const version = item.version as unknown as NonNullable<
            ReturnType<typeof useProjectSession.getState>['current']
          >['base'];
          const ps = useProjectSession.getState();
          if (version.projectId === ps.current?.projectId) {
            remotePublished = version.id;
            ps.published(version, doc.project);
          }
        } else if (item.kind === 'card') {
          const card = { ...(item.card as unknown as AgentCard), t0: performance.now() };
          remoteCards.add(card);
          pushCard(card);
        } else {
          const captions = [
            ...useLiveFeed.getState().captions,
            { role: item.role, text: item.text, at: performance.now(), from: name(m.from) },
          ].slice(-MAX_CAPTIONS);
          useLiveFeed.setState({ captions });
        }
        break;
      }
      default:
        break;
    }
  };

  return {
    onMessage,
    dispose: () => {
      clearTimeout(snapshotTimer);
      for (const off of offs) off();
      useLiveFeed.setState({ from: null, captions: [] });
    },
  };
}
