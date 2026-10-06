import {
  ROOM_MESSAGE_MAX,
  roomClientMessageSchema,
  type RoomPeer,
  type RoomServerMessage,
  type RoomState,
} from '@cronos/api';
import { uuidv7 } from '@cronos/core';
import type { WebSocket } from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Auth } from '../auth/auth';
import type { Db } from '../db/db';
import { sendError } from '../http/errors';
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
  nextColor: number;
}

type Req = FastifyRequest<{
  Params: { projectId?: string; version?: string };
  Querystring: { role?: string };
}>;

/**
 * Salas de presentación en VR (D-19): relé WebSocket sin cálculo. Exige sesión y acceso al
 * proyecto (los visores son de la empresa). Solo el presentador cambia el estado compartido.
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
    '/rooms/:projectId/:version/ws',
    {
      websocket: true,
      preValidation: async (req: Req, reply) => {
        const user = await requireUser(deps.auth, deps.db, req, reply);
        if (!user) return reply;
        const version = Number(req.params.version);
        if (!Number.isInteger(version) || version < 1)
          return sendError(reply, 400, 'invalid_version', 'Version must be a positive integer');
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
      const key = `${req.params.projectId ?? ''}/${req.params.version ?? ''}`;
      let room = rooms.get(key);
      if (!room) {
        room = { peers: new Map(), presenter: null, state: null, nextColor: 0 };
        rooms.set(key, room);
      }
      const r = room;
      const peer: Peer = { id: uuidv7(), name: user.name, color: r.nextColor++, socket };
      const others = [...r.peers.values()].map(({ id, name, color }) => ({ id, name, color }));
      r.peers.set(peer.id, peer);
      if (req.query.role === 'presenter') {
        r.presenter = peer.id;
        broadcast(r, { type: 'presenter', id: peer.id }, peer.id);
      }
      send(peer, {
        type: 'welcome',
        you: peer.id,
        presenter: r.presenter,
        peers: others,
        state: r.state,
      });
      broadcast(
        r,
        { type: 'join', peer: { id: peer.id, name: peer.name, color: peer.color } },
        peer.id,
      );

      socket.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary || data.length > ROOM_MESSAGE_MAX) return;
        let raw: unknown;
        try {
          raw = JSON.parse(data.toString('utf8'));
        } catch {
          return;
        }
        const parsed = roomClientMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const m = parsed.data;
        if (m.type === 'pose') broadcast(r, { type: 'pose', id: peer.id, pose: m.pose }, peer.id);
        else if (r.presenter === peer.id) {
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
}
