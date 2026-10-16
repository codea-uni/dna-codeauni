import {
  ROOM_DESIGN_MAX,
  ROOM_MESSAGE_MAX,
  roomClientMessageSchema,
  type RoomPeer,
  type RoomServerMessage,
  type RoomState,
} from '@cronos/api';
import { uuidv7 } from '@cronos/core';
import type { WebSocket } from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { requireUser, type SessionUser } from '../http/session';
import { visibleProject } from './projects';

interface RoomRouteDeps {
  db: Db;
  auth: Auth;
}

interface Peer extends RoomPeer {
  socket: WebSocket;
}

interface Room {
  peers: Map<string, Peer>;
  presenter: string | null;
  /** Último estado del presentador: quien entra tarde se sincroniza con él. */
  state: RoomState | null;
  /** Última foto del diseño en vivo: quien entra tarde parte del mismo proyecto. */
  design: { seq: number; snapshot: string; from: string } | null;
  nextColor: number;
}

const meGotoSchema = z.object({
  type: z.literal('goto'),
  projectId: z.string().min(1).max(64),
  from: z.string().max(40),
});

type Req = FastifyRequest<{ Params: { projectId?: string } }>;

/**
 * Salas de VR (D-19): una por proyecto, relé WebSocket sin cálculo. Exige sesión y acceso al
 * proyecto (los visores son de la empresa). Todos entran como espectadores; quien pide presentar
 * pasa a ser el presentador y solo él cambia el estado compartido.
 */
export function roomRoutes(app: FastifyInstance, deps: RoomRouteDeps): void {
  // ponytail: salas en memoria de un solo proceso; con varias instancias, Redis pub/sub.
  const rooms = new Map<string, Room>();
  const users = new WeakMap<FastifyRequest, SessionUser>();

  const send = (peer: Peer, message: RoomServerMessage) => {
    if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(JSON.stringify(message));
  };
  const broadcast = (room: Room, message: RoomServerMessage, except?: string) => {
    for (const peer of room.peers.values()) if (peer.id !== except) send(peer, message);
  };

  app.get(
    '/rooms/:projectId/ws',
    {
      websocket: true,
      preValidation: async (req: Req, reply) => {
        const user = await requireUser(deps.auth, deps.db, req, reply);
        if (!user) return reply;
        if (!(await visibleProject(deps.db, req.params.projectId ?? '', user.id, reply)))
          return reply;
        users.set(req, user);
      },
    },
    (socket: WebSocket, req: Req) => {
      const user = users.get(req);
      if (!user) {
        socket.close(1008);
        return;
      }
      const key = req.params.projectId ?? '';
      let room = rooms.get(key);
      if (!room) {
        room = { peers: new Map(), presenter: null, state: null, design: null, nextColor: 0 };
        rooms.set(key, room);
      }
      const r = room;
      const peer: Peer = { id: uuidv7(), name: user.name, color: r.nextColor++, socket };
      const others = [...r.peers.values()].map(({ id, name, color }) => ({ id, name, color }));
      r.peers.set(peer.id, peer);
      send(peer, {
        type: 'welcome',
        you: peer.id,
        presenter: r.presenter,
        peers: others,
        state: r.state,
      });
      if (r.design) send(peer, { type: 'design', ...r.design });
      broadcast(
        r,
        { type: 'join', peer: { id: peer.id, name: peer.name, color: peer.color } },
        peer.id,
      );

      socket.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary || data.length > ROOM_DESIGN_MAX) return;
        let raw: unknown;
        try {
          raw = JSON.parse(data.toString('utf8'));
        } catch {
          return;
        }
        const parsed = roomClientMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const m = parsed.data;
        const big = m.type === 'design' || m.type === 'ops';
        if (!big && data.length > ROOM_MESSAGE_MAX) return;
        if (m.type === 'design') {
          r.design = { seq: m.seq, snapshot: m.snapshot, from: peer.id };
          broadcast(r, { type: 'design', ...r.design }, peer.id);
        } else if (m.type === 'ops')
          broadcast(
            r,
            { type: 'ops', from: peer.id, seq: m.seq, ops: m.ops, label: m.label },
            peer.id,
          );
        else if (m.type === 'feed')
          broadcast(r, { type: 'feed', from: peer.id, item: m.item }, peer.id);
        else if (m.type === 'pose')
          broadcast(r, { type: 'pose', id: peer.id, pose: m.pose }, peer.id);
        else if (m.type === 'claim') {
          r.presenter = peer.id;
          broadcast(r, { type: 'presenter', id: peer.id });
        } else if (m.type === 'release') {
          if (r.presenter !== peer.id) return;
          r.presenter = null;
          broadcast(r, { type: 'presenter', id: null });
        } else if (r.presenter === peer.id) {
          r.state = m.state;
          broadcast(r, { type: 'state', state: m.state }, peer.id);
        }
      });
      socket.on('close', () => {
        r.peers.delete(peer.id);
        broadcast(r, { type: 'leave', id: peer.id });
        if (r.presenter === peer.id) {
          r.presenter = null;
          broadcast(r, { type: 'presenter', id: null });
        }
        if (r.peers.size === 0) rooms.delete(key);
      });
    },
  );

  // Canal por usuario (misma cuenta en la PC y el visor): al abrir un proyecto en un dispositivo,
  // los demás lo siguen y quedan en la misma sala. Relé entre sus sockets; recuerda el último
  // proyecto abierto para quien se conecta después (antes cada uno lo re-anunciaba al reconectar
  // y un dispositivo rezagado arrastraba a los demás de vuelta a su proyecto).
  const devices = new Map<string, Set<WebSocket>>();
  const lastGoto = new Map<string, string>();
  const meUsers = new WeakMap<FastifyRequest, SessionUser>();
  const countDevices = (set: Set<WebSocket>) => {
    for (const s of set)
      if (s.readyState === s.OPEN) s.send(JSON.stringify({ type: 'devices', count: set.size - 1 }));
  };
  app.get(
    '/me/ws',
    {
      websocket: true,
      preValidation: async (req: FastifyRequest, reply) => {
        const user = await requireUser(deps.auth, deps.db, req, reply);
        if (!user) return reply;
        meUsers.set(req, user);
      },
    },
    (socket: WebSocket, req: FastifyRequest) => {
      const user = meUsers.get(req);
      if (!user) {
        socket.close(1008);
        return;
      }
      let set = devices.get(user.id);
      if (!set) {
        set = new Set();
        devices.set(user.id, set);
      }
      const mine = set;
      mine.add(socket);
      countDevices(mine);
      const last = lastGoto.get(user.id);
      if (last) socket.send(last);
      socket.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary || data.length > 512) return;
        let raw: unknown;
        try {
          raw = JSON.parse(data.toString('utf8'));
        } catch {
          return;
        }
        const parsed = meGotoSchema.safeParse(raw);
        if (!parsed.success) return;
        const text = JSON.stringify(parsed.data);
        lastGoto.set(user.id, text);
        for (const s of mine) if (s !== socket && s.readyState === s.OPEN) s.send(text);
      });
      socket.on('close', () => {
        mine.delete(socket);
        if (mine.size === 0) {
          devices.delete(user.id);
          lastGoto.delete(user.id);
        }
        else countDevices(mine);
      });
    },
  );
}
