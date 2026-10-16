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
/**
 * Diseño en vivo: la foto del proyecto (JSON comprimido) y los cambios pueden ser grandes (una malla
 * nueva son cientos de taladros); solo esos mensajes pueden llegar a este tamaño [bytes].
 */
export const ROOM_DESIGN_MAX = 8 * 1024 * 1024;

/**
 * Lo que se transmite en vivo además del diseño: las tarjetas de reporte del asistente y los
 * subtítulos de la conversación (quien habla en el visor; quien mira en la web lo lee).
 */
export const roomFeedSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('card'), card: z.record(z.string(), z.unknown()) }),
  z.object({
    kind: z.literal('caption'),
    role: z.enum(['user', 'assistant']),
    text: z.string().max(2000),
  }),
  /** Alguien publicó una versión: los demás la toman como base (si no, la web decía «sin guardar»). */
  z.object({ kind: z.literal('published'), version: z.record(z.string(), z.unknown()) }),
]);
export type RoomFeed = z.infer<typeof roomFeedSchema>;

/** Foto del proyecto: JSON comprimido con gzip, en base64. `seq` cuenta los cambios de la sala. */
const designSchema = z.object({ seq: z.number().int().nonnegative(), snapshot: z.string() });
/** Cambio aplicado (operaciones del documento, en orden) que lleva del estado `seq − 1` a `seq`. */
const opsSchema = z.object({
  seq: z.number().int().positive(),
  ops: z.array(z.unknown()).max(50_000),
  label: z.string().max(200),
});
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
  /** Diseño en vivo (ver `ROOM_DESIGN_MAX`). */
  z.object({ type: z.literal('design'), ...designSchema.shape }),
  z.object({ type: z.literal('ops'), ...opsSchema.shape }),
  z.object({ type: z.literal('feed'), item: roomFeedSchema }),
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
  z.object({ type: z.literal('design'), from: z.string(), ...designSchema.shape }),
  z.object({ type: z.literal('ops'), from: z.string(), ...opsSchema.shape }),
  z.object({ type: z.literal('feed'), from: z.string(), item: roomFeedSchema }),
]);
export type RoomServerMessage = z.infer<typeof roomServerMessageSchema>;

export type RoomRole = 'presenter' | 'viewer';
