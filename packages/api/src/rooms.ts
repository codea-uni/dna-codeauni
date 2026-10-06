import { z } from 'zod';

/**
 * Sala de realidad virtual (D-19): una por proyecto; todos entran como espectadores y cualquiera
 * puede pedir presentar («claim»). Cada visor calcula todo con `@cronos/core` a partir del
 * proyecto abierto; por la sala solo viajan poses y el estado del presentador (mensajes chicos).
 *
 *   GET /api/rooms/:projectId/ws  (WebSocket, sesión y acceso al proyecto)
 */

/** Tamaño máximo de un mensaje del cliente [bytes]: lo demás se descarta. */
export const ROOM_MESSAGE_MAX = 4096;
/** Frecuencia con que cada visor envía su pose [Hz] (supuesto editable, QUESTIONS §2). */
export const ROOM_POSE_HZ = 15;

const num = z.number();
const vec3 = z.tuple([num, num, num]);
const quat = z.tuple([num, num, num, num]);

/** Pose en coordenadas de proyecto (UTM, Z arriba); `q` = orientación respecto del modelo. */
export const roomTransformSchema = z.object({ p: vec3, q: quat });
export type RoomTransform = z.infer<typeof roomTransformSchema>;

export const roomPoseSchema = z.object({
  head: roomTransformSchema,
  hands: z.array(roomTransformSchema).max(2),
  /** Escala con que esa persona ve el modelo (1 = dentro de la voladura; < 1 = maqueta). */
  scale: z.number().positive(),
});
export type RoomPose = z.infer<typeof roomPoseSchema>;

/** Lo que el presentador manda y los espectadores siguen. */
export const roomStateSchema = z.object({
  sequence: z.object({ playing: z.boolean(), t: num.nullable(), speed: num }),
  layers: z.object({
    energy: z.boolean(),
    vibration: z.boolean(),
    labels: z.boolean(),
    pile: z.boolean(),
  }),
  /** Taladro apuntado por el presentador. */
  hole: z.string().max(64).nullable(),
});
export type RoomState = z.infer<typeof roomStateSchema>;

export const roomPeerSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Índice de color del avatar. */
  color: z.number().int().nonnegative(),
});
export type RoomPeer = z.infer<typeof roomPeerSchema>;

export const roomClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pose'), pose: roomPoseSchema }),
  z.object({ type: z.literal('state'), state: roomStateSchema }),
  /** Pasar a ser el presentador (le quita el rol a quien lo tenía). */
  z.object({ type: z.literal('claim') }),
  /** Dejar de presentar. */
  z.object({ type: z.literal('release') }),
]);
export type RoomClientMessage = z.infer<typeof roomClientMessageSchema>;

export const roomServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    you: z.string(),
    presenter: z.string().nullable(),
    peers: z.array(roomPeerSchema),
    state: roomStateSchema.nullable(),
  }),
  z.object({ type: z.literal('join'), peer: roomPeerSchema }),
  z.object({ type: z.literal('leave'), id: z.string() }),
  z.object({ type: z.literal('presenter'), id: z.string().nullable() }),
  z.object({ type: z.literal('pose'), id: z.string(), pose: roomPoseSchema }),
  z.object({ type: z.literal('state'), state: roomStateSchema }),
]);
export type RoomServerMessage = z.infer<typeof roomServerMessageSchema>;

export type RoomRole = 'presenter' | 'viewer';
